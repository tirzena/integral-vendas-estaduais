-- Preparação aditiva: escopos definidos na Direção Geral e identificadores externos.
-- Não ativa integração de vendas por si só. Cada divisão ainda precisa usar as rotinas centrais.
create table if not exists public.integral_division_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  system_code text not null check (system_code in (
    'captacao', 'vendas_estaduais', 'lideranca_regional',
    'distribuidores_municipais', 'estoques', 'fornecedores', 'transportes'
  )),
  region_code text check (region_code is null or region_code in ('norte', 'nordeste', 'centro-oeste', 'sudeste', 'sul')),
  territory_uf text check (territory_uf is null or territory_uf ~ '^[A-Z]{2}$'),
  municipality_ibge_id integer check (municipality_ibge_id is null or municipality_ibge_id between 1000000 and 9999999),
  product_id uuid references public.products(id) on delete cascade,
  can_view boolean not null default true,
  can_write boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integral_division_access_action check (can_view or can_write),
  constraint integral_division_access_territory check (
    (region_code is null or territory_uf is null) and
    (municipality_ibge_id is null or territory_uf is not null)
  )
);

create unique index if not exists integral_division_access_scope_unique
  on public.integral_division_access (user_id, system_code, coalesce(region_code, ''), coalesce(territory_uf, ''), coalesce(municipality_ibge_id, 0), coalesce(product_id::text, ''));
create index if not exists integral_division_access_user_idx on public.integral_division_access(user_id, system_code);

alter table public.integral_division_access enable row level security;
revoke all on public.integral_division_access from anon;
revoke all on public.integral_division_access from authenticated;
grant select, insert, update, delete on public.integral_division_access to authenticated;
drop policy if exists "Users read their division access" on public.integral_division_access;
drop policy if exists "Superadmins read division access" on public.integral_division_access;
drop policy if exists "Superadmins insert division access" on public.integral_division_access;
drop policy if exists "Superadmins update division access" on public.integral_division_access;
drop policy if exists "Superadmins delete division access" on public.integral_division_access;
create policy "Users read their division access" on public.integral_division_access
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Superadmins read division access" on public.integral_division_access
  for select to authenticated using (public.has_role((select auth.uid()), 'superadmin'));
create policy "Superadmins insert division access" on public.integral_division_access
  for insert to authenticated with check (public.has_role((select auth.uid()), 'superadmin'));
create policy "Superadmins update division access" on public.integral_division_access
  for update to authenticated using (public.has_role((select auth.uid()), 'superadmin'))
  with check (public.has_role((select auth.uid()), 'superadmin'));
create policy "Superadmins delete division access" on public.integral_division_access
  for delete to authenticated using (public.has_role((select auth.uid()), 'superadmin'));

-- Vínculo único entre um pedido central e sua origem, para evitar duplicatas ao reenviar.
alter table public.orders add column if not exists integration_source text;
alter table public.orders add column if not exists integration_external_id text;
create unique index if not exists orders_integration_origin_unique
  on public.orders(integration_source, integration_external_id)
  where integration_source is not null and integration_external_id is not null;

create table if not exists public.integral_sync_log (
  id uuid primary key default gen_random_uuid(),
  source_code text not null,
  external_event_id text not null,
  entity_type text not null,
  canonical_id uuid,
  status text not null check (status in ('pending', 'applied', 'rejected')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_code, external_event_id)
);
alter table public.integral_sync_log enable row level security;
revoke all on public.integral_sync_log from anon;
revoke all on public.integral_sync_log from authenticated;
grant select on public.integral_sync_log to authenticated;
drop policy if exists "Superadmins read integration log" on public.integral_sync_log;
create policy "Superadmins read integration log" on public.integral_sync_log
  for select to authenticated using (public.has_role((select auth.uid()), 'superadmin'));
-- Nenhuma política de escrita para o cliente: apenas funções centrais com contexto seguro.
