BEGIN;
DO $$
#variable_conflict use_variable
DECLARE admin_id uuid; seller uuid:=gen_random_uuid(); prod uuid:=gen_random_uuid(); item uuid:=gen_random_uuid(); wh uuid:=gen_random_uuid(); cid uuid; rid uuid:=gen_random_uuid(); oid uuid; args jsonb; followup jsonb; result jsonb; again jsonb; policy uuid; other_id uuid:=gen_random_uuid(); wrong_order uuid; cancel_order uuid; pay1 uuid; pay2 uuid; pay3 uuid; cashpay uuid; credit_request_id uuid:=gen_random_uuid(); pay_payload jsonb; ledger_count bigint; legacy_order uuid:=gen_random_uuid(); legacy_payment uuid; legacy_actor uuid; stock_before text; freight_order uuid; portal_freight boolean; freight_case jsonb; freight_args jsonb; freight_followup jsonb; cur text; portal boolean; before_count bigint; offered numeric; quote jsonb;
BEGIN
 SELECT id INTO admin_id FROM public.profiles WHERE email='tirzenaadm@gmail.com';
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 INSERT INTO auth.users(id,email,created_at) VALUES(other_id,'credit-other-'||other_id||'@example.invalid',now());
 UPDATE public.profiles SET is_active=true WHERE id=other_id;
 INSERT INTO public.user_roles(user_id,role) VALUES(other_id,'vendedor') ON CONFLICT DO NOTHING;

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
 args:=jsonb_build_object('p_price_confirmation_supported',true,'p_kind','pre_pedido','p_customer_id',cid,'p_product_id',prod,'p_currency','BRL','p_discount',0,'p_shipping_cost',0,'p_notes','Controlled complete order','p_whatsapp','32988888888','p_items',jsonb_build_array(jsonb_build_object('item_id',item,'quantity',2,'unit_price',100,'discount',0)),'p_payments','[]'::jsonb);
 followup:=jsonb_build_object('seller_id',seller,'warehouse_id',wh,'shipping_address','Rua de teste, 10','shipping_address_number','10','shipping_city','Juiz de Fora','shipping_state','MG','shipping_country','Brasil','shipping_cep','36046040','delivery_recipient_name','Destinatário controlado','delivery_recipient_document','98765432100','order_date',current_date,'delivery_deadline',current_date+5,'carrier','Transportadora teste','tracking_code','CONTROLLED123','variable_cost',0,'item_costs','[]'::jsonb);

 args:=jsonb_set(args,'{p_shipping_cost}','30'); followup:=followup||'{"shipping_mode":"value"}';
 result:=public.integral_seller_create_pdv_order(args,followup,'{"mode":"automatic"}',rid,true); oid:=(result->>'id')::uuid;
 result:=public.integral_seller_create_pdv_order(args,followup,'{"mode":"automatic"}',gen_random_uuid(),true); wrong_order:=(result->>'id')::uuid;

 EXECUTE 'set local role authenticated';
 ASSERT NOT private.seller_in_creation(),'Context should be absent outside an atomic RPC';
 result:=public.sales_delete_order(wrong_order,'Solicitação fictícia duplicada — regressão de permissão');
 ASSERT (result->>'deleted')::boolean,'Own pending request not removed';
 EXECUTE 'reset role';
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 INSERT INTO public.user_roles(user_id,role) VALUES(seller,'admin') ON CONFLICT DO NOTHING;
 PERFORM public.integral_decide_order(oid,'approve','Aprovação fictícia de regressão de cancelamento','policy',NULL,NULL);
 PERFORM set_config('request.jwt.claim.sub',seller::text,true);
 EXECUTE 'set local role authenticated';
 result:=public.sales_delete_order(oid,'Cancelamento fictício — regressão de permissão');
 ASSERT (result->>'pending')::boolean,'Approved order must request cancellation';
 ASSERT NOT private.seller_in_creation(),'Context leaked after cancellation request';
 EXECUTE 'reset role';
 ASSERT (SELECT deleted_at IS NULL AND approval_status='approved' FROM public.orders WHERE id=oid),'Approved fixture changed before cancellation review';
 ASSERT EXISTS(SELECT 1 FROM public.order_cancellation_requests WHERE order_id=oid AND requested_by=seller AND status='pending'),'Cancellation request missing';
 ASSERT (SELECT reserved=2 AND quantity=20 FROM public.warehouse_inventory WHERE warehouse_id=wh AND item_id=item),'Cancellation request changed stock';
 ASSERT NOT has_table_privilege('authenticated','private.seller_creation_context','insert'),'Authenticated role can forge private context';
 ASSERT NOT has_function_privilege('anon','private.seller_in_creation()','execute'),'Anonymous predicate execute granted';
 ASSERT NOT EXISTS(SELECT 1 FROM private.seller_creation_context WHERE actor=seller),'Context leaked';
END $$;
ROLLBACK;
select 'PASS authenticated own pending removal, approved cancellation request, stock preservation and context isolation' verification;