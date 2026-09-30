ALTER TABLE public.ad_metrics ADD COLUMN IF NOT EXISTS metrics jsonb;

CREATE TABLE public.ad_metric_prefs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  scope_key text NOT NULL,
  cards jsonb NOT NULL DEFAULT '[]'::jsonb,
  chart jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, scope_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_metric_prefs TO authenticated;
GRANT ALL ON public.ad_metric_prefs TO service_role;

ALTER TABLE public.ad_metric_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ad_metric_prefs_own" ON public.ad_metric_prefs
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER trg_ad_metric_prefs_updated
  BEFORE UPDATE ON public.ad_metric_prefs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();