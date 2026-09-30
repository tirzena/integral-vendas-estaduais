ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_date date NOT NULL DEFAULT current_date,
  ADD COLUMN IF NOT EXISTS delivery_deadline date,
  ADD COLUMN IF NOT EXISTS grace_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivered_at date,
  ADD COLUMN IF NOT EXISTS tracking_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS carrier text,
  ADD COLUMN IF NOT EXISTS tracking_code text,
  ADD COLUMN IF NOT EXISTS tracking_url text,
  ADD COLUMN IF NOT EXISTS tracking_status text,
  ADD COLUMN IF NOT EXISTS tracking_location text;

CREATE TABLE IF NOT EXISTS public.delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'em_transito',
  location text,
  notes text,
  happened_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_events TO authenticated;
GRANT ALL ON public.delivery_events TO service_role;
ALTER TABLE public.delivery_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY delivery_events_read ON public.delivery_events FOR SELECT TO authenticated USING (true);
CREATE POLICY delivery_events_write ON public.delivery_events FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY delivery_events_update ON public.delivery_events FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY delivery_events_delete ON public.delivery_events FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_delivery_events_order ON public.delivery_events(order_id);

CREATE TABLE IF NOT EXISTS public.supplier_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  issue_type text NOT NULL DEFAULT 'reclamacao',
  severity text NOT NULL DEFAULT 'media',
  description text,
  resolved_at date,
  created_by uuid REFERENCES public.profiles(id),
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_issues TO authenticated;
GRANT ALL ON public.supplier_issues TO service_role;
ALTER TABLE public.supplier_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY supplier_issues_read ON public.supplier_issues FOR SELECT TO authenticated USING (true);
CREATE POLICY supplier_issues_write ON public.supplier_issues FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY supplier_issues_update ON public.supplier_issues FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY supplier_issues_delete ON public.supplier_issues FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_supplier_issues_supplier ON public.supplier_issues(supplier_id);
CREATE TRIGGER trg_supplier_issues_updated BEFORE UPDATE ON public.supplier_issues
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();