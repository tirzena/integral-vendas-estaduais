-- A seller's visible catalog is the intersection of active categories granted to
-- that seller and their Estadual view permissions, not two hardcoded categories.
-- Other role policies and write restrictions remain unchanged.
DROP POLICY IF EXISTS seller_portal_read ON public.products;
CREATE POLICY seller_portal_read ON public.products
AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  NOT private.seller_is_restricted((SELECT auth.uid()))
  OR (
    is_active
    AND deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.product_users pu
      WHERE pu.user_id=(SELECT auth.uid()) AND pu.product_id=products.id
    )
    AND EXISTS (
      SELECT 1 FROM public.integral_division_access da
      WHERE da.user_id=(SELECT auth.uid())
        AND da.system_code='vendas_estaduais'
        AND da.can_view
        AND (da.product_id IS NULL OR da.product_id=products.id)
    )
  )
);
