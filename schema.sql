-- Hermes Database Schema
-- Run this SQL in your Supabase SQL Editor to set up the database

-- Create status enum type
CREATE TYPE meeting_status AS ENUM (
  'pending',
  'approved',
  'rejected',
  'rescheduled',
  'auto_confirmed',
  'needs_callback'
);

-- Create action enum type
CREATE TYPE meeting_action_type AS ENUM (
  'approved',
  'rejected',
  'rescheduled',
  'reassigned',
  'needs_callback'
);

-- Create meeting_requests table
CREATE TABLE IF NOT EXISTS meeting_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_name TEXT NOT NULL,
  doctor_name TEXT NOT NULL,
  requested_time TIMESTAMPTZ NOT NULL,
  reason_for_visit TEXT NOT NULL,
  status meeting_status NOT NULL DEFAULT 'pending',
  confidence_score NUMERIC(3, 2) DEFAULT 0.00,
  flag_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create meeting_actions table (audit log)
CREATE TABLE IF NOT EXISTS meeting_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES meeting_requests(id) ON DELETE CASCADE,
  patient_name TEXT NOT NULL,
  doctor_name TEXT NOT NULL,
  requested_time TIMESTAMPTZ NOT NULL,
  reason_for_visit TEXT NOT NULL,
  action meeting_action_type NOT NULL,
  acted_by TEXT NOT NULL,
  new_time TIMESTAMPTZ,
  new_doctor TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_meeting_requests_status ON meeting_requests(status);
CREATE INDEX IF NOT EXISTS idx_meeting_requests_created_at ON meeting_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meeting_actions_request_id ON meeting_actions(request_id);
CREATE INDEX IF NOT EXISTS idx_meeting_actions_created_at ON meeting_actions(created_at DESC);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_meeting_requests_updated_at
  BEFORE UPDATE ON meeting_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS) - adjust policies based on your auth setup
ALTER TABLE meeting_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_actions ENABLE ROW LEVEL SECURITY;

-- Create policies (adjust these based on your authentication requirements)
-- For now, allow all operations for authenticated users
CREATE POLICY "Enable all operations for authenticated users" ON meeting_requests
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Enable all operations for authenticated users" ON meeting_actions
  FOR ALL USING (true) WITH CHECK (true);

-- Enable Realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE meeting_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE meeting_actions;
