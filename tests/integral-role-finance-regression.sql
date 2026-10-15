-- Controlled fixtures only; run in an administrative SQL session. Every block ends with ROLLBACK.

BEGIN;
CREATE TEMP TABLE integral_capability_cases(actor uuid, roles text[], expected text[], forbidden text[]) ON COMMIT DROP;
INSERT INTO integral_capability_cases VALUES
(gen_random_uuid(),ARRAY['vendedor'],ARRAY['inventory_view','deliveries_view','orders.create'],ARRAY['company_finance','company_sales','inventory_manage','admin_area']),
(gen_random_uuid(),ARRAY['vendedor','financeiro'],ARRAY['company_finance','company_sales','orders.create'],ARRAY['inventory_manage','admin_area']),
(gen_random_uuid(),ARRAY['vendedor','estoque'],ARRAY['inventory_manage','inventory_view','orders.create'],ARRAY['company_finance','company_sales','admin_area']),
(gen_random_uuid(),ARRAY['vendedor','entregador'],ARRAY['tracking_share_own','deliveries_view'],ARRAY['company_finance','inventory_manage','admin_area']),
(gen_random_uuid(),ARRAY['vendedor','gestor'],ARRAY['company_sales','manage_team','deliveries_manage'],ARRAY['company_finance','inventory_manage','admin_area']),
(gen_random_uuid(),ARRAY['admin'],ARRAY['admin_area','members.manage'],ARRAY[]::text[]);
INSERT INTO auth.users(id,email,raw_user_meta_data,created_at)
SELECT actor,'integral-capability-test-'||actor||'@example.invalid','{}',now() FROM integral_capability_cases;
DELETE FROM public.user_roles WHERE user_id IN (SELECT actor FROM integral_capability_cases);
INSERT INTO public.user_roles(user_id,role) SELECT actor,unnest(roles)::public.app_role FROM integral_capability_cases;
GRANT SELECT ON integral_capability_cases TO authenticated;
SET LOCAL ROLE authenticated;
DO $$ DECLARE c record; actual text[]; BEGIN
 FOR c IN SELECT * FROM integral_capability_cases LOOP
  PERFORM set_config('request.jwt.claim.sub',c.actor::text,true);
  SELECT array_agg(key) INTO actual FROM public.get_my_capabilities() key;
  IF NOT c.expected <@ actual OR c.forbidden && actual THEN RAISE EXCEPTION 'Invalid capabilities for %: %',c.roles,actual; END IF;
 END LOOP;
END $$;
RESET ROLE;
DO $$ DECLARE a uuid; caps text[]; BEGIN
 SELECT actor INTO a FROM integral_capability_cases WHERE roles=ARRAY['vendedor'];
 INSERT INTO public.integral_member_rules(user_id,permission_overrides) VALUES(a,'{"inventory_view":false,"orders.create":false}');
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 SELECT array_agg(key) INTO caps FROM public.get_my_capabilities() key;
 IF 'inventory_view'=ANY(caps) OR 'orders.create'=ANY(caps) THEN RAISE EXCEPTION 'Explicit denials were ignored'; END IF;
 PERFORM set_config('request.jwt.claim.sub','',true);
 UPDATE public.profiles SET is_active=false WHERE id=a;
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 IF EXISTS(SELECT 1 FROM public.get_my_capabilities()) THEN RAISE EXCEPTION 'Inactive member has capabilities'; END IF;
 PERFORM set_config('request.jwt.claim.sub','',true);
 IF EXISTS(SELECT 1 FROM public.get_my_capabilities()) THEN RAISE EXCEPTION 'Missing session has capabilities'; END IF;
 IF has_function_privilege('anon','public.get_my_capabilities()','EXECUTE') THEN RAISE EXCEPTION 'Anonymous execute allowed'; END IF;
END $$;
SELECT 'Six role combinations, explicit denial, inactive and missing session: passed' result;
ROLLBACK;

BEGIN;
CREATE TEMP TABLE integral_receipt_fixture(actor uuid,seller uuid,product uuid,order_id uuid,payment uuid) ON COMMIT DROP;
DO $$ DECLARE a uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); prod uuid:=gen_random_uuid(); oid uuid:=gen_random_uuid(); pay uuid:=gen_random_uuid(); item uuid:=gen_random_uuid(); wh uuid:=gen_random_uuid(); BEGIN
 INSERT INTO auth.users(id,email,raw_user_meta_data,created_at) VALUES
 (a,'integral-finance-test-'||a||'@example.invalid','{}',now()),(s,'integral-finance-test-'||s||'@example.invalid','{}',now());
 INSERT INTO public.user_roles(user_id,role) VALUES(a,'financeiro');
 INSERT INTO public.products(id,name,is_active,is_demo) VALUES(prod,'Controlled finance category',true,true);
 INSERT INTO public.inventory_items(id,product_id,name,unit,currency,cost,price,quantity,reserved,is_active,is_demo)
 VALUES(item,prod,'Controlled finance item','UN','BRL',10,100,10,0,true,true);
 INSERT INTO public.warehouses(id,name,city,state,is_active) VALUES(wh,'Controlled finance warehouse','Test city','SP',true);
 INSERT INTO public.warehouse_inventory(warehouse_id,item_id,quantity,reserved) VALUES(wh,item,10,2);
 INSERT INTO public.orders(id,number,seller_id,product_id,warehouse_id,currency,total,amount_paid,amount_receivable,status,kind,stock_state,workflow_stage,exchange_rates_snapshot,exchange_rate_locked_at,is_demo)
 VALUES(oid,-2147470001,s,prod,wh,'BRL',200,0,200,'faturado','venda','reservado','pedido_feito',jsonb_build_object('base','BRL','BRL',1,'USD',0.2,'PYG',1400),now(),true);
 INSERT INTO public.order_items(order_id,item_id,description,unit,quantity,unit_price,discount,total) VALUES(oid,item,'Controlled finance item','UN',2,100,0,200);
 INSERT INTO private.seller_stock_settlements(order_id,settled_ratio) VALUES(oid,0);
 INSERT INTO public.payments(id,order_id,amount,currency,method,status,received_amount,received_currency,exchange_rates_snapshot,exchange_rate_locked_at)
 SELECT pay,oid,20,'BRL','dinheiro','pendente',20,'BRL',exchange_rates_snapshot,exchange_rate_locked_at FROM public.orders WHERE id=oid;
 INSERT INTO public.order_payment_proofs(order_id,payment_id,proof_type,file_path,file_name,uploaded_by)
 SELECT oid,pay,'recibo_sistema',receipt_token::text,'Controlled receipt',s FROM public.payments WHERE id=pay;
 UPDATE public.payments SET paid_at=current_date-2 WHERE id=pay;
 INSERT INTO private.seller_pending_receipts VALUES(pay,s,oid,NULL,NULL);
 INSERT INTO integral_receipt_fixture VALUES(a,s,prod,oid,pay);
END $$;
GRANT SELECT ON integral_receipt_fixture TO authenticated;
SET LOCAL ROLE authenticated;
DO $$ DECLARE f record; result jsonb; BEGIN
 SELECT * INTO f FROM integral_receipt_fixture;
 PERFORM set_config('request.jwt.claim.sub',f.seller::text,true);
 BEGIN PERFORM public.integral_pending_payment_receipts(f.product); RAISE EXCEPTION 'Seller saw finance queue'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.finance_confirm_seller_payment(f.payment); RAISE EXCEPTION 'Seller confirmed receipt'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claim.sub',f.actor::text,true);
 result:=public.integral_pending_payment_receipts(f.product);
 IF (result->>'total')::int<>1 OR result->'rows'->0->>'payment_id'<>f.payment::text THEN RAISE EXCEPTION 'Finance queue missing receipt: %',result; END IF;
 result:=public.finance_confirm_seller_payment(f.payment);
 IF result->>'status'<>'pago' THEN RAISE EXCEPTION 'Finance-vendor confirmation failed: %',result; END IF;
 result:=public.finance_confirm_seller_payment(f.payment);
 IF NOT (result->>'replayed')::boolean THEN RAISE EXCEPTION 'Repeated confirmation not idempotent'; END IF;
 IF (public.integral_pending_payment_receipts(f.product)->>'total')::int<>0 THEN RAISE EXCEPTION 'Confirmed receipt remained pending'; END IF;
END $$;
RESET ROLE;
DO $$ DECLARE f record; BEGIN SELECT * INTO f FROM integral_receipt_fixture;
 IF (SELECT count(*) FROM public.payments WHERE order_id=f.order_id)<>1 OR (SELECT amount_paid FROM public.orders WHERE id=f.order_id)<>20 THEN RAISE EXCEPTION 'Duplicate payment or wrong balance'; END IF;
 IF (SELECT quantity FROM public.warehouse_inventory WHERE warehouse_id=(SELECT warehouse_id FROM public.orders WHERE id=f.order_id))<>9.8 OR (SELECT reserved FROM public.warehouse_inventory WHERE warehouse_id=(SELECT warehouse_id FROM public.orders WHERE id=f.order_id))<>1.8 THEN RAISE EXCEPTION 'Wrong proportional settlement'; END IF;
 IF (SELECT paid_at FROM public.payments WHERE id=f.payment)<>current_date-2 THEN RAISE EXCEPTION 'Receipt date was lost'; END IF;
 IF EXISTS(SELECT 1 FROM private.seller_creation_context WHERE actor=f.actor) THEN RAISE EXCEPTION 'Financial context leaked'; END IF;
END $$;
SELECT 'Seller denied; combined Finance+Seller confirmation, proportional stock, balance and replay passed' result;
ROLLBACK;

BEGIN;
DO $$ DECLARE actor uuid:=gen_random_uuid(); BEGIN
 INSERT INTO auth.users(id,email,raw_user_meta_data,created_at) VALUES(actor,'integral-finance-denial-test-'||actor||'@example.invalid','{}',now());
 INSERT INTO public.user_roles(user_id,role) VALUES(actor,'financeiro');
 INSERT INTO public.integral_member_rules(user_id,permission_overrides) VALUES(actor,'{"payments.create":false,"payments.view":false}');
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 BEGIN PERFORM public.finance_confirm_seller_payment(gen_random_uuid()); RAISE EXCEPTION 'Denied finance confirmation allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.integral_pending_payment_receipts(); RAISE EXCEPTION 'Denied finance queue allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT 'Explicit financial denials passed' result;
ROLLBACK;