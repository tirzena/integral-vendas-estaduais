-- Finance capability needs read-only access to the purchase/lot inputs used to
-- calculate billed purchase cost positions. These tables remain protected by RLS.
GRANT SELECT ON public.stock_lot_receipts, public.stock_lot_movements TO authenticated;

DROP POLICY IF EXISTS purchase_orders_finance_read ON public.purchase_orders;
CREATE POLICY purchase_orders_finance_read
ON public.purchase_orders FOR SELECT TO authenticated
USING (public.app_has_cap((select auth.uid()), 'company_finance'));

DROP POLICY IF EXISTS purchase_order_items_finance_read ON public.purchase_order_items;
CREATE POLICY purchase_order_items_finance_read
ON public.purchase_order_items FOR SELECT TO authenticated
USING (public.app_has_cap((select auth.uid()), 'company_finance'));

DROP POLICY IF EXISTS stock_lot_receipts_finance_read ON public.stock_lot_receipts;
CREATE POLICY stock_lot_receipts_finance_read
ON public.stock_lot_receipts FOR SELECT TO authenticated
USING (public.app_has_cap((select auth.uid()), 'company_finance'));

DROP POLICY IF EXISTS stock_lot_movements_finance_read ON public.stock_lot_movements;
CREATE POLICY stock_lot_movements_finance_read
ON public.stock_lot_movements FOR SELECT TO authenticated
USING (public.app_has_cap((select auth.uid()), 'company_finance'));
