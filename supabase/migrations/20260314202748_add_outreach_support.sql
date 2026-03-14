-- ============================================================
-- Add outreach columns to leads + outreach_log table
-- ============================================================

-- Outreach tracking on leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS outreach_status text DEFAULT 'pending';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sequence_step integer DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_follow_up_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS site_url text;

CREATE INDEX IF NOT EXISTS idx_leads_outreach_status ON leads (outreach_status);
CREATE INDEX IF NOT EXISTS idx_leads_next_follow_up ON leads (next_follow_up_at)
  WHERE next_follow_up_at IS NOT NULL;

-- Outreach log — records every message sent
CREATE TABLE IF NOT EXISTS outreach_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  sequence_step integer NOT NULL,
  channel text NOT NULL,
  subject text,
  body text NOT NULL,
  sent_at timestamptz DEFAULT now()
);

CREATE INDEX idx_outreach_log_lead_id ON outreach_log (lead_id);
CREATE INDEX idx_outreach_log_sent_at ON outreach_log (sent_at);

-- RLS for outreach_log
ALTER TABLE outreach_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Allow all for authenticated" ON outreach_log
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Allow anon select" ON outreach_log
    FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
