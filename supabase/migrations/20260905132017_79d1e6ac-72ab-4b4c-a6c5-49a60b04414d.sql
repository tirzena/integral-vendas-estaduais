ALTER TABLE public.internal_notices ADD COLUMN IF NOT EXISTS show_on_login boolean NOT NULL DEFAULT false;

GRANT SELECT ON public.internal_notices TO anon;

DROP POLICY IF EXISTS internal_notices_public_login ON public.internal_notices;
CREATE POLICY internal_notices_public_login ON public.internal_notices
  FOR SELECT TO anon
  USING (
    show_on_login = true
    AND archived = false
    AND publish_at <= now()
    AND (expires_at IS NULL OR expires_at > now())
  );