-- ============================================================
-- Leads table — full schema for the Lead Hunter pipeline
-- ============================================================

CREATE TABLE leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id text UNIQUE NOT NULL,  -- e.g. "google_places_ChIJ..." or "claude_search_..."
  company_name text NOT NULL,
  trade_category text NOT NULL,
  description text,
  address text,
  phone text,
  email text,
  website text,
  has_website boolean DEFAULT false,
  contacts jsonb DEFAULT '[]'::jsonb,
  google_place_id text UNIQUE,
  business_status text DEFAULT 'OPERATIONAL',
  collected_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,

  -- Normalized location for reporting
  city text,
  state text,

  -- Qualification
  qualification_score integer DEFAULT 0,
  qualification_reasons jsonb DEFAULT '[]'::jsonb,

  -- Enrichment
  enriched_at timestamptz,
  owner_name text,
  social_profiles jsonb,
  services jsonb,
  years_in_business integer,

  -- Status tracking
  status text DEFAULT 'new',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  notes text
);

-- Indexes for reporting
CREATE INDEX idx_leads_city ON leads (city);
CREATE INDEX idx_leads_state ON leads (state);
CREATE INDEX idx_leads_city_state ON leads (city, state);
CREATE INDEX idx_leads_trade_category ON leads (trade_category);
CREATE INDEX idx_leads_qualification_score ON leads (qualification_score);
CREATE INDEX idx_leads_status ON leads (status);

-- RLS
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON leads
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow anon select" ON leads
  FOR SELECT TO anon USING (true);
