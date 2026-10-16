begin; set local role authenticated;
create temporary table stock_probe(name text,old_visible_warehouses int,warehouses int,brazil_warehouses_with_stock int,available numeric,can_see_cost boolean,error text) on commit drop;
do $test$ declare a record; data jsonb; old_count int; begin
 for a in select * from jsonb_to_recordset('[{"id":"0636dd87-9dc6-4e15-98ff-38b2b737e712","full_name":"Bafo","roles":["entregador"]},{"id":"28d111b5-1d7d-4555-8c9d-4b5d04fea4b8","full_name":"Bia","roles":["admin"]},{"id":"57c53de5-68d5-4e85-9c58-93edb2020a4d","full_name":"Bombom","roles":["vendedor"]},{"id":"a1fb4237-ff9b-48bc-b70c-7d9eb13e334a","full_name":"Deolane","roles":["vendedor"]},{"id":"00e217fd-ed3e-4442-85c7-8e36c6c872ad","full_name":"Enzo Cabello","roles":["vendedor"]},{"id":"60f8d872-1e03-4fa3-bd85-f50dd17140cd","full_name":"Formiga","roles":["entregador"]},{"id":"97fcba8e-ee4e-4604-989d-65e31a2b3663","full_name":"Isabella","roles":["vendedor"]},{"id":"a2743608-164f-5657-8cfe-29e73570efef","full_name":"Jair","roles":["vendedor"]},{"id":"a3be1bf1-fd1d-4cf2-bfa0-8a1ef2484efd","full_name":"Jorge Luiz","roles":["vendedor"]},{"id":"90a39e4e-4529-4929-b682-33377cf34080","full_name":"Junior","roles":["admin","vendedor"]},{"id":"f4ae3171-756f-446d-8753-9d181b97163d","full_name":"kaliu","roles":["vendedor"]},{"id":"0ba76e9c-9bf5-411b-bf4a-5b1913b81895","full_name":"Paola","roles":["entregador"]},{"id":"2046cc11-d5f8-4e23-b813-222b3e56a662","full_name":"Patrick","roles":["gestor"]},{"id":"b272afb7-6ac4-4968-b40d-e8162a473a7c","full_name":"Renata Vitoria","roles":["vendedor"]},{"id":"7f511f75-2c4e-44a9-a8f6-c3c718ab2c43","full_name":"rubens","roles":["superadmin","vendedor"]},{"id":"cf25abd8-ed9d-438d-8b09-85e27a71e808","full_name":"zé","roles":["admin","vendedor"]}]'::jsonb) as x(id uuid,full_name text,roles jsonb) loop
  perform set_config('request.jwt.claim.sub',a.id::text,true);
  select count(*) into old_count from public.warehouses where is_active;
  begin
   data:=public.integral_dashboard_stock();
   if a.roles ? 'vendedor' and not (a.roles ? 'admin' or a.roles ? 'superadmin') then
    if exists(select 1 from jsonb_array_elements(data->'inventory') i where not exists(select 1 from jsonb_array_elements(public.integral_sales_catalog()->'items') c where c->>'id'=i->>'id')) then raise exception 'Unassigned item exposed'; end if;
    if exists(select 1 from jsonb_array_elements(data->'balances') b where (b->>'quantity')::numeric>0 and not exists(select 1 from jsonb_array_elements(public.estadual_seller_warehouse_stock()) allowed where allowed->>'warehouse_id'=b->>'warehouse_id' and allowed->>'item_id'=b->>'item_id' and (allowed->>'available')::numeric=(b->>'quantity')::numeric)) then raise exception 'Stock differs from seller sales permission'; end if;
   end if;
   if not (data->>'canSeeCost')::boolean and exists(select 1 from jsonb_array_elements(data->'inventory') i where i->'cost'<>'null'::jsonb) then raise exception 'Cost exposed'; end if;
   insert into stock_probe select a.full_name,old_count,jsonb_array_length(data->'warehouses'),
     (select count(*) from jsonb_array_elements(data->'warehouses') w where upper(w->>'country') in ('BR','BRASIL','BRAZIL','BRA') and exists(select 1 from jsonb_array_elements(data->'balances') b where b->>'warehouse_id'=w->>'id' and (b->>'quantity')::numeric>0)),
     (select coalesce(sum((b->>'quantity')::numeric),0) from jsonb_array_elements(data->'balances') b),
     (data->>'canSeeCost')::boolean,null;
  exception when others then insert into stock_probe values(a.full_name,old_count,null,null,null,null,sqlstate||': '||sqlerrm);
  end;
 end loop;
end $test$;
select * from stock_probe order by name;
rollback;