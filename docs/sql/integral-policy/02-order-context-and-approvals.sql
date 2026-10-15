CREATE TABLE public.order_change_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),request_id uuid NOT NULL,order_id uuid NOT NULL REFERENCES public.orders(id),
 requested_by uuid NOT NULL REFERENCES public.profiles(id),reason text NOT NULL CHECK(length(btrim(reason))>=5),
 previous_snapshot jsonb NOT NULL,proposed_args jsonb NOT NULL,proposed_followup jsonb NOT NULL,proposed_exchange jsonb,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','rejected')),
 reviewed_by uuid REFERENCES public.profiles(id),review_note text,created_at timestamptz NOT NULL DEFAULT now(),reviewed_at timestamptz,
 resulting_order_id uuid REFERENCES public.orders(id),UNIQUE(requested_by,request_id)
);
ALTER TABLE public.order_change_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_change_requests FROM anon,authenticated;
GRANT SELECT ON public.order_change_requests TO authenticated;
CREATE POLICY own_order_changes ON public.order_change_requests FOR SELECT TO authenticated USING
 (requested_by=(select auth.uid()) OR public.is_admin((select auth.uid())));
CREATE OR REPLACE FUNCTION private.integral_order_locked(oid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.orders o WHERE o.id=oid AND (o.amount_paid>0 OR o.workflow_stage IN('em_caminho','vendido') OR o.delivered_at IS NOT NULL OR o.fulfillment_status IN('a_caminho','entregue')))
 OR EXISTS(SELECT 1 FROM public.payments WHERE order_id=oid AND status='pago' AND amount>0)
$$;
REVOKE ALL ON FUNCTION private.integral_order_locked(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.integral_order_context(p_order_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE actor uuid:=auth.uid(); o public.orders%ROWTYPE; result jsonb;
BEGIN
 IF actor IS NULL OR NOT private.integral_operation_allowed(actor,'orders.view') THEN RAISE EXCEPTION 'Sem permissão para consultar pedidos.' USING ERRCODE='42501'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=p_order_id AND deleted_at IS NULL AND superseded_at IS NULL;
 IF NOT FOUND OR NOT(o.seller_id=actor OR public.is_admin(actor)) THEN RAISE EXCEPTION 'Pedido vigente não autorizado.' USING ERRCODE='42501'; END IF;
 result:=private.seller_legacy_sales_order_detail(o.id);
 RETURN result||jsonb_build_object('order',to_jsonb(o)-ARRAY['total_cost_usd','total_cost_brl','gross_margin','source_payload','merchandise_cost','variable_cost'],
 'items',coalesce((SELECT jsonb_agg(to_jsonb(l)) FROM public.order_items l WHERE l.order_id=o.id),'[]'::jsonb),
 'history',coalesce((SELECT jsonb_agg(jsonb_build_object('id',l.id,'action',l.action,'note',l.note,'created_at',l.created_at,'changed_by',l.changed_by) ORDER BY l.created_at DESC) FROM public.order_audit_log l WHERE l.root_order_id=coalesce(o.root_order_id,o.id) OR l.order_id=o.id),'[]'::jsonb),
 'registeredPayments',coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM public.payments p WHERE p.order_id=o.id),'[]'::jsonb),
 'proofs',coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM public.order_payment_proofs p WHERE p.order_id=o.id),'[]'::jsonb),
 'exchange_rates_snapshot',o.exchange_rates_snapshot,'exchange_rate_source',o.exchange_rate_source,'exchange_rate_locked_at',o.exchange_rate_locked_at,
 'requires_approval',private.integral_order_locked(o.id),'can_edit',private.integral_operation_allowed(actor,'orders.edit_open'),
 'can_pay',private.integral_operation_allowed(actor,'payments.create'),'can_delete',private.integral_operation_allowed(actor,'orders.delete'));
END $$;
REVOKE ALL ON FUNCTION public.integral_order_context(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.integral_order_context(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.integral_submit_order_edit(p_args jsonb,p_followup jsonb,p_exchange jsonb,p_reason text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE actor uuid:=auth.uid(); o public.orders%ROWTYPE; result jsonb; line jsonb; old_request public.order_change_requests%ROWTYPE; rid uuid;
BEGIN
 IF actor IS NULL OR p_request_id IS NULL OR length(btrim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'Identificação e justificativa são obrigatórias.'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=(p_args->>'p_previous_order_id')::uuid AND deleted_at IS NULL AND superseded_at IS NULL FOR UPDATE;
 IF NOT FOUND OR o.status='cancelado' OR NOT(o.seller_id=actor OR public.is_admin(actor)) OR NOT private.integral_operation_allowed(actor,'orders.edit_open') THEN RAISE EXCEPTION 'Pedido não autorizado para edição.' USING ERRCODE='42501'; END IF;
 IF p_followup->>'seller_id' IS DISTINCT FROM o.seller_id::text AND NOT public.is_admin(actor) THEN RAISE EXCEPTION 'Não é permitido trocar o vendedor.'; END IF;
 IF private.integral_order_locked(o.id) THEN
  IF NOT private.integral_operation_allowed(actor,'orders.request_change') THEN RAISE EXCEPTION 'Sem permissão para solicitar alteração.'; END IF;
  SELECT * INTO old_request FROM public.order_change_requests WHERE requested_by=actor AND request_id=p_request_id;
  IF FOUND THEN
   IF old_request.order_id<>o.id OR old_request.proposed_args IS DISTINCT FROM p_args OR old_request.proposed_followup IS DISTINCT FROM p_followup THEN RAISE EXCEPTION 'Identificador reutilizado com outra alteração.'; END IF;
   RETURN jsonb_build_object('request_id',old_request.id,'pending_approval',true);
  END IF;
  INSERT INTO public.order_change_requests(request_id,order_id,requested_by,reason,previous_snapshot,proposed_args,proposed_followup,proposed_exchange)
  VALUES(p_request_id,o.id,actor,p_reason,private.seller_legacy_sales_order_snapshot(o.id),p_args,p_followup,p_exchange) RETURNING id INTO rid;
  RETURN jsonb_build_object('request_id',rid,'pending_approval',true);
 END IF;
 IF NOT public.is_admin(actor) THEN
  p_exchange:=NULL;
  p_followup:=p_followup||jsonb_build_object('variable_cost',o.variable_cost,'seller_id',o.seller_id,'delivered_at',o.delivered_at);
  IF (p_args->>'p_discount')::numeric IS DISTINCT FROM o.discount OR (p_args->>'p_shipping_cost')::numeric IS DISTINCT FROM o.shipping_cost THEN RAISE EXCEPTION 'Alteração de desconto geral ou frete exige cotação administrativa.'; END IF;
  IF (p_args->>'p_warehouse_id')::uuid IS DISTINCT FROM o.warehouse_id AND NOT EXISTS(SELECT 1 FROM public.warehouse_user_assignments w WHERE w.user_id=actor AND w.warehouse_id=(p_args->>'p_warehouse_id')::uuid) THEN RAISE EXCEPTION 'Estoque não concedido.'; END IF;
  FOR line IN SELECT value FROM jsonb_array_elements(p_args->'p_items') LOOP
   IF NOT private.seller_item_allowed(actor,(line->>'item_id')::uuid) THEN RAISE EXCEPTION 'Produto não concedido.'; END IF;
   IF (line->>'quantity') IS NULL OR (line->>'quantity')::numeric::text IN ('NaN','Infinity','-Infinity') OR (line->>'quantity')::numeric<=0 THEN RAISE EXCEPTION 'Quantidade inválida.'; END IF;
   -- Existing commercial prices cannot be changed through an unpriced legacy payload.
   IF NOT EXISTS(SELECT 1 FROM public.order_items l WHERE l.order_id=o.id AND l.item_id=(line->>'item_id')::uuid AND l.unit_price=(line->>'unit_price')::numeric AND coalesce(l.discount,0)=coalesce((line->>'discount')::numeric,0)) THEN RAISE EXCEPTION 'Novo produto ou preço exige cotação autorizada.'; END IF;
  END LOOP;
  IF p_args->>'p_currency' IS DISTINCT FROM o.currency::text OR p_exchange IS DISTINCT FROM o.exchange_rates_snapshot THEN
   IF p_args->>'p_currency' IS DISTINCT FROM o.currency::text THEN RAISE EXCEPTION 'Alteração de moeda exige aprovação.'; END IF;
  END IF;
  INSERT INTO private.seller_creation_context VALUES(pg_backend_pid(),txid_current(),actor,o.id,'create_sale');
 END IF;
 result:=private.seller_legacy_sales_save_order_edit(p_args||jsonb_build_object('p_revision_note',p_reason),p_followup,p_exchange);
 DELETE FROM private.seller_creation_context c WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.actor=actor;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.integral_submit_order_edit(jsonb,jsonb,jsonb,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.integral_submit_order_edit(jsonb,jsonb,jsonb,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.integral_review_order_change(p_id uuid,p_approve boolean,p_note text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE actor uuid:=auth.uid(); r public.order_change_requests%ROWTYPE; result jsonb;
BEGIN
 IF actor IS NULL OR NOT public.is_admin(actor) OR NOT private.integral_operation_allowed(actor,'orders.approve_change') THEN RAISE EXCEPTION 'Aprovação não autorizada.' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.order_change_requests WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR r.status<>'pending' OR r.requested_by=actor THEN RAISE EXCEPTION 'Solicitação indisponível ou aprovação própria proibida.'; END IF;
 IF length(btrim(coalesce(p_note,'')))<5 THEN RAISE EXCEPTION 'Informe a justificativa da decisão.'; END IF;
 PERFORM 1 FROM public.orders WHERE id=r.order_id AND superseded_at IS NULL AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pedido substituído ou excluído; solicite nova análise.'; END IF;
 IF p_approve THEN
  IF private.seller_legacy_sales_order_snapshot(r.order_id) IS DISTINCT FROM r.previous_snapshot THEN RAISE EXCEPTION 'Pedido alterado após a solicitação; solicite nova análise.'; END IF;
  result:=private.seller_legacy_sales_save_order_edit(r.proposed_args||jsonb_build_object('p_revision_note','Aprovação: '||p_note),r.proposed_followup,r.proposed_exchange);
 END IF;
 UPDATE public.order_change_requests SET status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,reviewed_by=actor,review_note=p_note,reviewed_at=now(),resulting_order_id=(result->>'id')::uuid WHERE id=r.id;
 INSERT INTO public.audit_logs(user_id,entity,entity_id,action,details) VALUES(actor,'order_change_request',r.id,CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,jsonb_build_object('order_id',r.order_id,'reason',p_note,'result',result));
 RETURN coalesce(result,'{}')||jsonb_build_object('request_id',r.id,'status',CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END);
END $$;
REVOKE ALL ON FUNCTION public.integral_review_order_change(uuid,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.integral_review_order_change(uuid,boolean,text) TO authenticated;
