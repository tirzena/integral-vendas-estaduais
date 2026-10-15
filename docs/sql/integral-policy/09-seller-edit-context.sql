CREATE OR REPLACE FUNCTION private.seller_in_creation()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT EXISTS(SELECT 1 FROM private.seller_creation_context c
 WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current()
 AND c.actor=auth.uid() AND c.operation IN ('create_sale','register_payment','edit_order'))
$function$
;
CREATE OR REPLACE FUNCTION private.seller_creation_can_manage(p_actor uuid, p_seller uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT (NOT private.seller_is_restricted(auth.uid()) AND public.sales_can_manage(p_actor,p_seller)) OR (p_actor=auth.uid() AND p_seller=p_actor AND EXISTS (
 SELECT 1 FROM private.seller_creation_context c JOIN public.orders o ON o.id=c.new_order_id
 WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current()
 AND c.actor=p_actor AND c.operation IN ('create_sale','register_payment','edit_order') AND o.seller_id=p_actor))
$function$
;
CREATE OR REPLACE FUNCTION private.seller_write_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF NOT private.seller_is_restricted(auth.uid()) THEN RETURN NULL; END IF;
 IF TG_TABLE_NAME='customers' AND TG_OP='INSERT' AND EXISTS (
   SELECT 1 FROM private.seller_creation_context c
   WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current()
     AND c.actor=auth.uid() AND c.operation='create_sale'
 ) THEN RETURN NULL; END IF;
 IF TG_TABLE_NAME IN ('delivery_tracking_sessions','tracking_view_sessions') AND TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM private.seller_creation_context c WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.actor=auth.uid() AND c.operation='edit_order') THEN RETURN NULL; END IF;
 IF TG_OP='TRUNCATE' OR NOT private.seller_in_creation() OR TG_TABLE_NAME NOT IN (
  'orders','order_items','payments','order_payment_proofs','order_audit_log',
  'inventory_items','warehouse_inventory','inventory_movements','stock_lot_balances',
  'stock_lot_receipts','stock_lot_movements','purchase_orders','purchase_order_items',
  'purchase_payments','accounts_payable','accounts_receivable','document_counters'
 ) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Seller cannot edit data.'; END IF;
 RETURN NULL;
END $function$
;
