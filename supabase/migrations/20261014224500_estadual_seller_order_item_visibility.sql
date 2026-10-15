-- Restore item visibility for the owner of an order without opening other sellers' data.
-- The original restrictive seller_portal_read policy denied every restricted seller,
-- even when the permissive Estadual order policy allowed the order.
DROP POLICY IF EXISTS seller_portal_read ON public.order_items;
CREATE POLICY seller_portal_read ON public.order_items
AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  NOT private.seller_is_restricted((SELECT auth.uid()))
  OR public.integral_order_matches_access('vendas_estaduais',order_id,false)
);
