-- Hermes v2 Database Schema
-- AI Communications Agent (Email-to-WhatsApp Triage)
--
-- This schema supports:
-- - Thread-based email conversation tracking
-- - Multi-version draft management
-- - WhatsApp reviewer actions with reply-to-quote disambiguation
-- - Complete audit trail
-- - LangGraph Postgres checkpointer integration

-- =============================================================================
-- Core Tables
-- =============================================================================

-- threads: Email conversation threads
CREATE TABLE IF NOT EXISTS threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    -- Thread matching uses References/In-Reply-To headers, not subject
    message_id TEXT UNIQUE NOT NULL, -- Primary Message-ID from first email
    in_reply_to TEXT, -- For thread continuity
    "references" TEXT[], -- Array of all References header values (quoted - SQL keyword)
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending_review', 'resolved')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- drafts: AI-generated reply versions
CREATE TABLE IF NOT EXISTS drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    content TEXT NOT NULL,
    confidence_score NUMERIC(3, 2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'stale', 'approved', 'rejected')),
    whatsapp_message_sid TEXT UNIQUE, -- Twilio WhatsApp message SID for reply-to-quote
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (thread_id, version_number)
);

-- reviewer_actions: All reviewer interactions
CREATE TABLE IF NOT EXISTS reviewer_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draft_id UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
    reviewer_phone TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('approve', 'feedback', 'reject')),
    feedback_text TEXT, -- Only populated for 'feedback' action
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- reviewers: Active WhatsApp reviewer roster
CREATE TABLE IF NOT EXISTS reviewers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number TEXT UNIQUE NOT NULL,
    name TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- audit_log: Complete append-only audit trail
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL CHECK (event_type IN (
        'email_received',
        'intent_extracted',
        'draft_generated',
        'draft_sent_to_whatsapp',
        'reviewer_action',
        'email_sent_to_customer',
        'draft_marked_stale',
        'error'
    )),
    thread_id UUID REFERENCES threads(id) ON DELETE SET NULL,
    draft_id UUID REFERENCES drafts(id) ON DELETE SET NULL,
    reviewer_id UUID REFERENCES reviewers(id) ON DELETE SET NULL,
    actor TEXT, -- 'system', 'claude', 'reviewer:phone_number', or 'sendgrid'
    details JSONB, -- Flexible event-specific data
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- Indexes for Performance
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_threads_customer_email ON threads(customer_email);
CREATE INDEX IF NOT EXISTS idx_threads_status ON threads(status);
CREATE INDEX IF NOT EXISTS idx_threads_message_id ON threads(message_id);
CREATE INDEX IF NOT EXISTS idx_threads_created_at ON threads(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_drafts_thread_id ON drafts(thread_id);
CREATE INDEX IF NOT EXISTS idx_drafts_status ON drafts(status);
CREATE INDEX IF NOT EXISTS idx_drafts_whatsapp_sid ON drafts(whatsapp_message_sid) WHERE whatsapp_message_sid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_drafts_created_at ON drafts(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reviewer_actions_draft_id ON reviewer_actions(draft_id);
CREATE INDEX IF NOT EXISTS idx_reviewer_actions_reviewer_phone ON reviewer_actions(reviewer_phone);
CREATE INDEX IF NOT EXISTS idx_reviewer_actions_created_at ON reviewer_actions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reviewers_active ON reviewers(active) WHERE active = TRUE;

CREATE INDEX IF NOT EXISTS idx_audit_log_event_type ON audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_thread_id ON audit_log(thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_log_draft_id ON audit_log(draft_id) WHERE draft_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);

-- =============================================================================
-- Triggers for auto-updating timestamps
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_threads_updated_at
    BEFORE UPDATE ON threads
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reviewers_updated_at
    BEFORE UPDATE ON reviewers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Row Level Security (RLS)
-- =============================================================================

ALTER TABLE threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviewer_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviewers ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- For now, allow all operations (will be refined with proper auth later)
CREATE POLICY "Allow all for service role" ON threads FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON drafts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON reviewer_actions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON reviewers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON audit_log FOR ALL USING (true) WITH CHECK (true);

-- =============================================================================
-- Realtime Publication (for live updates if needed)
-- =============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE drafts;
ALTER PUBLICATION supabase_realtime ADD TABLE reviewer_actions;
ALTER PUBLICATION supabase_realtime ADD TABLE audit_log;

-- =============================================================================
-- Helper Functions
-- =============================================================================

-- Function to get the latest active draft for a thread
CREATE OR REPLACE FUNCTION get_latest_draft(thread_uuid UUID)
RETURNS TABLE (
    draft_id UUID,
    version_number INTEGER,
    content TEXT,
    confidence_score NUMERIC,
    status TEXT,
    whatsapp_message_sid TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        d.id,
        d.version_number,
        d.content,
        d.confidence_score,
        d.status,
        d.whatsapp_message_sid
    FROM drafts d
    WHERE d.thread_id = thread_uuid
        AND d.status IN ('pending', 'approved') -- Exclude stale/rejected
    ORDER BY d.version_number DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to mark all pending drafts as stale when new email arrives
CREATE OR REPLACE FUNCTION mark_pending_drafts_stale(thread_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
    rows_updated INTEGER;
BEGIN
    UPDATE drafts
    SET status = 'stale'
    WHERE thread_id = thread_uuid
        AND status = 'pending';

    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    RETURN rows_updated;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- LangGraph Checkpoint Tables
-- =============================================================================
-- Note: LangGraph's Postgres checkpointer will create these automatically
-- when initialized, but we document them here for reference:
--
-- - checkpoints: Stores graph state snapshots
-- - checkpoint_writes: Stores pending writes
-- - checkpoint_blobs: Stores large binary data
--
-- These tables are managed by LangGraph and should not be manually modified.

-- =============================================================================
-- Sample Data for Development
-- =============================================================================

-- Insert a sample reviewer (update with actual phone number)
-- INSERT INTO reviewers (phone_number, name) VALUES
--     ('whatsapp:+1234567890', 'Test Reviewer');
