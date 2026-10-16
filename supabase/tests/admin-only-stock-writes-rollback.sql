begin; set local role authenticated; do $test$ declare a record; changed int; begin
 for a in select * from jsonb_to_recordset('[{"id":"0636dd87-9dc6-4e15-98ff-38b2b737e712","full_name":"Bafo","roles":["entregador"]},{"id":"57c53de5-68d5-4e85-9c58-93edb2020a4d","full_name":"Bombom","roles":["vendedor"]},{"id":"a1fb4237-ff9b-48bc-b70c-7d9eb13e334a","full_name":"Deolane","roles":["vendedor"]},{"id":"00e217fd-ed3e-4442-85c7-8e36c6c872ad","full_name":"Enzo Cabello","roles":["vendedor"]},{"id":"60f8d872-1e03-4fa3-bd85-f50dd17140cd","full_name":"Formiga","roles":["entregador"]},{"id":"97fcba8e-ee4e-4604-989d-65e31a2b3663","full_name":"Isabella","roles":["vendedor"]},{"id":"a2743608-164f-5657-8cfe-29e73570efef","full_name":"Jair","roles":["vendedor"]},{"id":"a3be1bf1-fd1d-4cf2-bfa0-8a1ef2484efd","full_name":"Jorge Luiz","roles":["vendedor"]},{"id":"f4ae3171-756f-446d-8753-9d181b97163d","full_name":"kaliu","roles":["vendedor"]},{"id":"0ba76e9c-9bf5-411b-bf4a-5b1913b81895","full_name":"Paola","roles":["entregador"]},{"id":"2046cc11-d5f8-4e23-b813-222b3e56a662","full_name":"Patrick","roles":["gestor"]},{"id":"b272afb7-6ac4-4968-b40d-e8162a473a7c","full_name":"Renata Vitoria","roles":["vendedor"]}]'::jsonb) as x(id uuid,full_name text,roles jsonb) loop
 perform set_config('request.jwt.claim.sub',a.id::text,true);
 begin
 update public.warehouses set name=name;
 get diagnostics changed=row_count;
 if changed<>0 then raise exception 'Non-admin warehouse edit accepted for %',a.full_name; end if;
 exception when insufficient_privilege then null; end;
 begin
 update public.warehouse_inventory set quantity=quantity;
 get diagnostics changed=row_count;
 if changed<>0 then raise exception 'Non-admin stock edit accepted for %',a.full_name; end if;
 exception when insufficient_privilege then null; end;
 begin
 perform public.inventory_replenish(null,null,1);
 raise exception 'Manual replenish allowed';
 exception when insufficient_privilege then null; end;
 begin
 perform public.purchase_create(null,null,'USD',current_date,current_date,'[]'::jsonb);
 raise exception 'Manual purchase allowed';
 exception when insufficient_privilege then null; end;
 begin
 perform public.purchase_from_supplier_lots(null,null,'USD',current_date,current_date,'[]'::jsonb,0,0,null,'cf25abd8-ed9d-438d-8b09-85e27a71e808');
 raise exception 'Forged admin actor accepted';
 exception when insufficient_privilege then null; end;
 end loop;
 end $test$;
 select 'PASS: all 12 non-admin accounts denied manual stock edits, purchasing and replenishment' result; rollback;