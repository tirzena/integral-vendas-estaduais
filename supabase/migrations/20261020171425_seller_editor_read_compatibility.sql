CREATE OR REPLACE FUNCTION public.sales_items_for_sale(_product_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(id uuid, name text, sku text, barcode text, brand text, variation text, unit text, price numeric, currency public.currency_code, product_id uuid, category_id uuid, available numeric, commission_percent numeric, max_discount_percent numeric, promotional_price numeric, promotion_id uuid, promotion_title text, promotion_starts_at timestamptz, promotion_ends_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
BEGIN
 IF private.seller_is_restricted(auth.uid()) THEN
  RETURN QUERY SELECT
   (i->>'id')::uuid,i->>'name',i->>'sku',i->>'barcode',NULL::text,NULL::text,i->>'unit',
   (i->>'price')::numeric,(i->>'currency')::public.currency_code,
   (i->>'product_id')::uuid,(i->>'category_id')::uuid,(i->>'available')::numeric,
   NULL::numeric,(i->>'max_discount_percent')::numeric,NULL::numeric,NULL::uuid,NULL::text,NULL::timestamptz,NULL::timestamptz
  FROM jsonb_array_elements(public.seller_portal_data()->'items') i
  WHERE _product_id IS NULL OR (i->>'product_id')::uuid=_product_id;
  RETURN;
 END IF;
 RETURN QUERY SELECT * FROM private.seller_legacy_sales_items_for_sale(_product_id);
END $fn$;
CREATE OR REPLACE FUNCTION public.sales_warehouses()
RETURNS TABLE(id uuid,name text,city text,state text,country text,parent_id uuid,level text,latitude double precision,longitude double precision)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
BEGIN
 IF private.seller_is_restricted(auth.uid()) THEN
  RETURN QUERY SELECT (w->>'id')::uuid,w->>'name',NULL::text,w->>'state',w->>'country',NULL::uuid,w->>'level',NULL::double precision,NULL::double precision
  FROM jsonb_array_elements(public.seller_portal_data()->'warehouses') w;
  RETURN;
 END IF;
 RETURN QUERY SELECT * FROM private.seller_legacy_sales_warehouses();
END $fn$;
REVOKE ALL ON FUNCTION public.sales_items_for_sale(uuid),public.sales_warehouses() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_items_for_sale(uuid),public.sales_warehouses() TO authenticated;
