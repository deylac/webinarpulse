-- Phase 0: Suppression des tables héritées (ancien projet "Flow")
-- Ces tables ne sont pas utilisées par WebinarPulse

DROP TABLE IF EXISTS public.credit_history CASCADE;
DROP TABLE IF EXISTS public.user_audiences CASCADE;
DROP TABLE IF EXISTS public.user_credits CASCADE;
DROP TABLE IF EXISTS public.user_profiles CASCADE;
