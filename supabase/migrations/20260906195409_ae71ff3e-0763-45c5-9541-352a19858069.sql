CREATE TABLE public.cash_registers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  opened_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  closed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  opening_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  closing_amount NUMERIC(14,2),
  currency public.currency_code NOT NULL DEFAULT 'BRL',
  status TEXT NOT NULL DEFAULT 'aberto',
  notes TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.cash_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  register_id UUID REFERENCES public.cash_registers(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'entrada',
  category TEXT,
  description TEXT,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency public.currency_code NOT NULL DEFAULT 'BRL',
  payment_method TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cash_registers_status ON public.cash_registers(status);
CREATE INDEX idx_cash_movements_register ON public.cash_movements(register_id);
CREATE INDEX idx_cash_movements_date ON public.cash_movements(occurred_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_registers TO authenticated;
GRANT ALL ON public.cash_registers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_movements TO authenticated;
GRANT ALL ON public.cash_movements TO service_role;

ALTER TABLE public.cash_registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cash_registers_read" ON public.cash_registers FOR SELECT TO authenticated USING (true);
CREATE POLICY "cash_registers_insert" ON public.cash_registers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "cash_registers_update" ON public.cash_registers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "cash_registers_delete" ON public.cash_registers FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "cash_movements_read" ON public.cash_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "cash_movements_insert" ON public.cash_movements FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "cash_movements_update" ON public.cash_movements FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "cash_movements_delete" ON public.cash_movements FOR DELETE TO authenticated USING (public.is_admin(auth.uid()) OR created_by = auth.uid());

CREATE TRIGGER trg_cash_registers_updated BEFORE UPDATE ON public.cash_registers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();