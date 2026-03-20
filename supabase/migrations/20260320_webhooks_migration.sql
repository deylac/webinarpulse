-- WebinarPulse — Migration: Webhooks + Matching + Conversion
-- À exécuter dans Supabase SQL Editor

-- ============================================
-- Phase 1 : Colonnes supplémentaires sur purchases
-- ============================================
ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS systemeio_contact_id TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS webhook_payload JSONB;

-- ============================================
-- Phase 1 : Table webhook_log
-- ============================================
CREATE TABLE IF NOT EXISTS webhook_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  ip_address TEXT,
  signature_valid BOOLEAN DEFAULT false,
  processed BOOLEAN DEFAULT false,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE webhook_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "webhook_log_open" ON webhook_log FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Grant permissions
GRANT ALL ON webhook_log TO anon;
GRANT ALL ON webhook_log TO authenticated;

-- ============================================
-- Phase 2 : RPC matching pending_registrations ↔ sessions anonymes
-- ============================================
CREATE OR REPLACE FUNCTION match_pending_registrations()
RETURNS TABLE (
  registration_id UUID,
  viewer_id UUID,
  session_id UUID,
  email TEXT
) AS $$
  WITH matches AS (
    SELECT DISTINCT ON (pr.id)
      pr.id AS registration_id,
      v.id AS viewer_id,
      s.id AS session_id,
      pr.email
    FROM pending_registrations pr
    JOIN webinars w ON w.slug = pr.webinar_slug
    JOIN viewing_sessions s ON s.webinar_id = w.id
    JOIN viewers v ON v.id = s.viewer_id
    WHERE pr.matched = false
      AND v.email IS NULL
      AND s.started_at >= pr.created_at - INTERVAL '5 minutes'
      AND s.started_at <= pr.created_at + INTERVAL '30 minutes'
    ORDER BY pr.id, ABS(EXTRACT(EPOCH FROM (s.started_at - pr.created_at)))
  )
  SELECT * FROM matches
$$ LANGUAGE SQL;

-- ============================================
-- Index pour performances
-- ============================================
CREATE INDEX IF NOT EXISTS idx_pending_reg_unmatched
  ON pending_registrations (email, webinar_slug)
  WHERE matched = false;

CREATE INDEX IF NOT EXISTS idx_sessions_started
  ON viewing_sessions (started_at DESC);

CREATE INDEX IF NOT EXISTS idx_viewers_email
  ON viewers (email)
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_purchases_email
  ON purchases (email)
  WHERE cancelled_at IS NULL;
