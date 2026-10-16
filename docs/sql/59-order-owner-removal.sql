CREATE OR REPLACE FUNCTION private.integral_operation_allowed(actor uuid, operation text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT actor IS NOT NULL AND EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND is_active)
 AND CASE WHEN public.has_role(actor,'superadmin') THEN true WHEN EXISTS(SELECT 1 FROM public.integral_member_rules r WHERE r.user_id=actor AND r.permission_overrides ? operation)
 THEN (SELECT (r.permission_overrides->>operation)::boolean FROM public.integral_member_rules r WHERE r.user_id=actor)
 ELSE EXISTS(SELECT 1 FROM private.effective_capabilities(actor) c WHERE c=operation)
 OR (EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=actor AND role='vendedor') AND operation IN
 ('customers.view','customers.create','customers.edit','opportunities.view','opportunities.create','opportunities.edit',
 'orders.view','orders.create','orders.edit_open','orders.request_change','payments.create','payments.view','commissions.view','stock.view','history.view','reports.view'))
 OR (operation='orders.delete' AND private.integral_operation_allowed(actor,'orders.create'))
 OR (EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=actor AND role='financeiro') AND operation IN ('payments.create','payments.view','commissions.view','history.view','reports.view')) END
$function$;

CREATE OR REPLACE FUNCTION private.seller_write_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF TG_TABLE_NAME='profiles' AND TG_OP='UPDATE' AND EXISTS(
 SELECT 1 FROM private.profile_edit_context c WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.actor=auth.uid())
 THEN RETURN NULL; END IF;
 IF TG_TABLE_NAME='order_cancellation_requests' AND TG_OP='INSERT' AND EXISTS(
 SELECT 1 FROM private.seller_creation_context c WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.actor=auth.uid() AND c.operation='edit_order')
 THEN RETURN NULL; END IF;
 IF NOT private.seller_is_restricted(auth.uid()) THEN RETURN NULL; END IF;
 IF TG_TABLE_NAME IN ('bonus_awards','payroll_entries') AND TG_OP='INSERT' AND private.remuneration_can_review(auth.uid()) AND EXISTS(SELECT 1 FROM private.remuneration_action_context c WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.actor=auth.uid() AND c.mode IN ('approve','calculate','payment')) THEN RETURN NULL; END IF;
 IF TG_TABLE_NAME='notifications' AND TG_OP='INSERT' AND EXISTS(SELECT 1 FROM private.remuneration_action_context c WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.actor=auth.uid() AND c.mode IN ('approve','calculate','close','payment','replace')) THEN RETURN NULL; END IF;
 IF TG_TABLE_NAME='customers' AND TG_OP='INSERT' AND EXISTS (
   SELECT 1 FROM private.seller_creation_context c
   WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current()
     AND c.actor=auth.uid() AND c.operation='create_sale'
 ) THEN RETURN NULL; END IF;
 IF TG_TABLE_NAME IN ('delivery_tracking_sessions','tracking_view_sessions') AND TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM private.seller_creation_context c WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.actor=auth.uid() AND c.operation='edit_order') THEN RETURN NULL; END IF;
 IF TG_TABLE_NAME IN ('customers','customer_products') AND TG_OP IN ('INSERT','UPDATE') AND EXISTS(SELECT 1 FROM private.seller_creation_context c WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.actor=auth.uid() AND c.operation='crm_write') THEN RETURN NULL; END IF;
 IF TG_OP='TRUNCATE' OR NOT private.seller_in_creation() OR TG_TABLE_NAME NOT IN (
  'orders','order_items','payments','order_payment_proofs','order_audit_log',
  'inventory_items','warehouse_inventory','inventory_movements','stock_lot_balances',
  'stock_lot_receipts','stock_lot_movements','purchase_orders','purchase_order_items',
  'purchase_payments','accounts_payable','accounts_receivable','document_counters'
 ) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Seller cannot edit data.'; END IF;
 RETURN NULL;
END $function$;

CREATE OR REPLACE FUNCTION public.remuneration_request_cancellation(p_order uuid, p_reason text, p_warehouse uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor uuid:=auth.uid();o public.orders;request_id uuid; made_context boolean:=false; made_action boolean:=false;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND is_active) OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 2000 THEN RAISE EXCEPTION 'Informe o motivo e use uma conta ativa.' USING ERRCODE='42501'; END IF;
 IF NOT private.integral_operation_allowed(actor,'orders.delete') THEN RAISE EXCEPTION 'Exclusão de pedidos não concedida.' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('integral:remuneration-ledger',0));
 SELECT * INTO o FROM public.orders WHERE id=p_order AND kind IN('venda','pre_pedido') AND deleted_at IS NULL AND superseded_at IS NULL AND status<>'cancelado' FOR UPDATE;
 IF NOT FOUND OR NOT(o.seller_id=actor OR private.remuneration_can_review(actor) OR (NOT private.seller_is_restricted(actor) AND private.seller_legacy_sales_can_manage(actor,o.seller_id))) THEN RAISE EXCEPTION 'Pedido não autorizado.' USING ERRCODE='42501'; END IF;
 IF o.approval_status IS NULL THEN RAISE EXCEPTION 'Este pedido segue o fluxo anterior de cancelamento.'; END IF;
 IF p_warehouse IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.warehouses WHERE id=p_warehouse AND is_active) THEN RAISE EXCEPTION 'Estoque de retorno inválido.'; END IF;
 IF EXISTS(SELECT 1 FROM public.orders WHERE replacement_for_order_id=o.id AND status<>'cancelado' AND deleted_at IS NULL AND superseded_at IS NULL) THEN RAISE EXCEPTION 'Existe reposição ativa. Revise a reposição antes de cancelar a cobrança original.'; END IF;
 SELECT id INTO request_id FROM public.order_cancellation_requests WHERE order_id=o.id AND status='pending';
 IF request_id IS NOT NULL THEN RETURN jsonb_build_object('id',request_id,'replayed',true); END IF;
 INSERT INTO private.seller_creation_context VALUES(pg_backend_pid(),txid_current(),actor,o.id,'edit_order') ON CONFLICT DO NOTHING RETURNING true INTO made_context;
 INSERT INTO private.remuneration_action_context VALUES(pg_backend_pid(),txid_current(),actor,'approve') ON CONFLICT DO NOTHING RETURNING true INTO made_action;
 INSERT INTO public.order_cancellation_requests(order_id,requested_by,reason,return_warehouse_id) VALUES(o.id,actor,p_reason,coalesce(p_warehouse,o.warehouse_id)) RETURNING id INTO request_id;
 PERFORM private.remuneration_notify(o.id,'Cancelamento aguardando revisão','Pedido #'||o.number||': '||p_reason,'order_cancellation_requested');
 IF coalesce(made_action,false) THEN DELETE FROM private.remuneration_action_context c WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.actor=auth.uid(); END IF;
 IF coalesce(made_context,false) THEN DELETE FROM private.seller_creation_context c WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.actor=auth.uid(); END IF;
 RETURN jsonb_build_object('id',request_id,'pending',true);
END $function$;

CREATE OR REPLACE FUNCTION public.sales_delete_order(p_order_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$
DECLARE actor uuid:=auth.uid(); o public.orders; result jsonb; made_context boolean:=false;
BEGIN
 IF NOT private.integral_operation_allowed(actor,'orders.delete') OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 2000 THEN RAISE EXCEPTION 'Confira a permissão e o motivo da exclusão.' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('integral:remuneration-ledger',0));
 SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR NOT(o.seller_id=actor OR (NOT private.seller_is_restricted(actor) AND private.seller_legacy_sales_can_manage(actor,o.seller_id))) THEN RAISE EXCEPTION 'Pedido não autorizado.' USING ERRCODE='42501'; END IF;
 IF o.deleted_at IS NOT NULL THEN RETURN jsonb_build_object('id',o.id,'deleted',true,'replayed',true); END IF;
 IF o.superseded_at IS NOT NULL THEN RAISE EXCEPTION 'Utilize a versão vigente do pedido.'; END IF;
 IF o.approval_status IS NOT NULL AND NOT(
  o.approval_status IN('pending','rejected') AND o.stock_state='nenhum' AND coalesce(o.amount_paid,0)=0
  AND o.fulfillment_status NOT IN('a_caminho','entregue','perdido') AND o.workflow_stage NOT IN('a_caminho','vendido','perdido')
  AND NOT EXISTS(SELECT 1 FROM public.payments WHERE order_id=o.id AND status IN('pago','pendente'))
 ) THEN RETURN public.remuneration_request_cancellation(o.id,p_reason,NULL); END IF;
 IF o.approval_status IS NULL AND private.seller_is_restricted(actor) THEN RAISE EXCEPTION 'Solicite a revisão administrativa do pedido antigo.'; END IF;
 INSERT INTO private.seller_creation_context VALUES(pg_backend_pid(),txid_current(),actor,o.id,'edit_order') ON CONFLICT DO NOTHING RETURNING true INTO made_context;
 result:=private.seller_legacy_sales_delete_order(o.id,p_reason);
 IF coalesce(made_context,false) THEN DELETE FROM private.seller_creation_context c WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.actor=auth.uid(); END IF;
 RETURN result;
END $body$;