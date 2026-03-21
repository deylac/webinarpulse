-- Phase 5: Diagnostic history for before/after comparison
CREATE TABLE IF NOT EXISTS diagnostic_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webinar_id UUID REFERENCES webinars(id) ON DELETE CASCADE,
  insights JSONB NOT NULL,
  stats_snapshot JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Allow public access (RLS managed by Supabase anon key)
ALTER TABLE diagnostic_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on diagnostic_history"
  ON diagnostic_history FOR ALL
  USING (true)
  WITH CHECK (true);

-- Index for fast lookups by webinar
CREATE INDEX idx_diagnostic_history_webinar ON diagnostic_history(webinar_id, created_at DESC);
