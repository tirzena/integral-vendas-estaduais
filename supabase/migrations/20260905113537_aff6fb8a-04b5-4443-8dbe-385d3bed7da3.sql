CREATE TABLE public.ad_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid REFERENCES public.meta_integrations(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  metric_date date NOT NULL DEFAULT current_date,
  campaign text,
  spend numeric NOT NULL DEFAULT 0,
  currency public.currency_code NOT NULL DEFAULT 'USD',
  impressions integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  leads integer NOT NULL DEFAULT 0,
  conversions integer NOT NULL DEFAULT 0,
  revenue numeric NOT NULL DEFAULT 0,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_metrics TO authenticated;
GRANT ALL ON public.ad_metrics TO service_role;

ALTER TABLE public.ad_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ad_metrics_select" ON public.ad_metrics FOR SELECT TO authenticated USING (true);
CREATE POLICY "ad_metrics_insert" ON public.ad_metrics FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "ad_metrics_update" ON public.ad_metrics FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "ad_metrics_delete" ON public.ad_metrics FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

CREATE INDEX idx_ad_metrics_product ON public.ad_metrics(product_id);
CREATE INDEX idx_ad_metrics_integration ON public.ad_metrics(integration_id);
CREATE INDEX idx_ad_metrics_date ON public.ad_metrics(metric_date);

CREATE TRIGGER trg_ad_metrics_updated BEFORE UPDATE ON public.ad_metrics
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();