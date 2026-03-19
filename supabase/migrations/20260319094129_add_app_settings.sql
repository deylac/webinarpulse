-- Table pour stocker les paramètres applicatifs (clés API utilisateur, etc.)
CREATE TABLE IF NOT EXISTS public.app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_all_app_settings" ON public.app_settings
  FOR ALL USING (true) WITH CHECK (true);

-- Insérer une valeur placeholder pour la clé Systeme.io
INSERT INTO public.app_settings (key, value) VALUES ('systemeio_api_key', '')
ON CONFLICT (key) DO NOTHING;
