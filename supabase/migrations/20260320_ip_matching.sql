-- WebinarPulse — Migration: IP-based matching for anonymous sessions
-- À exécuter dans Supabase SQL Editor

-- ============================================
-- 1. Ajouter client_ip à pending_registrations
-- ============================================
ALTER TABLE pending_registrations
  ADD COLUMN IF NOT EXISTS client_ip TEXT;

-- ============================================
-- 2. Améliorer le RPC match_pending_registrations
--    Matching par IP + fenêtre temps (30 min)
--    Fiable : même IP + même fenêtre = même personne
-- ============================================
CREATE OR REPLACE FUNCTION match_pending_registrations()
RETURNS TABLE (
  registration_id UUID,
  viewer_id UUID,
  session_id UUID,
  email TEXT
) AS $$
  WITH matches AS (
    SELECT DISTINCT ON (s.viewer_id)
      pr.id AS registration_id,
      v.id AS viewer_id,
      s.id AS session_id,
      pr.email
    FROM pending_registrations pr
    JOIN viewing_sessions s 
      ON s.started_at >= pr.created_at - INTERVAL '5 minutes'
      AND s.started_at <= pr.created_at + INTERVAL '60 minutes'
    JOIN viewers v ON v.id = s.viewer_id
    WHERE pr.matched = false
      AND v.email IS NULL
      AND pr.email IS NOT NULL
      -- Matching par IP si disponible (le plus fiable)
      AND (
        (pr.client_ip IS NOT NULL AND s.client_ip IS NOT NULL AND pr.client_ip = s.client_ip)
        OR
        -- Fallback : matching par webinar_slug si pas d'IP
        (pr.client_ip IS NULL AND pr.webinar_slug != '_webhook_optin'
         AND EXISTS (SELECT 1 FROM webinars w WHERE w.slug = pr.webinar_slug AND w.id = s.webinar_id))
      )
    ORDER BY s.viewer_id, ABS(EXTRACT(EPOCH FROM (s.started_at - pr.created_at)))
  )
  SELECT * FROM matches
$$ LANGUAGE SQL;

-- ============================================
-- 3. Ajouter client_ip à viewing_sessions
-- ============================================
ALTER TABLE viewing_sessions
  ADD COLUMN IF NOT EXISTS client_ip TEXT;

-- ============================================
-- 4. Index pour performances
-- ============================================
CREATE INDEX IF NOT EXISTS idx_pending_reg_ip
  ON pending_registrations (client_ip)
  WHERE client_ip IS NOT NULL AND matched = false;

CREATE INDEX IF NOT EXISTS idx_sessions_ip
  ON viewing_sessions (client_ip)
  WHERE client_ip IS NOT NULL;
