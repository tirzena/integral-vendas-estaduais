CREATE OR REPLACE FUNCTION public.integral_submit_order_edit(p_args jsonb, p_followup jsonb, p_exchange jsonb, p_reason text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_variable
DECLARE actor uuid:=auth.uid(); o public.orders%ROWTYPE; result jsonb; line jsonb; old_request public.order_change_requests%ROWTYPE; rid uuid;
BEGIN
 IF actor IS NULL OR p_request_id IS NULL OR length(btrim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'Identificação e justificativa são obrigatórias.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('integral:remuneration-ledger',0));
 SELECT * INTO o FROM public.orders WHERE id=(p_args->>'p_previous_order_id')::uuid AND deleted_at IS NULL AND superseded_at IS NULL FOR UPDATE;
 IF NOT FOUND OR o.status='cancelado' OR NOT (private.seller_legacy_sales_can_manage(actor,o.seller_id) OR coalesce(private.integral_order_creator(o.id)=actor,false)) OR NOT(private.integral_operation_allowed(actor,'orders.edit_open') OR private.remuneration_can_review(actor)) THEN RAISE EXCEPTION 'Pedido não autorizado para edição.' USING ERRCODE='42501'; END IF;
 IF p_followup->>'seller_id' IS DISTINCT FROM o.seller_id::text AND NOT private.remuneration_can_review(actor) THEN RAISE EXCEPTION 'Não é permitido trocar o vendedor.'; END IF;
 IF NOT (p_followup ? 'variable_cost') THEN p_followup:=p_followup||jsonb_build_object('variable_cost',o.variable_cost); END IF;
 IF NOT private.remuneration_can_review(actor) THEN
  p_followup:=p_followup||jsonb_build_object('variable_cost',o.variable_cost,'seller_id',o.seller_id,'delivered_at',o.delivered_at);
 END IF;
 IF o.approval_status='pending' THEN RAISE EXCEPTION 'Pedido aguardando revisão. Acompanhe a aprovação ou solicite ao responsável o ajuste na fila.'; END IF;
  IF NOT(private.integral_operation_allowed(actor,'orders.request_change') OR private.remuneration_can_review(actor)) THEN RAISE EXCEPTION 'Sem permissão para solicitar alteração.'; END IF;
  SELECT * INTO old_request FROM public.order_change_requests WHERE requested_by=actor AND request_id=p_request_id;
  IF FOUND THEN
   IF old_request.order_id<>o.id OR old_request.proposed_args IS DISTINCT FROM p_args OR old_request.proposed_followup IS DISTINCT FROM p_followup THEN RAISE EXCEPTION 'Identificador reutilizado com outra alteração.'; END IF;
   RETURN jsonb_build_object('request_id',old_request.id,'pending_approval',true);
  END IF;
  IF EXISTS(SELECT 1 FROM public.order_change_requests c WHERE c.order_id=o.id AND c.status='pending') THEN RAISE EXCEPTION 'Este pedido já tem uma alteração aguardando aprovação. Acompanhe a decisão nos detalhes.'; END IF;
  INSERT INTO public.order_change_requests(request_id,order_id,requested_by,reason,previous_snapshot,proposed_args,proposed_followup,proposed_exchange)
  VALUES(p_request_id,o.id,actor,p_reason,private.seller_legacy_sales_order_snapshot(o.id),p_args,p_followup,p_exchange) RETURNING id INTO rid;
  PERFORM private.remuneration_notify(o.id,'Alteração aguardando aprovação',p_reason,'order_change_requested');
  RETURN jsonb_build_object('request_id',rid,'pending_approval',true);
END $function$
;
