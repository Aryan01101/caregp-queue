# Hermes v2 - AI Communications Agent (Email-to-WhatsApp Triage)

An intelligent email triage system that uses AI to draft replies and delivers them to reviewers via WhatsApp for approval before sending.

## Overview

Hermes v2 bridges email communication with WhatsApp-based human oversight. It:
1. Receives customer emails via SendGrid webhook
2. Uses Claude AI to extract intent and draft professional replies
3. Sends drafts to reviewers via WhatsApp for approval
4. Supports iterative refinement (feedback → redraft → resend)
5. Sends approved replies back to customers via email
6. Maintains complete audit trail of all interactions

## Core Principle

**Every outbound reply requires explicit human approval via WhatsApp.** There is no confidence-based auto-send. This is a deliberate design choice to ensure trust and quality before the system has proven itself.

## Architecture

```
Inbound Email (SendGrid) → FastAPI Webhook
                             ↓
                    Reply Parser (strip quoted history)
                             ↓
                    LangGraph State Machine
                    ├─ extract_intent (Claude)
                    ├─ draft_reply (Claude)
                    └─ interrupt() ← waits here
                             ↓
                    WhatsApp (Twilio)
                    ├─ "approve" → send email
                    └─ feedback → redraft loop
                             ↓
                    Postgres (Supabase)
                    └─ Audit trail + checkpoints
```

**Deployment:** GCP Cloud Run (serverless, scales to zero)
**State Persistence:** Supabase Postgres with LangGraph checkpointer

## Tech Stack

- **Backend:** Python 3.11+ with FastAPI
- **AI Orchestration:** LangGraph with Postgres checkpointer
- **LLM:** Anthropic Claude (intent extraction + reply drafting)
- **Email:** SendGrid (inbound webhook + outbound sending)
- **Messaging:** Twilio WhatsApp API
- **Database:** Supabase Postgres
- **Deployment:** GCP Cloud Run

## Project Structure

```
Hermes/
├── src/
│   ├── api/           # FastAPI endpoints (email webhook, WhatsApp webhook)
│   ├── core/          # Configuration and settings
│   ├── graph/         # LangGraph state machine
│   ├── services/      # External integrations (Claude, Twilio, SendGrid, Supabase)
│   ├── models/        # Pydantic models and schemas
│   └── utils/         # Helper functions
├── tests/             # Test suite
├── requirements.txt   # Python dependencies
├── pyproject.toml     # Development tools config
└── .env.example       # Environment template
```

## Getting Started

### Prerequisites

- Python 3.11+
- Supabase account
- Anthropic API key (Claude)
- SendGrid account
- Twilio account with WhatsApp sandbox
- GCP account (for Cloud Run deployment)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/Aryan01101/Hermes.git
   cd Hermes
   ```

2. Create virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Setup environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

5. Run database migrations (coming soon)

6. Start development server:
   ```bash
   uvicorn src.main:app --reload
   ```

## Database Schema

### `threads`
Email conversation threads tracked by References/In-Reply-To headers.

### `drafts`
AI-generated reply drafts with versioning and confidence scores.

### `reviewer_actions`
All reviewer interactions (approve, feedback, reject).

### `reviewers`
Active WhatsApp reviewer roster.

### `audit_log`
Complete append-only audit trail.

## Key Workflows

### New Email Thread
1. SendGrid webhook → email received
2. Parse and extract new content only
3. Claude extracts intent
4. Claude drafts reply
5. LangGraph pauses at `interrupt()`
6. Draft sent to all active reviewers via WhatsApp

### Approval Flow
1. Reviewer replies to WhatsApp message with "approve"
2. System maps reply-to-quote to specific draft
3. Approved reply sent to customer via SendGrid
4. Thread marked resolved
5. Full exchange written to audit log

### Feedback/Redraft Loop
1. Reviewer replies with feedback
2. Claude redrafts with full context (all prior feedback)
3. New draft sent to WhatsApp
4. Repeat until approved

### Trailing Email Edge Case
1. New email arrives on thread with pending draft
2. Existing draft marked `stale`
3. New draft created with updated context
4. WhatsApp message clarifies superseded draft
5. Late approval of stale draft rejected

## Development

### Code Quality
```bash
# Format code
black src/ tests/

# Type checking
mypy src/

# Linting
ruff src/ tests/

# Run tests
pytest
```

### Environment Variables

See `.env.example` for required configuration. Key variables:
- `ANTHROPIC_API_KEY`: Claude API access
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`: Database
- `SENDGRID_API_KEY`: Email sending
- `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN`: WhatsApp

## Deployment

### GCP Cloud Run

Coming soon: Dockerfile and deployment guide.

## Migration from v1

Hermes v1 was a Next.js healthcare appointment management system. v2 is a complete rebuild with a different purpose and architecture. See `README.v1-historical.md` for v1 documentation.

The v1 codebase is preserved in:
- Branch: `archive/v1-hermes`
- Tag: `v1.0-archived`

## Contributing

This is currently a single-client build. Multi-tenant support and other enhancements will be considered after the core loop is validated.

## License

MIT

---

## Version History

- **v2.0.0** (in development): Email-to-WhatsApp triage with LangGraph orchestration
- **v1.0.0** (archived): Healthcare appointment management with web dashboard
