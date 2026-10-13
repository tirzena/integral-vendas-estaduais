-- Match categories on the header or on any order line, without exposing unauthorized orders.
CREATE OR REPLACE FUNCTION private.estadual_order_ids_for_product(p_product_id uuid)
RETURNS TABLE(id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT o.id FROM public.orders o
 WHERE auth.uid() IS NOT NULL
 AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.is_active)
 AND o.deleted_at IS NULL AND o.superseded_at IS NULL
 AND public.integral_order_matches_access('vendas_estaduais',o.id,false)
 AND (o.product_id=p_product_id OR EXISTS(
 SELECT 1 FROM public.order_items l JOIN public.inventory_items i ON i.id=l.item_id
 WHERE l.order_id=o.id AND i.product_id=p_product_id))
$$;
REVOKE ALL ON FUNCTION private.estadual_order_ids_for_product(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.estadual_order_ids_for_product(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.estadual_order_ids_for_product(p_product_id uuid)
RETURNS TABLE(id uuid)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT * FROM private.estadual_order_ids_for_product(p_product_id)
$$;
REVOKE ALL ON FUNCTION public.estadual_order_ids_for_product(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.estadual_order_ids_for_product(uuid) TO authenticated;
