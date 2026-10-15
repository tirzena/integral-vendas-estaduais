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
 SELECT * INTO o FROM public.orders WHERE id=(p_args->>'p_previous_order_id')::uuid AND deleted_at IS NULL AND superseded_at IS NULL FOR UPDATE;
 IF NOT FOUND OR o.status='cancelado' OR NOT(o.seller_id=actor OR public.is_admin(actor)) OR NOT private.integral_operation_allowed(actor,'orders.edit_open') THEN RAISE EXCEPTION 'Pedido não autorizado para edição.' USING ERRCODE='42501'; END IF;
 IF p_followup->>'seller_id' IS DISTINCT FROM o.seller_id::text AND NOT public.is_admin(actor) THEN RAISE EXCEPTION 'Não é permitido trocar o vendedor.'; END IF;
 IF NOT public.is_admin(actor) THEN
  p_followup:=p_followup||jsonb_build_object('variable_cost',o.variable_cost,'seller_id',o.seller_id,'delivered_at',o.delivered_at);
 END IF;
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
   IF NOT EXISTS(SELECT 1 FROM public.order_items l WHERE l.order_id=o.id AND l.item_id=(line->>'item_id')::uuid AND l.unit_price=(line->>'unit_price')::numeric AND
     coalesce((line->>'discount')::numeric,0)/(line->>'quantity')::numeric<=coalesce(l.discount,0)/NULLIF(l.quantity,0))
   AND NOT EXISTS(SELECT 1 FROM public.inventory_items i WHERE i.id=(line->>'item_id')::uuid AND
     (line->>'unit_price')::numeric<=round(i.price/NULLIF((o.exchange_rates_snapshot->>i.currency::text)::numeric,0),2) AND
     (line->>'unit_price')::numeric-coalesce((line->>'discount')::numeric,0)/(line->>'quantity')::numeric>=
       round(i.price/NULLIF((o.exchange_rates_snapshot->>i.currency::text)::numeric,0)*(1-coalesce(i.max_discount_percent,0)/100),2))
   THEN RAISE EXCEPTION 'Preço ou desconto fora da autorização do produto.'; END IF;
  END LOOP;
  p_args:=jsonb_set(p_args,'{p_items}',(SELECT jsonb_agg(l.value||jsonb_build_object('description',i.name,'sku',i.sku,'barcode',i.barcode,'unit',i.unit,'commission_enabled',true,'commission_percent',coalesce(i.commission_percent,5),'max_discount_percent',coalesce(i.max_discount_percent,0))) FROM jsonb_array_elements(p_args->'p_items') l JOIN public.inventory_items i ON i.id=(l.value->>'item_id')::uuid));
  IF p_args->>'p_currency' IS DISTINCT FROM o.currency::text OR p_exchange IS DISTINCT FROM o.exchange_rates_snapshot THEN
   IF p_args->>'p_currency' IS DISTINCT FROM o.currency::text THEN RAISE EXCEPTION 'Alteração de moeda exige aprovação.'; END IF;
  END IF;
  INSERT INTO private.seller_creation_context VALUES(pg_backend_pid(),txid_current(),actor,o.id,'edit_order');
 END IF;
 result:=private.seller_legacy_sales_save_order_edit(p_args||jsonb_build_object('p_revision_note',p_reason),p_followup,p_exchange);
 DELETE FROM private.seller_creation_context c WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.actor=actor;
 RETURN result;
END $function$
;