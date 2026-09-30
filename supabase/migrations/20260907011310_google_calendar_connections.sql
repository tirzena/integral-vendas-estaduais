CREATE TABLE public.google_calendar_connections (
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

CREATE TABLE public.google_calendar_oauth_states (
  state text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  redirect_uri text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.google_calendar_events (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  google_event_id text NOT NULL,
  content_hash text NOT NULL,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, task_id)
);

ALTER TABLE public.google_calendar_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_calendar_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_calendar_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.google_calendar_connections TO authenticated;
GRANT SELECT ON public.google_calendar_events TO authenticated;
GRANT ALL ON public.google_calendar_connections TO service_role;
GRANT ALL ON public.google_calendar_oauth_states TO service_role;
GRANT ALL ON public.google_calendar_events TO service_role;

CREATE POLICY "google calendar connection owner read"
  ON public.google_calendar_connections FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "google calendar events owner read"
  ON public.google_calendar_events FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE INDEX google_calendar_states_expiry_idx
  ON public.google_calendar_oauth_states (expires_at);
