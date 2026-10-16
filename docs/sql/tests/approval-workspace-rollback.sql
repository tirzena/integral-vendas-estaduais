BEGIN;
DO $$
#variable_conflict use_variable
DECLARE super_id uuid; test_admin uuid:=gen_random_uuid(); test_super uuid:=gen_random_uuid(); admin_id uuid; seller uuid:=gen_random_uuid(); prod uuid:=gen_random_uuid(); manager_id uuid:=gen_random_uuid(); wh uuid:=gen_random_uuid(); oid uuid:=gen_random_uuid(); oid2 uuid:=gen_random_uuid(); payid uuid:=gen_random_uuid(); payid2 uuid:=gen_random_uuid(); result jsonb;
BEGIN
 SELECT id INTO admin_id FROM public.profiles WHERE email='tirzenaadm@gmail.com';
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 SELECT user_id INTO super_id FROM public.user_roles WHERE role='superadmin' LIMIT 1;
 ASSERT private.integral_can_review_financial(super_id),'Superadmin must review financial without job assignment';
 ASSERT (SELECT count(*) FROM private.effective_capabilities(super_id))=(SELECT count(*) FROM public.permission_catalog),'Superadmin lacks capabilities';
 INSERT INTO auth.users(id,email,raw_user_meta_data,created_at) VALUES
 (test_admin,'review-admin-'||test_admin||'@example.invalid','{}',now()),
 (test_super,'review-super-'||test_super||'@example.invalid','{}',now());
 UPDATE public.profiles SET is_active=true WHERE id IN(test_admin,test_super);
 INSERT INTO public.user_roles(user_id,role) VALUES(test_admin,'admin'),(test_super,'superadmin');
 INSERT INTO public.integral_member_rules(user_id,general_access,permission_overrides) VALUES
 (test_admin,true,'{"orders.create":false}'),(test_super,true,'{"orders.create":false}');
 ASSERT NOT private.integral_operation_allowed(test_admin,'orders.create'),'Admin bypassed explicit denial';
 ASSERT private.integral_operation_allowed(test_super,'orders.create'),'Superadmin restricted by member override';
 ASSERT NOT private.integral_can_review_financial(test_admin),'Admin gained financial decisions without job permission';
 ASSERT private.integral_can_review_financial(test_super),'New superadmin lacks financial decisions';
 ASSERT NOT private.integral_operation_allowed(test_admin,'future_ungranted_permission'),'Admin has wildcard capability';
 ASSERT private.integral_operation_allowed(test_super,'future_ungranted_permission'),'Superadmin lacks wildcard capability';
 INSERT INTO auth.users(id,email,raw_user_meta_data,created_at) VALUES(seller,'review-test-'||seller||'@example.invalid','{}',now());
 INSERT INTO public.user_roles(user_id,role) VALUES(seller,'vendedor') ON CONFLICT DO NOTHING;
 UPDATE public.profiles SET is_active=true WHERE id=seller;
 INSERT INTO public.products(id,name,is_active,is_demo) VALUES(prod,'Review controlled product',true,true);
 INSERT INTO public.warehouses(id,name,city,state,is_active) VALUES(wh,'Review controlled warehouse','Test','SP',true);
 INSERT INTO public.orders(id,number,seller_id,product_id,warehouse_id,currency,total,amount_paid,amount_receivable,status,kind,stock_state,workflow_stage,order_date,exchange_rates_snapshot,exchange_rate_locked_at)
 VALUES(oid,-2147478000,seller,prod,wh,'BRL',200,0,200,'faturado','venda','nenhum','pedido_feito',current_date,'{"base":"BRL","BRL":1,"USD":0.2,"PYG":1400}',now());
 INSERT INTO auth.users(id,email,raw_user_meta_data,created_at) VALUES(manager_id,'review-manager-'||manager_id||'@example.invalid','{}',now());
 INSERT INTO public.user_roles(user_id,role) VALUES(manager_id,'gestor');
 UPDATE public.profiles SET is_active=true WHERE id=manager_id;
 PERFORM set_config('request.jwt.claim.sub',manager_id::text,true);
 ASSERT NOT public.integral_order_reviewer_access(),'Manager must remain read-only';
 ASSERT (public.integral_approval_workspace_access()->>'view_orders')::boolean,'Manager must view orders';
 ASSERT NOT public.integral_financial_reviewer_access(),'Manager must not review financial';
 BEGIN
  PERFORM public.integral_decide_order(oid,'request_changes','Tentativa de gestor','policy',NULL,NULL);
  RAISE EXCEPTION 'Read-only manager decided order';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 PERFORM public.integral_decide_order(oid,'request_changes','Corrigir endereço de entrega','policy',NULL,NULL);
 ASSERT (SELECT approval_status='rejected' AND review_outcome='changes_requested' FROM public.orders WHERE id=oid),'Request changes must remain distinct from rejection';
 ASSERT EXISTS(SELECT 1 FROM public.notifications WHERE user_id=seller AND notification_type='order_review_decision'),'Missing seller notification';
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 INSERT INTO public.orders(id,number,seller_id,product_id,warehouse_id,currency,total,amount_paid,amount_receivable,status,kind,stock_state,workflow_stage,order_date,exchange_rates_snapshot,exchange_rate_locked_at)
 VALUES(oid2,-2147478001,seller,prod,wh,'BRL',200,0,200,'faturado','venda','nenhum','pedido_feito',current_date,'{"base":"BRL","BRL":1,"USD":0.2,"PYG":1400}',now());
 PERFORM public.integral_decide_order(oid2,'reject','Venda recusada após conferência','policy',NULL,NULL);
 ASSERT (SELECT approval_status='rejected' AND review_outcome='rejected' FROM public.orders WHERE id=oid2),'Rejection must be explicit';
 -- Set only fixture order to approved within existing authorized context.
 INSERT INTO private.remuneration_action_context VALUES(pg_backend_pid(),txid_current(),admin_id,'approve');
 UPDATE public.orders SET approval_status='approved',review_outcome=NULL WHERE id=oid2;
 DELETE FROM private.remuneration_action_context WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current();
 INSERT INTO public.payments(id,order_id,amount,currency,method,status,paid_at) VALUES(payid,oid2,100,'BRL','Transferência','pendente',current_date);
 INSERT INTO private.seller_pending_receipts VALUES(payid,seller,oid2,NULL,NULL);
 result:=public.integral_pending_payment_orders();
 ASSERT result @> jsonb_build_array(oid2),'Pending payment order omitted';
 PERFORM public.integral_review_payment(payid,'adjust','Valor corrigido conforme comprovante',90,current_date,'Transferência',100);
 ASSERT (SELECT status='pendente' AND amount=90 AND review_decision='adjusted' FROM public.payments WHERE id=payid),'Adjustment must not confirm payment';
 ASSERT (SELECT amount_paid=0 FROM public.orders WHERE id=oid2),'Adjustment changed received balance';
 PERFORM public.integral_review_payment(payid,'request_changes','Anexar comprovante legível',NULL,NULL,NULL,90);
 ASSERT (SELECT status='cancelado' AND review_decision='changes_requested' FROM public.payments WHERE id=payid),'Returned payment must leave active pending queue';
 ASSERT NOT (public.integral_pending_payment_orders() @> jsonb_build_array(oid2)),'Returned receipt still pending';
 ASSERT (SELECT amount_paid=0 FROM public.orders WHERE id=oid2),'Rejected payment counted as paid';

 INSERT INTO public.payments(id,order_id,amount,currency,method,status,paid_at,exchange_rates_snapshot)
 VALUES(payid2,oid2,200,'BRL','Transferência','pendente',current_date,'{"base":"BRL","BRL":1,"USD":0.2,"PYG":1400}');
 INSERT INTO private.seller_pending_receipts VALUES(payid2,seller,oid2,NULL,NULL);
 INSERT INTO storage.objects(bucket_id,name) VALUES('payment-proofs','review-test/'||payid2);
 INSERT INTO public.order_payment_proofs(order_id,payment_id,proof_type,file_path,file_name,uploaded_by)
 VALUES(oid2,payid2,'arquivo','review-test/'||payid2,'Comprovante de teste',seller);
 PERFORM public.finance_confirm_seller_payment(payid2);
 ASSERT (SELECT status='pago' FROM public.payments WHERE id=payid2),'Payment confirmation failed';
 ASSERT (SELECT amount_paid=200 AND amount_receivable=0 FROM public.orders WHERE id=oid2),'Confirmed payment did not update order';
 ASSERT EXISTS(SELECT 1 FROM private.integral_payment_reviews WHERE payment_id=payid2 AND decision='confirmed'),'Confirmation history missing';
 ASSERT private.integral_can_review_financial(admin_id),'Ze must review financial';
 ASSERT private.integral_can_review_financial((SELECT id FROM public.profiles WHERE email='bia.pharmalabz@gmail.com')),'Bia must review financial';
 ASSERT NOT EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.role='admin' AND ur.user_id<>admin_id AND ur.user_id<>(SELECT id FROM public.profiles WHERE email='bia.pharmalabz@gmail.com') AND private.integral_can_review_financial(ur.user_id)),'Other administrators must not review financial';
 ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(public.integral_payment_decision_history(0,100)->'rows') r WHERE r->>'payment_id'=payid::text),'Financial decision missing from history';
 PERFORM set_config('request.jwt.claim.sub',seller::text,true);
 BEGIN
  PERFORM public.integral_decide_order(oid,'approve','Tentativa do vendedor','policy',NULL,NULL);
  RAISE EXCEPTION 'Seller approval unexpectedly permitted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 ASSERT NOT has_function_privilege('anon','public.integral_review_payment(uuid,text,text,numeric,date,text,numeric)','EXECUTE'),'Anonymous review privilege';
 RAISE NOTICE 'PASS distinct decisions, payment adjustment/return, queue, unchanged cash, audit and seller ACL';
END $$;
ROLLBACK;
