CREATE TABLE public.profit_month_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month date NOT NULL CHECK (EXTRACT(DAY FROM month) = 1),
  share_id uuid NOT NULL REFERENCES public.profit_shares(id) ON DELETE RESTRICT,
  product_id uuid,
  percent numeric(7,3) NOT NULL CHECK (percent > 0 AND percent <= 100),
  profit_usd numeric(20,4) NOT NULL,
  allocation_usd numeric(20,4) NOT NULL,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (month, share_id)
);
CREATE INDEX profit_month_closures_share_month ON public.profit_month_closures(share_id, month);
ALTER TABLE public.profit_month_closures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profit_month_closures FROM anon, authenticated;
GRANT SELECT, INSERT ON public.profit_month_closures TO authenticated;
GRANT ALL ON public.profit_month_closures TO service_role;
CREATE POLICY profit_month_closures_admin_read ON public.profit_month_closures FOR SELECT TO authenticated
USING (public.is_admin((SELECT auth.uid())));
CREATE POLICY profit_month_closures_admin_insert ON public.profit_month_closures FOR INSERT TO authenticated
WITH CHECK (public.is_admin((SELECT auth.uid())) AND created_by = (SELECT auth.uid())
  AND month <= date_trunc('month', current_date)::date
  AND product_id IS NOT DISTINCT FROM (SELECT s.product_id FROM public.profit_shares s WHERE s.id = share_id)
  AND percent = (SELECT s.percent FROM public.profit_shares s WHERE s.id = share_id));
NOTIFY pgrst, 'reload schema';