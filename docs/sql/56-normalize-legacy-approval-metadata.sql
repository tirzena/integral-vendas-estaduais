DO $migration$
DECLARE responsible uuid; old_actor text:=current_setting('request.jwt.claim.sub',true);
 before_orders text; before_payments text; before_stock text; before_payroll text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('legacy-approval-history-v1',0));
 SELECT p.id INTO STRICT responsible FROM public.profiles p JOIN public.user_roles ur ON ur.user_id=p.id AND ur.role='admin' WHERE lower(p.email)='tirzenaadm@gmail.com' AND p.is_active;
 SELECT md5(jsonb_agg(to_jsonb(o)-ARRAY['approval_status','approved_at','approved_by','financial_closed_at','financial_closed_by','updated_at'] ORDER BY id)::text) INTO before_orders FROM public.orders o;
 SELECT md5(jsonb_agg(to_jsonb(p)-ARRAY['review_decision','review_note','reviewed_by','reviewed_at'] ORDER BY id)::text) INTO before_payments FROM public.payments p;
 SELECT md5(jsonb_agg(to_jsonb(w) ORDER BY warehouse_id,item_id)::text) INTO before_stock FROM public.warehouse_inventory w;
 SELECT md5(jsonb_agg(to_jsonb(p) ORDER BY id)::text) INTO before_payroll FROM public.payroll_entries p;
 PERFORM set_config('request.jwt.claim.sub',responsible::text,true);
 INSERT INTO private.remuneration_action_context VALUES(pg_backend_pid(),txid_current(),responsible,'approve');
 UPDATE public.orders o SET approval_status='approved',approved_by=responsible,approved_at=now()
 WHERE o.approval_status IS NULL AND EXISTS(SELECT 1 FROM public.order_audit_log a WHERE a.order_id=o.id AND a.new_snapshot->>'history_origin'='legacy_regularization');
 DELETE FROM private.remuneration_action_context WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current() AND actor=responsible;
 INSERT INTO private.remuneration_action_context VALUES(pg_backend_pid(),txid_current(),responsible,'payment');
 UPDATE public.payments p SET reviewed_by=responsible,reviewed_at=now(),
 review_note='Regularização retroativa de recebimento anterior. Responsável de referência: Zé; conferência migrada em lote, sem simulação de comprovante ou data antiga.'
 WHERE p.review_decision IS NULL AND p.reviewed_at IS NULL AND p.reviewed_by IS NULL AND p.status='pago' AND EXISTS(SELECT 1 FROM private.integral_payment_reviews r WHERE r.payment_id=p.id AND r.new_snapshot->>'history_origin'='legacy_regularization');
 DELETE FROM private.remuneration_action_context WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current() AND actor=responsible;
 INSERT INTO private.remuneration_action_context VALUES(pg_backend_pid(),txid_current(),responsible,'close');
 WITH eligible AS (
 SELECT o.* FROM public.orders o WHERE o.financial_closed_at IS NULL AND o.approval_status='approved' AND o.payment_status='pago'
 AND EXISTS(SELECT 1 FROM public.order_audit_log a WHERE a.order_id=o.id AND a.new_snapshot->>'history_origin'='legacy_regularization')
 AND o.total>0 AND (SELECT coalesce(sum(amount),0) FROM public.payments p WHERE p.order_id=o.id AND p.status='pago' AND p.paid_at<=current_date)>=o.total
 AND NOT EXISTS(SELECT 1 FROM public.payments p WHERE p.order_id=o.id AND p.status='pendente')
 ), updated AS (
 UPDATE public.orders o SET financial_closed_at=now(),financial_closed_by=responsible FROM eligible e WHERE o.id=e.id
 RETURNING o.id,o.financial_closed_at
 )
 INSERT INTO private.integral_payment_reviews(order_id,decision,reviewed_by,note,previous_snapshot,new_snapshot)
 SELECT e.id,'closed',responsible,
 'Regularização retroativa da baixa de pedido já integralmente pago. Responsável de referência: Zé; saldo conferido pelos recebimentos existentes. Registro da migração, sem movimentação financeira adicional.',
 to_jsonb(e),to_jsonb(e)||jsonb_build_object('financial_closed_at',u.financial_closed_at,'financial_closed_by',responsible,'history_origin','legacy_regularization','recorded_by','system_migration')
 FROM eligible e JOIN updated u ON u.id=e.id;
 DELETE FROM private.remuneration_action_context WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current() AND actor=responsible;
 PERFORM set_config('request.jwt.claim.sub',coalesce(old_actor,''),true);
 ASSERT before_orders IS NOT DISTINCT FROM (SELECT md5(jsonb_agg(to_jsonb(o)-ARRAY['approval_status','approved_at','approved_by','financial_closed_at','financial_closed_by','updated_at'] ORDER BY id)::text) FROM public.orders o),'Migration changed order business fields';
 ASSERT before_payments IS NOT DISTINCT FROM (SELECT md5(jsonb_agg(to_jsonb(p)-ARRAY['review_decision','review_note','reviewed_by','reviewed_at'] ORDER BY id)::text) FROM public.payments p),'Migration changed payment business fields';
 ASSERT before_stock IS NOT DISTINCT FROM (SELECT md5(jsonb_agg(to_jsonb(w) ORDER BY warehouse_id,item_id)::text) FROM public.warehouse_inventory w),'Migration changed inventory';
 ASSERT before_payroll IS NOT DISTINCT FROM (SELECT md5(jsonb_agg(to_jsonb(p) ORDER BY id)::text) FROM public.payroll_entries p),'Migration changed payroll';
END $migration$;