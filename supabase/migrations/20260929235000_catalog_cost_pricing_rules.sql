alter table public.digital_catalogs add column if not exists pricing_rules jsonb;
do $$ begin
 if not exists (select 1 from pg_constraint where conname = 'catalog_pricing_rules_object' and conrelid = 'public.digital_catalogs'::regclass) then
 alter table public.digital_catalogs add constraint catalog_pricing_rules_object check (pricing_rules is null or jsonb_typeof(pricing_rules) = 'object');
 end if;
end $$;
