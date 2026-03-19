-- Fix RLS policies to allow DELETE for anon role
-- The original policies used FOR ALL USING (true) which doesn't grant DELETE
-- We need explicit DELETE policies with both USING and WITH CHECK

-- Drop existing policies and recreate with full permissions
DO $$
DECLARE
  tables text[] := ARRAY[
    'webinars', 'viewers', 'viewing_sessions', 'viewing_events',
    'pending_registrations', 'purchases',
    'webinar_transcripts', 'webinar_chapters',
    'tagging_rules', 'tagging_log',
    'app_settings', 'systemeio_accounts'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Drop all existing policies on the table
    EXECUTE format('DROP POLICY IF EXISTS "Allow all for anon" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "allow_all" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Enable all for anon" ON public.%I', t);
    
    -- Create a single permissive policy that covers ALL operations
    EXECUTE format(
      'CREATE POLICY "full_access_anon" ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)',
      t
    );
  END LOOP;
END $$;

-- Also grant explicit DELETE permission to anon role on all tables
GRANT DELETE ON public.webinars TO anon;
GRANT DELETE ON public.viewers TO anon;
GRANT DELETE ON public.viewing_sessions TO anon;
GRANT DELETE ON public.viewing_events TO anon;
GRANT DELETE ON public.pending_registrations TO anon;
GRANT DELETE ON public.purchases TO anon;
GRANT DELETE ON public.webinar_transcripts TO anon;
GRANT DELETE ON public.webinar_chapters TO anon;
GRANT DELETE ON public.tagging_rules TO anon;
GRANT DELETE ON public.tagging_log TO anon;
GRANT DELETE ON public.app_settings TO anon;
GRANT DELETE ON public.systemeio_accounts TO anon;

-- Grant UPDATE too (needed for upserts)
GRANT UPDATE ON public.viewers TO anon;
GRANT UPDATE ON public.viewing_sessions TO anon;
