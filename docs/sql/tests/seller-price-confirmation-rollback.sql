BEGIN;
DO $$
#variable_conflict use_variable
DECLARE admin_id uuid; seller uuid:=gen_random_uuid(); prod uuid:=gen_random_uuid(); item uuid:=gen_random_uuid(); wh uuid:=gen_random_uuid(); cid uuid; rid uuid:=gen_random_uuid(); oid uuid; args jsonb; followup jsonb; result jsonb; again jsonb; policy uuid; cur text; portal boolean; before_count bigint; offered numeric; quote jsonb;
BEGIN
 SELECT id INTO admin_id FROM public.profiles WHERE email='tirzenaadm@gmail.com';
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 INSERT INTO auth.users(id,email,raw_user_meta_data,created_at) VALUES(seller,'seller-pdv-test-'||seller||'@example.invalid','{}',now());
 UPDATE public.profiles SET is_active=true WHERE id=seller;
 INSERT INTO public.user_roles(user_id,role) VALUES(seller,'vendedor') ON CONFLICT DO NOTHING;
 INSERT INTO public.products(id,name,is_active,is_demo) VALUES(prod,'Seller Pdv controlled product',true,true);
 INSERT INTO public.product_users(product_id,user_id) VALUES(prod,seller);
 INSERT INTO public.inventory_items(id,product_id,name,unit,currency,cost,price,quantity,reserved,max_discount_percent,freight_py_percent,freight_sp_percent,freight_other_brazil_percent,is_active,is_demo) VALUES(item,prod,'Seller Pdv controlled item','UN','BRL',50,100,20,0,10,90,90,90,true,true);
 INSERT INTO public.warehouses(id,name,city,state,level,is_active) VALUES(wh,'Seller Pdv controlled warehouse','Test','SP','principal',true);
 INSERT INTO public.warehouse_inventory(warehouse_id,item_id,quantity,reserved) VALUES(wh,item,20,0);
 INSERT INTO public.integral_member_rules(user_id,general_access) VALUES(seller,true);
 INSERT INTO public.warehouse_user_assignments(user_id,product_id,warehouse_id,created_by) VALUES(seller,prod,wh,admin_id);
 INSERT INTO public.integral_division_access(user_id,system_code,can_view,can_write) VALUES(seller,'vendas_estaduais',true,true);
 policy:=public.remuneration_save_policy(NULL,jsonb_build_object('name','Seller PDV controlled policy','member_ids',jsonb_build_array(seller),'definition',jsonb_build_object('rules',jsonb_build_array(jsonb_build_object('kind','commission','type','percent','amount',5,'basis','sale','currency','BRL','period','per_sale','item_ids',jsonb_build_array(item))))),'Controlled seller PDV validation');
 PERFORM set_config('request.jwt.claim.sub',seller::text,true);
 result:=public.integral_seller_create_pdv_customer('{"name":"Cliente controlado","phone":"32999999999","document":"12345678901","email":"seller-customer@example.invalid"}');
 cid:=(result->>'id')::uuid;
 ASSERT (SELECT document='12345678901' AND email='seller-customer@example.invalid' AND created_by=seller FROM public.customers WHERE id=cid),'Customer fields not saved';
 args:=jsonb_build_object('p_kind','pre_pedido','p_customer_id',cid,'p_product_id',prod,'p_currency','BRL','p_discount',0,'p_shipping_cost',0,'p_notes','Controlled complete order','p_whatsapp','32988888888','p_items',jsonb_build_array(jsonb_build_object('item_id',item,'quantity',2,'unit_price',100,'discount',0)),'p_payments','[]'::jsonb);
 followup:=jsonb_build_object('seller_id',seller,'warehouse_id',wh,'shipping_address','Rua de teste, 10','shipping_address_number','10','shipping_city','Juiz de Fora','shipping_state','MG','shipping_country','Brasil','shipping_cep','36046040','delivery_recipient_name','Destinatário controlado','delivery_recipient_document','98765432100','order_date',current_date,'delivery_deadline',current_date+5,'carrier','Transportadora teste','tracking_code','CONTROLLED123','variable_cost',0,'item_costs','[]'::jsonb);
 result:=public.integral_seller_create_pdv_order(args,followup,'{"mode":"automatic"}',rid,true);
 again:=public.integral_seller_create_pdv_order(args,followup,'{"mode":"automatic"}',rid,true);
 oid:=(result->>'id')::uuid;
 result:=public.integral_seller_create_pdv_order(args,followup,'{"mode":"automatic"}',gen_random_uuid(),false);
 ASSERT (SELECT approval_status='pending' AND stock_state='nenhum' AND shipping_cost=0 FROM public.orders WHERE id=(result->>'id')::uuid),'General seller entry differs from estadual';
 ASSERT oid IS NOT NULL AND oid::text=again->>'id' AND (again->>'replayed')::boolean,'Idempotent seller creation failed';
 ASSERT (SELECT approval_status='pending' AND stock_state='nenhum' AND kind='pre_pedido' AND warehouse_id=wh AND shipping_cost=0 AND total=200 AND amount_paid=0 AND payment_method IS NULL FROM public.orders WHERE id=oid),'Wrong approval/freight/stock/payment state';
 ASSERT (SELECT shipping_cep='36046040' AND delivery_recipient_document='98765432100' AND delivery_recipient_name='Destinatário controlado' AND order_date=current_date AND delivery_deadline=current_date+5 AND carrier='Transportadora teste' AND tracking_code='CONTROLLED123' AND NOT tracking_enabled FROM public.orders WHERE id=oid),'Complete delivery fields not saved';
 ASSERT (SELECT quantity=20 AND reserved=0 FROM public.warehouse_inventory WHERE warehouse_id=wh AND item_id=item),'Stock reserved before approval';
 ASSERT NOT EXISTS(SELECT 1 FROM public.purchase_orders WHERE source_order_id=oid),'Supplier order created before approval';
 ASSERT NOT EXISTS(SELECT 1 FROM public.payments WHERE order_id=oid),'Payment created before approval';
 ASSERT EXISTS(SELECT 1 FROM public.notifications WHERE notification_type='order_awaiting_approval' AND user_id=admin_id AND body LIKE '%'||((SELECT number FROM public.orders WHERE id=oid)::text)||'%'),'Review notification missing';
 SELECT count(*) INTO before_count FROM public.orders WHERE seller_id=seller;
 result:=public.integral_seller_create_pdv_order(jsonb_set(args,'{p_items,0,unit_price}','1'),followup,'{"mode":"automatic"}',gen_random_uuid(),true);
 ASSERT (result->>'requires_price_confirmation')::boolean AND (result->'quote'->'items'->0->>'unit_price')::numeric=100,'Invalid price did not require confirmation';
 ASSERT (SELECT count(*)=before_count FROM public.orders WHERE seller_id=seller),'Quote created an order';
 BEGIN
  PERFORM public.integral_seller_create_pdv_order(args,jsonb_set(followup,'{seller_id}',to_jsonb(admin_id::text)),'{"mode":"automatic"}',gen_random_uuid(),true);
  RAISE EXCEPTION 'Seller reassignment accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.integral_seller_create_pdv_order(jsonb_set(args,'{p_shipping_cost}','100'),followup,'{"mode":"automatic"}',gen_random_uuid(),true);
  RAISE EXCEPTION 'Extra freight accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Frete, custos internos%' THEN RAISE; END IF; END;
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 PERFORM public.integral_decide_order(oid,'approve','Controlled complete order approval','policy',NULL,NULL);
 ASSERT (SELECT approval_status='approved' AND kind='venda' AND commission_total=10 FROM public.orders WHERE id=oid),'Approval did not produce a sale and policy commission';
 ASSERT (SELECT amount=200 AND status='pendente' AND customer_id=cid FROM public.accounts_receivable WHERE order_id=oid),'Approved seller receivable missing';
 ASSERT (SELECT quantity=20 AND reserved=2 FROM public.warehouse_inventory WHERE warehouse_id=wh AND item_id=item),'Approval did not reserve once';
 ASSERT NOT has_function_privilege('anon','public.integral_seller_create_pdv_order(jsonb,jsonb,jsonb,uuid,boolean)','EXECUTE'),'Anonymous seller creation privilege';
 -- Reproduce a BRL catalogue price rounded through USD and back, with zero discount.
 UPDATE public.inventory_items SET price=385,max_discount_percent=0 WHERE id=item;
 PERFORM set_config('request.jwt.claim.sub',seller::text,true);
 FOREACH cur IN ARRAY ARRAY['BRL','USD','PYG'] LOOP
  FOREACH portal IN ARRAY ARRAY[true,false] LOOP
   args:=jsonb_set(args,'{p_currency}',to_jsonb(cur));
   args:=jsonb_set(args,'{p_items,0,quantity}','1');
   args:=jsonb_set(args,'{p_items,0,unit_price}','384.98');
   SELECT count(*) INTO before_count FROM public.orders WHERE seller_id=seller;
   rid:=gen_random_uuid();
   result:=public.integral_seller_create_pdv_order(args,followup,'{"mode":"automatic"}',rid,portal);
   ASSERT (result->>'requires_price_confirmation')::boolean,'Stale conversion did not require confirmation';
   ASSERT (SELECT count(*)=before_count FROM public.orders WHERE seller_id=seller),'Requote persisted order';
   quote:=result->'quote'; offered:=(quote->'items'->0->>'unit_price')::numeric;
   IF cur='BRL' THEN ASSERT offered=385,'BRL catalogue price drifted'; END IF;
   args:=jsonb_set(args,'{p_items,0,unit_price}',to_jsonb(offered));
   result:=public.integral_seller_create_pdv_order(args,followup,quote->'exchange',rid,portal);
   oid:=(result->>'id')::uuid;
   ASSERT oid IS NOT NULL AND (SELECT total=offered AND approval_status='pending' AND shipping_cost=0 FROM public.orders WHERE id=oid),'Confirmed quote failed';
   again:=public.integral_seller_create_pdv_order(args,followup,quote->'exchange',rid,portal);
   ASSERT again->>'id'=oid::text AND (again->>'replayed')::boolean,'Currency retry created duplicate';
   ASSERT (SELECT count(*)=before_count+1 FROM public.orders WHERE seller_id=seller),'Confirmation did not create exactly one order';
  END LOOP;
 END LOOP;
 RAISE NOTICE 'PASS shared PDV customer, fields, zero extra freight, pending state, idempotency, scopes, approval and stock';
END $$;
ROLLBACK;
