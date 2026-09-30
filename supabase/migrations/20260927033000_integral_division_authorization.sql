-- Consulta central de permissão para os sistemas divisionais. A sessão Supabase
-- da pessoa é obrigatória; os parâmetros descrevem o registro solicitado.
create or replace function public.integral_region_of_uf(p_uf text)
returns text language sql immutable set search_path = '' as $$
  select case upper(p_uf)
    when 'AC' then 'norte' when 'AP' then 'norte' when 'AM' then 'norte'
    when 'PA' then 'norte' when 'RO' then 'norte' when 'RR' then 'norte' when 'TO' then 'norte'
    when 'AL' then 'nordeste' when 'BA' then 'nordeste' when 'CE' then 'nordeste'
    when 'MA' then 'nordeste' when 'PB' then 'nordeste' when 'PE' then 'nordeste'
    when 'PI' then 'nordeste' when 'RN' then 'nordeste' when 'SE' then 'nordeste'
    when 'DF' then 'centro-oeste' when 'GO' then 'centro-oeste'
    when 'MT' then 'centro-oeste' when 'MS' then 'centro-oeste'
    when 'ES' then 'sudeste' when 'MG' then 'sudeste'
    when 'RJ' then 'sudeste' when 'SP' then 'sudeste'
    when 'PR' then 'sul' when 'RS' then 'sul' when 'SC' then 'sul'
    else null end;
$$;

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
      and (a.product_id is null or (p_product_id is not null and a.product_id = p_product_id))
      and (a.region_code is null or (p_state is not null and a.region_code = public.integral_region_of_uf(p_state)))
      and (a.territory_uf is null or (p_state is not null and a.territory_uf = upper(p_state)))
      and (a.municipality_ibge_id is null or (p_municipality_ibge_id is not null and a.municipality_ibge_id = p_municipality_ibge_id))
  );
$$;

revoke all on function public.integral_region_of_uf(text) from public, anon;
revoke all on function public.integral_can_access(text,text,integer,uuid,boolean) from public, anon;
grant execute on function public.integral_region_of_uf(text) to authenticated;
grant execute on function public.integral_can_access(text,text,integer,uuid,boolean) to authenticated;
