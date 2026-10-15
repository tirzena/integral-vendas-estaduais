INSERT INTO private.integral_policy_backups(label,payload)
SELECT 'before_finance_role_union_receipts_20261015',
 jsonb_build_object('function',pg_get_functiondef(p.oid),'acl',p.proacl::text)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='finance_confirm_seller_payment'
AND NOT EXISTS(SELECT 1 FROM private.integral_policy_backups WHERE label='before_finance_role_union_receipts_20261015');

CREATE OR REPLACE FUNCTION public.finance_confirm_seller_payment(p_payment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_actor uuid:=auth.uid(); o public.orders%ROWTYPE; p public.payments%ROWTYPE; proof uuid; result jsonb; order_id uuid; paid numeric; context_created boolean:=false;
BEGIN
 IF v_actor IS NULL OR NOT private.integral_operation_allowed(v_actor,'payments.create') OR NOT (
 public.is_admin(v_actor) OR public.has_role(v_actor,'financeiro')) THEN
 RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Finance or administrator required.'; END IF;
 SELECT so.order_id INTO order_id FROM private.seller_pending_receipts so WHERE so.payment_id=p_payment_id;
 IF order_id IS NULL THEN RAISE EXCEPTION 'Seller receipt not found.'; END IF;
 SELECT * INTO o FROM public.orders so WHERE so.id=order_id FOR UPDATE;
 SELECT * INTO p FROM public.payments sp WHERE sp.id=p_payment_id AND sp.order_id=o.id FOR UPDATE;
 IF o.deleted_at IS NOT NULL OR o.superseded_at IS NOT NULL OR o.status='cancelado'
 OR o.workflow_stage IN ('cancelado','perdido','rascunho','solicitacao_catalogo') THEN RAISE EXCEPTION 'Inactive order.'; END IF;
 IF p.status='pago' THEN RETURN jsonb_build_object('payment_id',p.id,'status','pago','replayed',true); END IF;
 IF p.status IS DISTINCT FROM 'pendente' THEN RAISE EXCEPTION 'Receipt is not pending.'; END IF;
 IF p.currency IS DISTINCT FROM o.currency OR p.exchange_rates_snapshot IS DISTINCT FROM o.exchange_rates_snapshot
 OR (lower(btrim(p.method))='pix' AND (p.received_currency<>'BRL' OR
 abs(round(p.received_amount/(o.exchange_rates_snapshot->>'BRL')::numeric,2)-p.amount)>0.01))
 THEN RAISE EXCEPTION 'Receipt exchange is inconsistent.'; END IF;
 SELECT coalesce(sum(sp.amount),0) INTO paid FROM public.payments sp WHERE sp.order_id=o.id AND sp.status='pago';
 IF p.amount<=0 OR p.amount>greatest(0,round(o.total-paid,2)) THEN RAISE EXCEPTION 'Receipt exceeds current balance.'; END IF;
 SELECT sp.id INTO proof FROM public.order_payment_proofs sp WHERE sp.payment_id=p.id AND sp.order_id=o.id ORDER BY sp.created_at LIMIT 1 FOR UPDATE;
 IF proof IS NULL THEN RAISE EXCEPTION 'Receipt proof required.'; END IF;
 INSERT INTO private.seller_creation_context(backend_pid,transaction_id,actor,new_order_id,operation)
 VALUES(pg_backend_pid(),txid_current(),v_actor,o.id,'register_payment')
 ON CONFLICT DO NOTHING RETURNING true INTO context_created;
 -- Canonical non-cash payment expects an unattached proof; it reattaches to SAME payment.
 IF lower(btrim(p.method))<>'dinheiro' THEN UPDATE public.order_payment_proofs sp SET payment_id=NULL WHERE sp.id=proof; END IF;
 PERFORM 1 FROM public.inventory_items i WHERE i.id IN(SELECT l.item_id FROM public.order_items l WHERE l.order_id=o.id) ORDER BY i.id FOR UPDATE;
 PERFORM 1 FROM public.warehouse_inventory w WHERE w.warehouse_id=o.warehouse_id AND w.item_id IN(SELECT l.item_id FROM public.order_items l WHERE l.order_id=o.id) ORDER BY w.item_id FOR UPDATE;
 result:=private.seller_confirm_canonical(o.id,p.amount,p.method,proof,p.id);
 IF EXISTS(SELECT 1 FROM public.orders so WHERE so.id=o.id AND (
 so.seller_id IS DISTINCT FROM o.seller_id OR so.currency IS DISTINCT FROM o.currency OR so.total IS DISTINCT FROM o.total
 OR so.discount IS DISTINCT FROM o.discount OR so.shipping_cost IS DISTINCT FROM o.shipping_cost
 OR so.commission_total IS DISTINCT FROM o.commission_total OR so.exchange_rates_snapshot IS DISTINCT FROM o.exchange_rates_snapshot))
 THEN RAISE EXCEPTION 'Approval unexpectedly changed commercial terms.'; END IF;
 UPDATE private.seller_pending_receipts sp SET confirmed_by=v_actor,confirmed_at=now() WHERE sp.payment_id=p.id;
 IF coalesce(context_created,false) THEN
 DELETE FROM private.seller_creation_context c WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.actor=v_actor AND c.new_order_id=o.id AND c.operation='register_payment';
 END IF;
 RETURN jsonb_build_object('id',o.id,'payment_id',p.id,'status','pago','paid',result->'paid','remaining',result->'remaining','stage',result->'stage','replayed',false);
END $function$
;
REVOKE ALL ON FUNCTION public.finance_confirm_seller_payment(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_confirm_seller_payment(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.integral_pending_payment_receipts(
 p_product_id uuid DEFAULT NULL, p_offset integer DEFAULT 0, p_limit integer DEFAULT 25
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); result jsonb;
BEGIN
 IF actor IS NULL OR NOT private.integral_operation_allowed(actor,'payments.view')
 OR NOT (public.is_admin(actor) OR public.has_role(actor,'financeiro'))
 THEN RAISE EXCEPTION 'Conferência exclusiva do Financeiro ou administração.' USING ERRCODE='42501'; END IF;
 IF p_offset IS NULL OR p_offset<0 OR p_limit IS NULL OR p_limit<1 OR p_limit>100
 THEN RAISE EXCEPTION 'Paginação inválida.'; END IF;
 WITH eligible AS (
 SELECT p.id AS payment_id,p.order_id,o.number AS order_number,
 c.name AS customer_name,s.full_name AS seller_name,p.amount,p.currency,
 p.received_amount,p.received_currency,p.method,p.paid_at,p.created_at,o.total,
 greatest(0,round(o.total-coalesce((SELECT sum(pay.amount) FROM public.payments pay WHERE pay.order_id=o.id AND pay.status='pago'),0),2)) AS remaining,
 coalesce((SELECT jsonb_agg(jsonb_build_object('id',pr.id,'type',pr.proof_type,'url',pr.external_url,'name',pr.file_name)) FROM public.order_payment_proofs pr WHERE pr.payment_id=p.id AND pr.order_id=o.id),'[]'::jsonb) AS proofs
 FROM private.seller_pending_receipts r JOIN public.payments p ON p.id=r.payment_id
 JOIN public.orders o ON o.id=p.order_id LEFT JOIN public.customers c ON c.id=o.customer_id
 LEFT JOIN public.profiles s ON s.id=o.seller_id
 WHERE r.confirmed_at IS NULL AND p.status='pendente'
 AND o.deleted_at IS NULL AND o.superseded_at IS NULL AND o.status<>'cancelado'
 AND o.workflow_stage NOT IN ('cancelado','perdido','rascunho','solicitacao_catalogo')
 AND (p_product_id IS NULL OR o.product_id=p_product_id OR EXISTS(
 SELECT 1 FROM public.order_items li JOIN public.inventory_items ii ON ii.id=li.item_id WHERE li.order_id=o.id AND ii.product_id=p_product_id))
 ), selected AS (SELECT * FROM eligible ORDER BY created_at,payment_id OFFSET p_offset LIMIT p_limit)
 SELECT jsonb_build_object('total',(SELECT count(*) FROM eligible),'rows',coalesce((SELECT jsonb_agg(to_jsonb(selected) ORDER BY created_at,payment_id) FROM selected),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.integral_pending_payment_receipts(uuid,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.integral_pending_payment_receipts(uuid,integer,integer) TO authenticated;