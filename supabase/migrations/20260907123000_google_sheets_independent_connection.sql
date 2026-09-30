ALTER TABLE public.google_calendar_oauth_states
  ADD COLUMN IF NOT EXISTS service text NOT NULL DEFAULT 'calendar',
  ADD COLUMN IF NOT EXISTS return_path text;

ALTER TABLE public.google_calendar_oauth_states
  DROP CONSTRAINT IF EXISTS google_calendar_oauth_states_service_check;

ALTER TABLE public.google_calendar_oauth_states
  ADD CONSTRAINT google_calendar_oauth_states_service_check
  CHECK (service IN ('calendar', 'sheets'));

CREATE TABLE IF NOT EXISTS public.google_sheets_connections (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  google_email text,
  access_token_encrypted text NOT NULL,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  scopes text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'conectado',
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.google_sheets_connections ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.google_sheets_connections TO authenticated;
GRANT ALL ON public.google_sheets_connections TO service_role;

DROP POLICY IF EXISTS "google sheets connection owner read"
  ON public.google_sheets_connections;

CREATE POLICY "google sheets connection owner read"
  ON public.google_sheets_connections FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

DROP TRIGGER IF EXISTS trg_google_sheets_connections_updated
  ON public.google_sheets_connections;

CREATE TRIGGER trg_google_sheets_connections_updated
  BEFORE UPDATE ON public.google_sheets_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
