-- Inclui categoria e subcategoria no seletor de produtos das promoções.
DROP FUNCTION IF EXISTS public.promotion_management_items();
CREATE FUNCTION public.promotion_management_items()
RETURNS TABLE(
  id uuid, name text,
  product_id uuid, product_name text,
  category_id uuid, category_name text,
  supplier_id uuid, supplier_name text, currency public.currency_code,
  sale_price numeric, cost numeric, freight_sp_percent numeric,
  freight_py_percent numeric, freight_other_brazil_percent numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT i.id, i.name,
    i.product_id, p.name,
    i.category_id, pc.name,
    i.supplier_id, s.name, i.currency, i.price,
    CASE WHEN private.current_promotion_mode(auth.uid()) IN ('admin','supplier') THEN i.cost ELSE NULL END,
    CASE WHEN private.current_promotion_mode(auth.uid()) IN ('admin','transport') THEN i.freight_sp_percent ELSE NULL END,
    CASE WHEN private.current_promotion_mode(auth.uid()) IN ('admin','transport') THEN i.freight_py_percent ELSE NULL END,
    CASE WHEN private.current_promotion_mode(auth.uid()) IN ('admin','transport') THEN i.freight_other_brazil_percent ELSE NULL END
  FROM public.inventory_items i
  LEFT JOIN public.products p ON p.id = i.product_id
  LEFT JOIN public.product_categories pc ON pc.id = i.category_id
  LEFT JOIN public.suppliers s ON s.id = i.supplier_id
  WHERE auth.uid() IS NOT NULL
    AND i.is_active
    AND (
      private.current_promotion_mode(auth.uid()) IN ('admin','transport')
      OR (
        private.current_promotion_mode(auth.uid()) = 'supplier'
        AND EXISTS (
          SELECT 1 FROM public.supplier_user_assignments sua
          WHERE sua.user_id = auth.uid() AND sua.supplier_id = i.supplier_id
        )
      )
    )
  ORDER BY p.name NULLS LAST, pc.position, pc.name, i.name
$$;
REVOKE ALL ON FUNCTION public.promotion_management_items() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promotion_management_items() TO authenticated;
