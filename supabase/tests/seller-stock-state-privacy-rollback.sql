begin;
select set_config('request.jwt.claim.sub','cf25abd8-ed9d-438d-8b09-85e27a71e808',true);
create temporary table availability_fixture(id uuid) on commit drop;
with new_stock as (
 insert into public.warehouses(name,city,state,country,level,created_by)
 values('LOCAL_SECRETO_TESTE','CIDADE_SECRETA_TESTE','AM','Brasil','estado',auth.uid()) returning id
) insert into availability_fixture select id from new_stock;
grant select on availability_fixture to authenticated;
set local role authenticated;
create temporary table availability_results(name text,stock_count int,passed boolean) on commit drop;
do $test$
declare a record; data jsonb; wh jsonb; portal jsonb; target uuid; begin
 select id into target from availability_fixture;
 for a in select * from jsonb_to_recordset('[{"id":"57c53de5-68d5-4e85-9c58-93edb2020a4d","full_name":"Bombom","roles":["vendedor"]},{"id":"a1fb4237-ff9b-48bc-b70c-7d9eb13e334a","full_name":"Deolane","roles":["vendedor"]},{"id":"00e217fd-ed3e-4442-85c7-8e36c6c872ad","full_name":"Enzo Cabello","roles":["vendedor"]},{"id":"97fcba8e-ee4e-4604-989d-65e31a2b3663","full_name":"Isabella","roles":["vendedor"]},{"id":"a2743608-164f-5657-8cfe-29e73570efef","full_name":"Jair","roles":["vendedor"]},{"id":"a3be1bf1-fd1d-4cf2-bfa0-8a1ef2484efd","full_name":"Jorge Luiz","roles":["vendedor"]},{"id":"f4ae3171-756f-446d-8753-9d181b97163d","full_name":"kaliu","roles":["vendedor"]},{"id":"b272afb7-6ac4-4968-b40d-e8162a473a7c","full_name":"Renata Vitoria","roles":["vendedor"]}]'::jsonb) as x(id uuid,full_name text,roles jsonb) loop
  perform set_config('request.jwt.claim.sub',a.id::text,true);
  data:=public.integral_seller_stock_availability();
  if not exists(select 1 from jsonb_array_elements(data->'warehouses') w where w->>'id'=target::text) then raise exception 'Future admin stock missing for %',a.full_name; end if;
  if data::text like '%SECRETO_TESTE%' or data::text like '%SECRETA_TESTE%' then raise exception 'Location leaked'; end if;
  for wh in select value from jsonb_array_elements(data->'warehouses') loop
   if wh ?| array['city','address','latitude','longitude','location','street','postal_code'] then raise exception 'Precise location key exposed'; end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(data->'balances') b where b ?| array['location','cost','unit_cost','supplier_id']) then raise exception 'Internal stock fields exposed'; end if;
  if (select count(*) from public.warehouses)<>0 or (select count(*) from public.warehouse_inventory)<>0 or (select count(*) from public.inventory_item_locations)<>0 then raise exception 'Raw stock location read allowed'; end if;
  portal:=public.seller_portal_data()->'warehouses';
  if portal::text like '%SECRETO_TESTE%' or exists(select 1 from jsonb_array_elements(portal) w where w ?| array['city','address','latitude','longitude','location']) then raise exception 'Order form warehouse privacy failed'; end if;
  begin
   perform public.inventory_replenish(null,null,1);
   raise exception 'Seller replenishment accepted';
  exception when insufficient_privilege then null; end;
  begin
   perform public.purchase_create(null,null,'USD',current_date,current_date,'[]'::jsonb);
   raise exception 'Seller purchase accepted';
  exception when insufficient_privilege then null; end;
  insert into availability_results values(a.full_name,jsonb_array_length(data->'warehouses'),true);
 end loop;
end $test$;
select * from availability_results order by name;
rollback;