CREATE TABLE public.market_watchlist (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  label text not null,
  kind text not null default 'moeda',
  decimals integer not null default 4,
  position integer not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
CREATE UNIQUE INDEX market_watchlist_symbol_key ON public.market_watchlist (symbol);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.market_watchlist TO authenticated;
GRANT ALL ON public.market_watchlist TO service_role;
ALTER TABLE public.market_watchlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "watchlist_select" ON public.market_watchlist FOR SELECT TO authenticated USING (true);
CREATE POLICY "watchlist_insert" ON public.market_watchlist FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "watchlist_update" ON public.market_watchlist FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "watchlist_delete" ON public.market_watchlist FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

ALTER TABLE public.investments
  ADD COLUMN asset_type text not null default 'manual',
  ADD COLUMN symbol text,
  ADD COLUMN quantity numeric,
  ADD COLUMN annual_rate numeric;