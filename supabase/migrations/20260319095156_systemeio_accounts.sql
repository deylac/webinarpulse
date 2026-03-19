-- Table pour stocker les comptes Systeme.io (multi-comptes)
CREATE TABLE IF NOT EXISTS public.systemeio_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,          -- ex: "Compte principal", "Agence Client X"
  api_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.systemeio_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all_systemeio_accounts" ON public.systemeio_accounts
  FOR ALL USING (true) WITH CHECK (true);

-- Ajouter une colonne sur webinars pour lier un compte SIO
ALTER TABLE public.webinars
ADD COLUMN IF NOT EXISTS systemeio_account_id UUID REFERENCES public.systemeio_accounts(id) ON DELETE SET NULL;

-- Migrer la clé existante de app_settings vers systemeio_accounts (s'il y en a une)
INSERT INTO public.systemeio_accounts (name, api_key)
SELECT 'Compte principal', value
FROM public.app_settings
WHERE key = 'systemeio_api_key' AND value != ''
ON CONFLICT DO NOTHING;
