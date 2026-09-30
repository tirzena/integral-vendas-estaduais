-- Regras comerciais e de frete passam a pertencer exclusivamente ao produto.
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS freight_sp_percent numeric(6,2) NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS freight_py_percent numeric(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS freight_other_brazil_percent numeric(6,2) NOT NULL DEFAULT 25;

UPDATE public.inventory_items
SET max_discount_percent = 0
WHERE max_discount_percent IS NULL;

ALTER TABLE public.inventory_items
  ALTER COLUMN max_discount_percent SET DEFAULT 0,
  ALTER COLUMN max_discount_percent SET NOT NULL;

ALTER TABLE public.inventory_items DROP CONSTRAINT IF EXISTS inventory_items_freight_sp_percent_check;
ALTER TABLE public.inventory_items ADD CONSTRAINT inventory_items_freight_sp_percent_check
  CHECK (freight_sp_percent BETWEEN 0 AND 100);
ALTER TABLE public.inventory_items DROP CONSTRAINT IF EXISTS inventory_items_freight_py_percent_check;
ALTER TABLE public.inventory_items ADD CONSTRAINT inventory_items_freight_py_percent_check
  CHECK (freight_py_percent BETWEEN 0 AND 100);
ALTER TABLE public.inventory_items DROP CONSTRAINT IF EXISTS inventory_items_freight_other_brazil_percent_check;
ALTER TABLE public.inventory_items ADD CONSTRAINT inventory_items_freight_other_brazil_percent_check
  CHECK (freight_other_brazil_percent BETWEEN 0 AND 100);

-- A consulta do pedido usa somente os limites gravados no produto.
DROP FUNCTION IF EXISTS public.sales_items_for_sale(uuid);
CREATE FUNCTION public.sales_items_for_sale(_product_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid,name text,sku text,barcode text,brand text,variation text,
  unit text,price numeric,currency public.currency_code,product_id uuid,category_id uuid,
  available numeric,commission_percent numeric,max_discount_percent numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT i.id,i.name,i.sku,i.barcode,i.brand,i.variation,i.unit,i.price,i.currency,
    i.product_id,i.category_id,greatest(coalesce(i.quantity,0)-coalesce(i.reserved,0),0),
    coalesce(i.commission_percent,5),coalesce(i.max_discount_percent,0)
  FROM public.inventory_items i
  WHERE i.is_active AND auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=auth.uid()
      AND ur.role IN ('superadmin','admin','gestor','financeiro','vendedor','estoque'))
    AND (_product_id IS NULL OR i.product_id=_product_id)
    AND (i.product_id IS NULL OR public.has_product_access(auth.uid(),i.product_id)
      OR public.sales_sees_all(auth.uid()))
  ORDER BY i.name LIMIT 2000
$$;
REVOKE ALL ON FUNCTION public.sales_items_for_sale(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_items_for_sale(uuid) TO authenticated;
