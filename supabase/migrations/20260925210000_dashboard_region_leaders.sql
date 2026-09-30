create table if not exists public.dashboard_region_leaders (
  region text primary key check (region in ('Norte','Nordeste','Centro-Oeste','Sudeste','Sul')),
  user_id uuid not null references public.profiles(id) on delete cascade,
  updated_at timestamptz not null default now()
);
alter table public.dashboard_region_leaders enable row level security;
create policy "Authenticated users can view regional leaders" on public.dashboard_region_leaders
  for select to authenticated using (true);
create policy "Admins can insert regional leaders" on public.dashboard_region_leaders
  for insert to authenticated with check (
    public.has_role((select auth.uid()), 'admin') or public.has_role((select auth.uid()), 'superadmin')
  );
create policy "Admins can update regional leaders" on public.dashboard_region_leaders
  for update to authenticated using (
    public.has_role((select auth.uid()), 'admin') or public.has_role((select auth.uid()), 'superadmin')
  ) with check (
    public.has_role((select auth.uid()), 'admin') or public.has_role((select auth.uid()), 'superadmin')
  );
create policy "Admins can delete regional leaders" on public.dashboard_region_leaders
  for delete to authenticated using (
    public.has_role((select auth.uid()), 'admin') or public.has_role((select auth.uid()), 'superadmin')
  );
grant select, insert, update, delete on public.dashboard_region_leaders to authenticated;

-- Normaliza os estoques existentes para as UFs usadas pelo mapa.
update public.warehouses set state = 'DF',
  city = case when coalesce(btrim(city), '') = '' then 'Brasília' else city end
where country ilike 'Brasil' and upper(state) = 'BRASILIA';
update public.warehouses set state = 'BA'
where country ilike 'Brasil' and upper(state) = 'BAHIA';
