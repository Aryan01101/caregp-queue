# PRD: AI Communications Agent (Email-to-WhatsApp Triage)

**Status:** v2 rework, replaces the original Hermes concept
**Stage:** Early build, single client, trust not yet established with end users

## 1. Problem

A business receives customer emails that need timely, accurate replies. Doing this by hand doesn't scale; letting an AI reply unsupervised isn't trustworthy yet, especially before there's any track record of the AI's drafts being good enough to send unreviewed. The system needs to let AI handle the drafting work while a human stays in control of everything that actually goes out.

## 2. Core Principle (non-negotiable for v1)

**Every outbound reply requires explicit human approval over WhatsApp. There is no confidence-based auto-send.**

This is a deliberate choice, not a placeholder. Auto-approval can be revisited once there's real usage data showing consistent draft quality, but that's a decision to earn later based on evidence, not to assume now. A confidence score is still computed per draft, but it is used only to help a reviewer prioritize attention, never to skip review.

## 3. Goals

- Ingest inbound customer emails automatically.
- Use an LLM to extract structured intent and draft a reply.
- Deliver every draft to a human reviewer over WhatsApp for approval, edits, or rejection.
- Support an iterative refinement loop: reviewer gives feedback, agent redrafts, resends, repeats until approved.
- Send the approved reply back to the customer via email.
- Keep a complete audit trail: every inbound email, every draft version, every reviewer action, every outbound send.

## 4. Non-goals for v1

- No auto-approval / confidence-based bypass.
- No web dashboard. The entire review surface is WhatsApp.
- No WhatsApp interactive buttons (Approve/Edit/Reject). Meta requires these as pre-approved message templates, which adds approval latency before the core loop is even validated. Deferred until the reply-to-quote flow is proven out; can be layered in later without changing the underlying architecture.
- No multi-tenant / multi-client generalization. This is a single-client build first.
- No support for reading a customer's or reviewer's pre-existing personal inbox (Gmail/Outlook via IMAP). v1 assumes the client provisions one dedicated intake address.

## 5. Architecture

```
Inbound email (SendGrid Inbound Parse webhook)
        │
        ▼
FastAPI endpoint receives payload
        │
        ▼
Reply-parser strips quoted history, isolates new content
        │
        ▼
LangGraph StateGraph (checkpointed to Postgres)
  ├─ extract_intent (Claude): structured fields from the new content
  ├─ draft_reply (Claude): reply grounded in extracted fields +
  │                         full thread history + all prior feedback
  └─ interrupt() ── always pauses here, no exceptions
        │
        ▼
Twilio WhatsApp: sends draft + confidence score to reviewer(s)
        │
        ├─ Reply-to-quote "approve" ─────► send_email node fires
        │
        └─ Reply-to-quote with feedback ─► loops back to draft_reply
                                             with feedback appended
                                             to context, redrafts,
                                             resends, repeats
        │
        ▼
Postgres: every email, every draft version, every WhatsApp
exchange, final approver, timestamps
```

**Compute:** GCP Cloud Run. Stateless, scales to zero between webhook invocations, cheap for single-client traffic. Two endpoints: inbound email webhook, inbound WhatsApp webhook.

**State:** Supabase Postgres. This is where the actual "memory" of the system lives, not in the compute layer. Cloud Run instances are ephemeral and share nothing between invocations, so the LangGraph `interrupt()` cannot pause in-memory waiting for a WhatsApp reply that might arrive hours later. LangGraph's Postgres checkpointer serializes graph state after every node, so "email received, draft made, waiting on approval" survives across completely separate serverless invocations.

## 6. Tech Stack

- **Backend:** FastAPI
- **Orchestration:** LangGraph, with Postgres checkpointer for durable `interrupt()` state
- **LLM:** Claude API (extraction + drafting)
- **Email inbound:** SendGrid Inbound Parse (webhook to a dedicated intake address)
- **Email outbound:** SendGrid (or existing transactional sender)
- **Review channel:** Twilio WhatsApp
- **Database:** Supabase Postgres
- **Deployment:** GCP Cloud Run

## 7. Data Model

- **`threads`**
  Matched by email `References` / `In-Reply-To` headers (not subject line, which is unreliable). Fields: `id`, `customer_email`, `subject`, `status` (`open` / `pending_review` / `resolved`), `created_at`, `updated_at`.

- **`drafts`**
  One row per draft version. Fields: `id`, `thread_id`, `version_number`, `content`, `confidence_score`, `status` (`pending` / `stale` / `approved` / `rejected`), `whatsapp_message_sid`, `created_at`.

- **`reviewer_actions`**
  Fields: `id`, `draft_id`, `reviewer_phone`, `action` (`approve` / `feedback` / `reject`), `feedback_text`, `created_at`.

- **`reviewers`**
  Fields: `id`, `phone_number`, `active`. Supports more than one person receiving the queue; a business with multiple staff who can approve replies just means multiple active rows here, no architecture change required.

- **`audit_log`**
  Append-only. Every inbound email, every draft generation, every WhatsApp send/receive, every send-to-customer, with full timestamps and actor attribution.

- LangGraph's own checkpoint tables (managed by its Postgres checkpointer) live in the same database.

## 8. Key Flows

### 8.1 New email on a new thread
1. SendGrid webhook fires on the intake address.
2. Reply-parser strips any quoted content (should be none, but defensive).
3. `extract_intent` → `draft_reply` → graph pauses at `interrupt()`.
4. Draft sent to all active reviewers via WhatsApp, with an identifiable line (sender, subject snippet) so it can be reply-to-quoted later.

### 8.2 Reply on an existing thread (quoted history)
1. Reply-parser strips the quoted tail using the customer's new text only for `extract_intent`, but the full stripped history remains available as context for `draft_reply`.

### 8.3 New email arrives while a draft on the same thread is already pending review
This is the trailing-email edge case. Resolution: **never silently rewrite a pending draft.**
1. Mark the existing pending draft `stale`.
2. Re-run `draft_reply` with the new email folded into context.
3. Send a new WhatsApp message that explicitly states the customer followed up and this draft supersedes the previous one.
4. A late "approve" on the stale message is rejected server-side (status check), since it's no longer the current version, preventing an outdated reply from firing.

### 8.4 Disambiguating which draft a WhatsApp reply refers to
When multiple threads have pending drafts at once, a bare "approve" is ambiguous. v1 resolution: **reply-to-quote.** Every draft message is sent as a distinct WhatsApp message; Twilio's webhook payload includes the SID of the message being quote-replied to. The backend maps that SID back to the specific `drafts` row via `whatsapp_message_sid`, resolving ambiguity without any new UI, since quote-reply is a gesture WhatsApp users already know.

*(Deferred: WhatsApp interactive buttons could replace this later for a cleaner UX, but require Meta template pre-approval. Not worth the latency before the core loop is validated.)*

### 8.5 Redraft loop
On feedback (not approval, not rejection), `draft_reply` re-runs with **the full accumulated context**: original email, every prior draft version, every piece of feedback given so far, not just the most recent feedback in isolation. Feeding only the latest feedback risks the redraft losing earlier corrections and contradicting itself after two or more rounds.

### 8.6 Approval and send
On "approve" reply-to-quote: the corresponding draft's content is sent to the customer via email, the thread is marked `resolved`, and the full exchange is written to `audit_log`.

## 9. Open Questions

- **Intake model:** confirm the client will provision one dedicated address for this system (simpler: SendGrid Inbound Parse, no DNS access to their existing inbox needed) rather than requiring the agent to read an existing personal/shared inbox (harder: requires IMAP/Gmail API, different architecture entirely). This PRD assumes the dedicated-address model.
- **Reviewer roster management:** for now, assume reviewer phone numbers are managed directly in the `reviewers` table (manual insert/update), not via any UI. Revisit if the client needs to self-manage this.
- **Rejection handling:** define what happens to a thread when a reviewer rejects a draft outright rather than giving feedback, does it require a fresh manual reply outside the system, or should the agent attempt a fundamentally different draft?
