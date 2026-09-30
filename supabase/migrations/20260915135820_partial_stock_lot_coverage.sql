CREATE FUNCTION public.order_item_stock_lot_quantity(p_order uuid,p_item uuid) RETURNS numeric LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT CASE WHEN o.created_at < (SELECT min(r.created_at) FROM public.stock_lot_receipts r JOIN public.supplier_stock_lots l ON l.id=r.lot_id WHERE l.item_id=p_item) THEN 0
 WHEN EXISTS(SELECT 1 FROM public.stock_lot_movements m JOIN public.stock_lot_receipts r ON r.id=m.receipt_id JOIN public.supplier_stock_lots l ON l.id=r.lot_id WHERE m.order_id=o.id AND l.item_id=p_item) THEN greatest(0,COALESCE((SELECT sum(m.quantity) FROM public.stock_lot_movements m JOIN public.stock_lot_receipts r ON r.id=m.receipt_id JOIN public.supplier_stock_lots l ON l.id=r.lot_id WHERE m.order_id=o.id AND l.item_id=p_item),0))
 ELSE COALESCE((SELECT sum(b.quantity) FROM public.stock_lot_balances b JOIN public.stock_lot_receipts r ON r.id=b.receipt_id JOIN public.supplier_stock_lots l ON l.id=r.lot_id WHERE b.warehouse_id=o.warehouse_id AND l.item_id=p_item),0) END FROM public.orders o WHERE o.id=p_order;
$$;
REVOKE ALL ON FUNCTION public.order_item_stock_lot_quantity(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.order_item_stock_lot_quantity(uuid,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.order_item_has_stock_lot(p_order uuid,p_item uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT COALESCE(public.order_item_stock_lot_quantity(p_order,p_item),0)>0 AND COALESCE(public.order_item_stock_lot_quantity(p_order,p_item),0)>=(SELECT sum(quantity) FROM public.order_items WHERE order_id=p_order AND item_id=p_item); $$;
DO $$ DECLARE definition text; anchor text:='sum(oi.quantity)::numeric AS quantity'; BEGIN
 definition:=pg_get_functiondef('public.purchase_sync_from_sales_order(uuid)'::regprocedure);
 IF position(anchor in definition)=0 THEN RAISE EXCEPTION 'Unexpected purchase quantity; review before applying'; END IF;
 EXECUTE replace(definition,anchor,'greatest(0,sum(oi.quantity)::numeric-COALESCE(public.order_item_stock_lot_quantity(sales_order.id,ii.id),0)) AS quantity');
END $$;
