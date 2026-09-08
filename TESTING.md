# Hermes v2 - Manual Testing Guide

This guide provides step-by-step instructions for manually testing the Hermes v2 email triage system.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Local Setup](#local-setup)
- [Running Automated Tests](#running-automated-tests)
- [Manual Testing Scenarios](#manual-testing-scenarios)
  - [1. Complete Approval Flow](#1-complete-approval-flow)
  - [2. Redraft with Feedback](#2-redraft-with-feedback)
  - [3. Rejection Flow](#3-rejection-flow)
  - [4. Trailing Emails](#4-trailing-emails)
  - [5. Edge Cases](#5-edge-cases)
- [Production Smoke Tests](#production-smoke-tests)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before testing, ensure you have:

1. **Python 3.11+** installed
2. **PostgreSQL** database running (Supabase or local)
3. **Environment variables** configured (see `.env.example`)
4. **API Keys** for:
   - Anthropic Claude API
   - SendGrid
   - Twilio WhatsApp
5. **Test dependencies** installed:
   ```bash
   pip install -r requirements.txt
   ```

---

## Local Setup

### 1. Database Setup

```bash
# Create test database
psql -U postgres -c "CREATE DATABASE hermes_test;"

# Run migrations (if applicable)
# python manage.py migrate
```

### 2. Environment Variables

Create a `.env.test` file with test credentials:

```bash
ENVIRONMENT=development

# Database
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
DATABASE_URL=postgresql://postgres:password@localhost:5432/hermes_test

# LLM
ANTHROPIC_API_KEY=your-anthropic-key

# Email
SENDGRID_API_KEY=your-sendgrid-key
INTAKE_EMAIL_ADDRESS=test@yourcompany.com
FROM_EMAIL=support@yourcompany.com

# WhatsApp
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-token
TWILIO_WHATSAPP_NUMBER=whatsapp:+15555555555
```

### 3. Start Development Server

```bash
uvicorn src.main:app --reload --port 8000
```

### 4. Expose Local Server (for webhooks)

Use ngrok to expose your local server for webhook testing:

```bash
ngrok http 8000
```

Note the HTTPS URL (e.g., `https://abc123.ngrok.io`) for webhook configuration.

---

## Running Automated Tests

### Run All Tests

```bash
pytest tests/ -v
```

### Run Specific Test Suites

```bash
# Unit tests only
pytest tests/unit/ -v

# Integration tests only
pytest tests/integration/ -v

# Specific test file
pytest tests/integration/test_approval_flow.py -v

# Specific test
pytest tests/unit/test_email_service.py::TestEmailService::test_extract_reply_content_simple -v
```

### Run with Coverage

```bash
pytest tests/ --cov=src --cov-report=html
```

Open `htmlcov/index.html` to view coverage report.

---

## Manual Testing Scenarios

### 1. Complete Approval Flow

**Objective:** Test the full email-to-send workflow with approval.

**Steps:**

1. **Send Test Email**
   - From: `customer@example.com`
   - To: `test@yourcompany.com` (your intake email)
   - Subject: "Question about refund policy"
   - Body: "Hi, I'd like to know about your refund policy for returns within 30 days."

2. **Verify Workflow Started**
   - Check logs for: `"Email received: Question about refund policy"`
   - Check database: Thread created in `threads` table
   - Check database: Draft created in `drafts` table with status `pending`

3. **Verify WhatsApp Notification Sent**
   - Reviewer receives WhatsApp message with:
     - Customer email
     - Subject
     - Confidence score
     - Draft content
     - Reply with: `APPROVE`, `FEEDBACK: [text]`, or `REJECT`

4. **Send Approval**
   - Reply to WhatsApp message with: `APPROVE`

5. **Verify Email Sent**
   - Customer receives reply email from `support@yourcompany.com`
   - Subject: `Re: Question about refund policy`
   - Body contains drafted response
   - Headers include `In-Reply-To` and `References` for threading

6. **Verify Database Updates**
   - Draft status updated to `sent`
   - Thread status updated to `completed`
   - Events logged: `draft_approved`, `email_sent`

**Expected Result:** ✅ Customer receives helpful reply email within seconds of approval.

---

### 2. Redraft with Feedback

**Objective:** Test feedback loop requiring draft revision.

**Steps:**

1. **Send Test Email**
   - From: `customer@example.com`
   - To: `test@yourcompany.com`
   - Subject: "Billing question"
   - Body: "I was charged twice for my order."

2. **Verify Draft v1 Created**
   - Reviewer receives WhatsApp with draft v1

3. **Provide Feedback**
   - Reply to WhatsApp: `FEEDBACK: Please mention our refund timeline of 3-5 business days`

4. **Verify Draft v2 Created**
   - System creates new draft (v2) incorporating feedback
   - Old draft (v1) marked as `rejected`
   - Reviewer receives WhatsApp with draft v2
   - WhatsApp message includes: "New draft v2 created with your feedback"

5. **Approve Draft v2**
   - Reply to WhatsApp: `APPROVE`

6. **Verify Email Sent**
   - Customer receives email with v2 content (including 3-5 day timeline)

**Expected Result:** ✅ Draft v2 incorporates feedback and is sent after approval.

---

### 3. Rejection Flow

**Objective:** Test rejection workflow (no email sent).

**Steps:**

1. **Send Test Email**
   - From: `customer@example.com`
   - To: `test@yourcompany.com`
   - Subject: "Spam message"
   - Body: "Buy cheap products now!"

2. **Verify Draft Created**
   - Reviewer receives WhatsApp with draft

3. **Reject Draft**
   - Reply to WhatsApp: `REJECT`

4. **Verify Rejection Handled**
   - Draft status updated to `rejected`
   - Thread status updated to `rejected`
   - Event logged: `draft_rejected`
   - NO email sent to customer

5. **Verify Confirmation**
   - Reviewer receives WhatsApp confirmation: "Draft rejected. No email sent."

**Expected Result:** ✅ No email sent to customer, rejection logged in database.

---

### 4. Trailing Emails

**Objective:** Test handling of follow-up emails in existing thread.

**Steps:**

1. **Send Initial Email**
   - From: `customer@example.com`
   - To: `test@yourcompany.com`
   - Subject: "Order status"
   - Body: "Where is my order?"
   - Note the Message-ID from headers

2. **Approve and Send Reply**
   - Approve draft via WhatsApp
   - Customer receives reply

3. **Send Follow-up Email**
   - From: `customer@example.com`
   - To: `test@yourcompany.com`
   - Subject: "Re: Order status"
   - Body: "Thank you! One more question - can I change the shipping address?"
   - Headers must include:
     ```
     In-Reply-To: <original-message-id>
     References: <original-message-id>
     ```

4. **Verify Thread Detection**
   - System finds existing thread by Message-ID
   - New draft created in SAME thread (not new thread)
   - Draft version_number = 2 (or next available)

5. **Approve Follow-up**
   - Approve via WhatsApp
   - Email sent with proper threading headers

**Expected Result:** ✅ Follow-up email creates new draft in existing thread, maintains conversation history.

---

### 5. Edge Cases

#### 5.1 No Pending Drafts

**Test:** Send `APPROVE` when no drafts are pending.

**Expected:** Receive WhatsApp message: "No pending drafts found. All caught up!"

---

#### 5.2 Unknown Reviewer

**Test:** Send WhatsApp message from unregistered number.

**Expected:** Receive error message: "Unauthorized reviewer"

---

#### 5.3 Unknown Command

**Test:** Send invalid WhatsApp command: `DELETE`

**Expected:** Receive help message with valid commands:
```
Commands:
- APPROVE: Send draft to customer
- FEEDBACK: [text]: Request revision
- REJECT: Discard draft
```

---

#### 5.4 Empty Email Body

**Test:** Send email with no body content (only subject).

**Expected:** System processes subject as content, creates draft.

---

#### 5.5 Very Long Email

**Test:** Send email with 5000+ character body.

**Expected:** System processes entire email (may truncate for LLM if needed).

---

#### 5.6 Malformed Headers

**Test:** Send email with missing or malformed Message-ID.

**Expected:** System creates new thread, generates synthetic Message-ID.

---

## Production Smoke Tests

Run these tests after deployment to verify production environment:

Start with the safe, read-only checks:

```bash
bash scripts/check_live_connectivity.sh https://your-production-url.com
```

The webhook `POST` examples below create production records and may send a real
WhatsApp notification. Run them only after the public domain, SendGrid, and
Twilio configuration are confirmed.

### 1. Health Check

```bash
curl https://your-production-url.com/health
```

**Expected:**
```json
{
  "status": "healthy",
  "version": "2.0.0"
}
```

---

### 2. SendGrid Webhook

```bash
curl -X POST https://your-production-url.com/webhooks/email \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "from=test@example.com" \
  -d "subject=Test" \
  -d "text=Test body" \
  -d 'headers=Message-ID: <test@example.com>
From: test@example.com
Subject: Test'
```

**Expected:** Status 200, workflow started.

---

### 3. Twilio WhatsApp Webhook

Twilio sends `application/x-www-form-urlencoded` data and production verifies
its `X-Twilio-Signature`; configure the callback in Twilio and test by replying
to an actual WhatsApp draft. Do not send an unsigned `curl` request to the
production endpoint.

For local development only, the JSON request below remains supported:

```bash
curl -X POST http://localhost:8000/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "From": "whatsapp:+1234567890",
    "To": "whatsapp:+15555555555",
    "Body": "APPROVE",
    "MessageSid": "test-sid"
  }'
```

**Expected:** Status 200, action processed.

---

### 4. Database Connection

Verify database is accessible:

```bash
psql $DATABASE_URL -c "SELECT COUNT(*) FROM threads;"
```

**Expected:** Returns count without error.

---

### 5. End-to-End Production Test

1. Send real email to intake address
2. Verify WhatsApp notification received
3. Approve via WhatsApp
4. Verify customer receives reply
5. Check logs for any errors
6. Verify all database records created correctly

---

## Troubleshooting

### Tests Failing with "No module named 'pytest_asyncio'"

**Solution:**
```bash
pip install pytest-asyncio pytest-mock pytest-cov
```

---

### "Database connection refused"

**Solution:**
1. Verify PostgreSQL is running
2. Check `DATABASE_URL` in `.env`
3. Ensure test database exists:
   ```bash
   psql -U postgres -c "CREATE DATABASE hermes_test;"
   ```

---

### "Anthropic API Key invalid"

**Solution:**
1. Verify `ANTHROPIC_API_KEY` in `.env`
2. Test API key:
   ```bash
   curl https://api.anthropic.com/v1/messages \
     -H "x-api-key: $ANTHROPIC_API_KEY" \
     -H "anthropic-version: 2023-06-01"
   ```

---

### WhatsApp Webhook Not Receiving Messages

**Solution:**
1. Verify Twilio webhook URL is correct: `https://your-url/webhooks/whatsapp`
2. Check ngrok is running for local testing
3. Verify Twilio WhatsApp number is configured
4. Check Twilio logs for delivery failures

---

### Email Not Threading Correctly

**Solution:**
1. Verify `In-Reply-To` and `References` headers present
2. Check Message-ID format: `<unique-id@domain>`
3. Ensure thread detection logic in `get_thread_by_message_id` works
4. Check database `threads` table for existing thread

---

### LangGraph Workflow Not Resuming

**Solution:**
1. Verify LangGraph checkpoint configuration
2. Check `thread_id` matches between email and WhatsApp
3. Ensure draft lookup finds correct pending draft
4. Check database `drafts` table for status `pending`

---

## Test Data Cleanup

After testing, clean up test data:

```sql
-- Delete test threads
DELETE FROM threads WHERE customer_email LIKE '%@example.com';

-- Delete test drafts
DELETE FROM drafts WHERE thread_id IN (
  SELECT id FROM threads WHERE customer_email LIKE '%@example.com'
);

-- Delete test events
DELETE FROM events WHERE thread_id IN (
  SELECT id FROM threads WHERE customer_email LIKE '%@example.com'
);
```

---

## Next Steps

1. **Automated Integration Tests**: Run `pytest tests/integration/` to verify all workflows
2. **Performance Testing**: Load test with multiple concurrent emails
3. **Security Testing**: Test injection attacks, XSS, authentication bypass
4. **Monitoring**: Set up alerts for failed workflows, API errors, high latency
5. **Documentation**: Update README with production deployment guide

---

**Last Updated:** 2024-01-15
**Version:** 2.0.0
**Maintained By:** Hermes Development Team
