CREATE TABLE IF NOT EXISTS private.order_creators (
 order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
 creator_id uuid NOT NULL REFERENCES auth.users(id),
 recorded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.order_creators ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.order_creators FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.capture_order_creator()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE creator uuid;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.previous_order_id IS NULL THEN creator:=auth.uid();
  ELSE SELECT c.creator_id INTO creator FROM private.order_creators c WHERE c.order_id=NEW.previous_order_id; END IF;
 ELSIF NEW.previous_order_id IS DISTINCT FROM OLD.previous_order_id AND NEW.previous_order_id IS NOT NULL THEN
  SELECT c.creator_id INTO creator FROM private.order_creators c WHERE c.order_id=NEW.previous_order_id;
 ELSE RETURN NEW;
 END IF;
 IF creator IS NULL THEN
  DELETE FROM private.order_creators WHERE order_id=NEW.id;
 ELSE
  INSERT INTO private.order_creators(order_id,creator_id) VALUES(NEW.id,creator)
  ON CONFLICT(order_id) DO UPDATE SET creator_id=excluded.creator_id;
 END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION private.capture_order_creator() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.integral_order_creator(p_order_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $fn$ SELECT c.creator_id FROM private.order_creators c WHERE c.order_id=p_order_id AND auth.uid() IS NOT NULL; $fn$;
REVOKE ALL ON FUNCTION private.integral_order_creator(uuid) FROM PUBLIC,anon,authenticated;
CREATE TRIGGER capture_order_creator AFTER INSERT OR UPDATE OF previous_order_id ON public.orders
FOR EACH ROW EXECUTE FUNCTION private.capture_order_creator();

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

CREATE OR REPLACE FUNCTION private.seller_legacy_sales_order_detail(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE uid uuid:=auth.uid(); o public.orders%ROWTYPE; sale_ok boolean; cost_ok boolean; payload jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  SELECT * INTO o FROM public.orders WHERE id=p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
  sale_ok := private.seller_legacy_sales_sees_all(uid) OR o.seller_id=uid OR coalesce(private.integral_order_creator(o.id)=uid,false);
  cost_ok := private.seller_legacy_app_has_cap(uid,'company_finance');
  IF NOT sale_ok AND NOT private.seller_legacy_app_has_cap(uid,'inventory_view') THEN RAISE EXCEPTION 'Sem permissão para ver este pedido.'; END IF;
  SELECT jsonb_build_object(
    'id',o.id,'number',o.number,'created_at',o.created_at,'workflow_stage',o.workflow_stage,
    'payment_status',o.payment_status,'fulfillment_status',o.fulfillment_status,
    'customer',(SELECT to_jsonb(c) - 'created_by' - 'is_demo' FROM public.customers c WHERE c.id=o.customer_id),
    'supplier',(SELECT jsonb_build_object('id',s.id,'name',s.name) FROM public.suppliers s WHERE s.id=o.supplier_id),
    'warehouse',(SELECT jsonb_build_object('id',w.id,'name',w.name,'city',w.city,'state',w.state) FROM public.warehouses w WHERE w.id=o.warehouse_id),
    'shipping',jsonb_build_object('address',o.shipping_address,'city',o.shipping_city,'state',o.shipping_state),
    'currency',o.currency,'total',CASE WHEN sale_ok THEN to_jsonb(o.total) ELSE 'null'::jsonb END,
    'discount',CASE WHEN sale_ok THEN to_jsonb(o.discount) ELSE 'null'::jsonb END,
    'cost_brl',CASE WHEN cost_ok THEN to_jsonb(o.total_cost_brl) ELSE 'null'::jsonb END,
    'cost_usd',CASE WHEN cost_ok THEN to_jsonb(o.total_cost_usd) ELSE 'null'::jsonb END,
    'paid',CASE WHEN sale_ok THEN to_jsonb(o.amount_paid) ELSE 'null'::jsonb END,
    'receivable',CASE WHEN sale_ok THEN to_jsonb(o.amount_receivable) ELSE 'null'::jsonb END,
    'cancel_reason',o.cancel_reason,'cancelled_at',o.cancelled_at,
    'items',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'description',oi.description,'sku',oi.sku,'quantity',oi.quantity,
      'unit_price',CASE WHEN sale_ok THEN to_jsonb(oi.unit_price) ELSE 'null'::jsonb END,
      'discount',CASE WHEN sale_ok THEN to_jsonb(oi.discount) ELSE 'null'::jsonb END,
      'total',CASE WHEN sale_ok THEN to_jsonb(oi.total) ELSE 'null'::jsonb END,
      'cost',CASE WHEN cost_ok THEN to_jsonb(ii.cost) ELSE 'null'::jsonb END,
      'product',p.name,'subcategory',pc.name,'supplier',s.name
    ) ORDER BY oi.created_at) FROM public.order_items oi
      LEFT JOIN public.inventory_items ii ON ii.id=oi.item_id
      LEFT JOIN public.products p ON p.id=ii.product_id
      LEFT JOIN public.product_categories pc ON pc.id=ii.category_id
      LEFT JOIN public.suppliers s ON s.id=coalesce(ii.supplier_id,o.supplier_id)
      WHERE oi.order_id=o.id),'[]'::jsonb)
  ) INTO payload;
  RETURN payload;
END $function$
;

CREATE OR REPLACE FUNCTION public.integral_order_context(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_variable
DECLARE actor uuid:=auth.uid(); o public.orders%ROWTYPE; result jsonb;
BEGIN
 IF actor IS NULL OR (NOT private.integral_operation_allowed(actor,'orders.view') AND NOT (NOT private.seller_is_restricted(actor) AND private.seller_legacy_sales_sees_all(actor))) THEN RAISE EXCEPTION 'Sem permissão para consultar pedidos.' USING ERRCODE='42501'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=p_order_id AND deleted_at IS NULL AND superseded_at IS NULL;
 IF NOT FOUND OR NOT(o.seller_id=actor OR coalesce(private.integral_order_creator(o.id)=actor,false) OR (NOT private.seller_is_restricted(actor) AND private.seller_legacy_sales_sees_all(actor))) THEN RAISE EXCEPTION 'Pedido vigente não autorizado.' USING ERRCODE='42501'; END IF;
 result:=private.seller_legacy_sales_order_detail(o.id);
 RETURN result||jsonb_build_object('order',CASE WHEN private.remuneration_can_review(actor) THEN to_jsonb(o) ELSE to_jsonb(o)-ARRAY['total_cost_usd','total_cost_brl','gross_margin','source_payload','merchandise_cost','variable_cost','transport_cost','transport_currency','transport_cost_order_amount'] END,
 'items',coalesce((SELECT jsonb_agg(to_jsonb(l)) FROM public.order_items l WHERE l.order_id=o.id),'[]'::jsonb),
 'history',coalesce((SELECT jsonb_agg(jsonb_build_object('id',l.id,'action',l.action,'note',l.note,'created_at',l.created_at,'changed_by',l.changed_by) ORDER BY l.created_at DESC) FROM public.order_audit_log l WHERE l.root_order_id=coalesce(o.root_order_id,o.id) OR l.order_id=o.id),'[]'::jsonb),
 'registeredPayments',coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM public.payments p WHERE p.order_id=o.id),'[]'::jsonb),
 'proofs',coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM public.order_payment_proofs p WHERE p.order_id=o.id),'[]'::jsonb),
 'exchange_rates_snapshot',o.exchange_rates_snapshot,'exchange_rate_source',o.exchange_rate_source,'exchange_rate_locked_at',o.exchange_rate_locked_at,
 'requires_approval',true,'can_edit',(private.integral_operation_allowed(actor,'orders.edit_open') AND o.approval_status IS DISTINCT FROM 'pending' AND NOT EXISTS(SELECT 1 FROM public.order_change_requests c WHERE c.order_id=o.id AND c.status='pending')),
 'can_pay',private.integral_operation_allowed(actor,'payments.create'),'can_delete',private.integral_operation_allowed(actor,'orders.delete'));
END $function$
;

CREATE OR REPLACE FUNCTION public.integral_order_matches_access(p_system_code text, p_order_id uuid, p_write boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.orders o
    where o.id = p_order_id
      and (
        not private.seller_is_restricted((select auth.uid()))
        or o.seller_id = (select auth.uid())
        or private.integral_order_creator(o.id) = (select auth.uid())
      )
      and (
        public.integral_can_access_record(
          p_system_code, o.shipping_state, null, o.product_id, p_write, CASE WHEN private.integral_order_creator(o.id)=(select auth.uid()) THEN (select auth.uid()) ELSE o.seller_id END
        )
        or exists (
          select 1
          from public.order_items oi
          join public.inventory_items ii on ii.id = oi.item_id
          where oi.order_id = o.id
            and public.integral_can_access_record(
              p_system_code, o.shipping_state, null, ii.product_id, p_write, CASE WHEN private.integral_order_creator(o.id)=(select auth.uid()) THEN (select auth.uid()) ELSE o.seller_id END
            )
        )
      )
  )
$function$
;
