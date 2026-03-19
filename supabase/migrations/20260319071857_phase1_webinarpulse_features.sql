-- Phase 1: Nouvelles tables et modifications pour les features Transcript Analysis + Auto-Tagging

-- 1. Table des transcripts bruts
CREATE TABLE IF NOT EXISTS public.webinar_transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webinar_id UUID NOT NULL REFERENCES public.webinars(id) ON DELETE CASCADE,
  raw_text TEXT NOT NULL,
  source_format TEXT NOT NULL,  -- 'srt', 'vtt', 'youtube_text', 'plain'
  language TEXT DEFAULT 'fr',
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT one_transcript_per_webinar UNIQUE (webinar_id)
);

-- 2. Table des chapitres thématiques
CREATE TABLE IF NOT EXISTS public.webinar_chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webinar_id UUID NOT NULL REFERENCES public.webinars(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  title TEXT NOT NULL,
  chapter_type TEXT NOT NULL,
  start_seconds INTEGER NOT NULL,
  end_seconds INTEGER NOT NULL,
  summary TEXT,
  transcript_excerpt TEXT,
  is_ai_generated BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chapters_webinar ON public.webinar_chapters(webinar_id, sort_order);

-- 3. Table des règles de tagging
CREATE TABLE IF NOT EXISTS public.tagging_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webinar_id UUID NOT NULL REFERENCES public.webinars(id) ON DELETE CASCADE,
  segment TEXT NOT NULL,
  min_percent INTEGER NOT NULL,
  max_percent INTEGER NOT NULL,
  systemeio_tag_name TEXT NOT NULL,
  systemeio_tag_id TEXT,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Table de log des syncs
CREATE TABLE IF NOT EXISTS public.tagging_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_email TEXT NOT NULL,
  webinar_id UUID NOT NULL REFERENCES public.webinars(id),
  segment TEXT NOT NULL,
  systemeio_tag_name TEXT NOT NULL,
  systemeio_contact_id TEXT,
  status TEXT NOT NULL,
  error_message TEXT,
  processed_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Colonne tagged_at sur viewing_sessions
ALTER TABLE public.viewing_sessions
ADD COLUMN IF NOT EXISTS tagged_at TIMESTAMPTZ DEFAULT NULL;

-- 6. RLS policies
ALTER TABLE public.webinar_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webinar_chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tagging_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tagging_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_all_transcripts" ON public.webinar_transcripts
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_chapters" ON public.webinar_chapters
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_tagging_rules" ON public.tagging_rules
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_tagging_log" ON public.tagging_log
  FOR ALL USING (true) WITH CHECK (true);

-- 7. RPC pour l'auto-tagging (récupère les sessions non taguées, agrégées par viewer+webinaire)
CREATE OR REPLACE FUNCTION get_untagged_sessions()
RETURNS TABLE (
  viewer_email TEXT,
  webinar_id UUID,
  best_percent REAL,
  session_ids UUID[]
) AS $$
  SELECT
    v.email AS viewer_email,
    s.webinar_id,
    MAX(s.max_video_percent) AS best_percent,
    ARRAY_AGG(s.id) AS session_ids
  FROM viewing_sessions s
  JOIN viewers v ON v.id = s.viewer_id
  WHERE s.tagged_at IS NULL
    AND v.email IS NOT NULL
    AND s.max_video_percent > 0
    AND s.started_at < NOW() - INTERVAL '1 hour'
  GROUP BY v.email, s.webinar_id
$$ LANGUAGE SQL;
