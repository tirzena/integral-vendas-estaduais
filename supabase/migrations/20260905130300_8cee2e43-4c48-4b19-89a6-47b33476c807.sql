CREATE TABLE public.profit_shares (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade,
  name text not null,
  user_id uuid references public.profiles(id) on delete set null,
  percent numeric not null default 0,
  notes text,
  active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profit_shares TO authenticated;
GRANT ALL ON public.profit_shares TO service_role;

ALTER TABLE public.profit_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profit_shares_select" ON public.profit_shares FOR SELECT TO authenticated USING (true);
CREATE POLICY "profit_shares_admin_all" ON public.profit_shares FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER update_profit_shares_updated_at BEFORE UPDATE ON public.profit_shares
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_profit_shares_product ON public.profit_shares(product_id);

INSERT INTO public.profit_shares (name, percent, notes, is_demo) VALUES
  ('Cabelo (Luyd)', 33.34, 'Divisão inicial de exemplo', true),
  ('Aquaman (Eduardo)', 33.33, 'Divisão inicial de exemplo', true),
  ('Deppe', 33.33, 'Caixa da empresa', true);