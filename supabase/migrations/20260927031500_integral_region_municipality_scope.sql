alter table public.integral_division_access
  add column if not exists region_code text check (region_code is null or region_code in ('norte', 'nordeste', 'centro-oeste', 'sudeste', 'sul')),
  add column if not exists municipality_ibge_id integer check (municipality_ibge_id is null or municipality_ibge_id between 1000000 and 9999999);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'integral_division_access_territory' and conrelid = 'public.integral_division_access'::regclass) then
    alter table public.integral_division_access add constraint integral_division_access_territory check (
      (region_code is null or territory_uf is null) and
      (municipality_ibge_id is null or territory_uf is not null)
    );
  end if;
end $$;
drop index if exists public.integral_division_access_scope_unique;
create unique index integral_division_access_scope_unique
  on public.integral_division_access (user_id, system_code, coalesce(region_code, ''), coalesce(territory_uf, ''), coalesce(municipality_ibge_id, 0), coalesce(product_id::text, ''));
