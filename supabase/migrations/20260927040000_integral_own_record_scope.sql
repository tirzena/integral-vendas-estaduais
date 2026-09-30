-- Um acesso próprio permite testar os membros existentes sem revelar pedidos de terceiros.
alter table public.integral_division_access
  add column if not exists own_records_only boolean not null default false;

-- A assinatura original continua disponível. Vínculos de registros próprios
-- só são aceitos pela função abaixo, que exige o responsável do registro.
create or replace function public.integral_can_access(
  p_system_code text,
  p_state text default null,
  p_municipality_ibge_id integer default null,
  p_product_id uuid default null,
  p_write boolean default false
) returns boolean language sql stable security invoker set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.integral_division_access a
    where a.user_id = (select auth.uid())
      and a.system_code = p_system_code
      and (case when p_write then a.can_write else a.can_view or a.can_write end)
      and not a.own_records_only
      and (a.product_id is null or (p_product_id is not null and a.product_id = p_product_id))
      and (a.region_code is null or (p_state is not null and a.region_code = public.integral_region_of_uf(p_state)))
      and (a.territory_uf is null or (p_state is not null and a.territory_uf = upper(p_state)))
      and (a.municipality_ibge_id is null or (p_municipality_ibge_id is not null and a.municipality_ibge_id = p_municipality_ibge_id))
  );
$$;

create or replace function public.integral_can_access_record(
  p_system_code text,
  p_state text default null,
  p_municipality_ibge_id integer default null,
  p_product_id uuid default null,
  p_write boolean default false,
  p_record_owner_id uuid default null
) returns boolean language sql stable security invoker set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.integral_division_access a
    where a.user_id = (select auth.uid())
      and a.system_code = p_system_code
      and (case when p_write then a.can_write else a.can_view or a.can_write end)
      and (not a.own_records_only or (p_record_owner_id is not null and p_record_owner_id = (select auth.uid())))
      and (a.product_id is null or (p_product_id is not null and a.product_id = p_product_id))
      and (a.region_code is null or (p_state is not null and a.region_code = public.integral_region_of_uf(p_state)))
      and (a.territory_uf is null or (p_state is not null and a.territory_uf = upper(p_state)))
      and (a.municipality_ibge_id is null or (p_municipality_ibge_id is not null and a.municipality_ibge_id = p_municipality_ibge_id))
  );
$$;
revoke all on function public.integral_can_access_record(text,text,integer,uuid,boolean,uuid) from public, anon;
grant execute on function public.integral_can_access_record(text,text,integer,uuid,boolean,uuid) to authenticated;
