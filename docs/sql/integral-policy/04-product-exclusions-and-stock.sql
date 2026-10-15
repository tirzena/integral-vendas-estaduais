CREATE OR REPLACE FUNCTION private.seller_item_allowed(p_actor uuid, p_item uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.inventory_items i
    join public.products p on p.id=i.product_id
    where NOT EXISTS(SELECT 1 FROM public.integral_member_rules r WHERE r.user_id=p_actor AND
        (i.id=ANY(r.excluded_item_ids) OR i.category_id=ANY(r.excluded_category_ids) OR
        (NOT r.inherit_new_products AND NOT EXISTS(SELECT 1 FROM public.inventory_item_users x WHERE x.user_id=p_actor AND x.item_id=i.id))))
      and i.id=p_item and i.is_active and p.is_active and p.deleted_at is null
      and exists (select 1 from public.product_users pu
                  where pu.user_id=p_actor and pu.product_id=p.id)
      and (i.category_id is null or exists (
        select 1 from public.product_categories c
        where c.id=i.category_id and c.product_id=p.id
      ))
  )
$function$;
CREATE OR REPLACE FUNCTION private.seller_calculate(p_actor uuid, p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE currency public.currency_code; exchange jsonb; base text; mode text; key text; rate numeric;
 line jsonb; item public.inventory_items%ROWTYPE; warehouse uuid; scope text; quantity numeric;
 discount_percent numeric; unit_price numeric; discount numeric; line_total numeric; freight numeric:=0;
 gross numeric:=0; commission numeric:=0; lines jsonb:='[]'; available numeric; freight_percent numeric;
 promo record; destination jsonb; shipping_base numeric:=0;
BEGIN
 IF jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR EXISTS(
 SELECT 1 FROM jsonb_object_keys(p_request) k WHERE k NOT IN ('currency','exchange','warehouse_id','destination','items','customer','notes'))
 THEN RAISE EXCEPTION 'Invalid sale request fields.'; END IF;
 currency:=(p_request->>'currency')::public.currency_code;
 IF currency IS NULL THEN RAISE EXCEPTION 'Choose a currency.'; END IF;
 destination:=p_request->'destination';
 IF jsonb_typeof(destination) IS DISTINCT FROM 'object' OR EXISTS(
 SELECT 1 FROM jsonb_object_keys(destination) k WHERE k NOT IN ('country','state','city','address','number','recipient_name','phone'))
 OR coalesce(length(btrim(destination->>'state')),0)=0
 OR coalesce(length(btrim(destination->>'country')),0)=0
 OR coalesce(length(btrim(destination->>'address')),0)=0
 OR coalesce(length(btrim(destination->>'city')),0)=0
 OR EXISTS(SELECT 1 FROM jsonb_each_text(destination) e WHERE length(e.value)>250)
 THEN RAISE EXCEPTION 'Complete the delivery address.'; END IF;
 -- Same country/state classification as shipping.functions.ts, using actual order destination.
 scope:=CASE WHEN upper(btrim(destination->>'country')) IN ('PARAGUAI','PARAGUAY')
 OR upper(btrim(destination->>'state')) IN ('PY','PARAGUAI') THEN 'py'
 WHEN upper(btrim(destination->>'state')) IN ('SP','SÃO PAULO','SAO PAULO') THEN 'sp' ELSE 'other_brazil' END;
 warehouse:=(p_request->>'warehouse_id')::uuid;
 IF warehouse IS NULL OR NOT EXISTS(SELECT 1 FROM public.warehouses w WHERE w.id=warehouse AND w.is_active)
 THEN RAISE EXCEPTION 'Choose an active warehouse.'; END IF;
 IF EXISTS(SELECT 1 FROM public.integral_member_rules WHERE user_id=p_actor)
 AND NOT EXISTS(SELECT 1 FROM public.warehouse_user_assignments a WHERE a.user_id=p_actor AND a.warehouse_id=warehouse)
 THEN RAISE EXCEPTION 'Estoque não concedido ao membro.' USING ERRCODE='42501'; END IF;
 exchange:=p_request->'exchange'; mode:=coalesce(exchange->>'mode','automatic');
 IF mode NOT IN ('automatic','manual') THEN RAISE EXCEPTION 'Invalid exchange mode.'; END IF;
 IF mode='manual' THEN
  IF jsonb_typeof(exchange) IS DISTINCT FROM 'object' OR exchange->>'base' IS DISTINCT FROM currency::text OR EXISTS(
  SELECT 1 FROM jsonb_object_keys(exchange) k WHERE k NOT IN ('base','mode','USD','BRL','PYG'))
  THEN RAISE EXCEPTION 'Invalid manual exchange.'; END IF;
 ELSE
  IF exchange IS NOT NULL AND exchange<>'null'::jsonb AND (
   jsonb_typeof(exchange)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(exchange) k WHERE k<>'mode'))
   THEN RAISE EXCEPTION 'Automatic rates must be calculated by the server.'; END IF;
  exchange:=jsonb_build_object('base',currency,'mode','automatic');
  FOREACH key IN ARRAY ARRAY['USD','BRL','PYG'] LOOP
   SELECT r.rate INTO rate FROM private.seller_legacy_financial_rate_at(currency,key::public.currency_code,now()) r LIMIT 1;
   exchange:=exchange||jsonb_build_object(key,rate);
  END LOOP;
 END IF;
 FOREACH key IN ARRAY ARRAY['USD','BRL','PYG'] LOOP
  rate:=(exchange->>key)::numeric;
  IF rate IS NULL OR rate<=0 OR rate>1000000000 OR rate::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid exchange rate.'; END IF;
 END LOOP;
 IF abs((exchange->>currency::text)::numeric-1)>0.00000001 THEN RAISE EXCEPTION 'Invalid base rate.'; END IF;
 IF jsonb_typeof(p_request->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_request->'items') NOT BETWEEN 1 AND 100
 THEN RAISE EXCEPTION 'Choose 1 to 100 items.'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_request->'items') e GROUP BY e->>'item_id' HAVING count(*)>1)
 THEN RAISE EXCEPTION 'Duplicate item lines are not permitted.'; END IF;
 -- Lock ordering is stable across concurrent quote/create operations.
 FOR line IN SELECT value FROM jsonb_array_elements(p_request->'items') ORDER BY value->>'item_id' LOOP
  IF jsonb_typeof(line) IS DISTINCT FROM 'object' OR EXISTS(
  SELECT 1 FROM jsonb_object_keys(line) k WHERE k NOT IN ('item_id','quantity','discount_percent'))
  THEN RAISE EXCEPTION 'Invalid item fields.'; END IF;
  IF NOT private.seller_item_allowed(p_actor,(line->>'item_id')::uuid) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Item unavailable or not assigned.'; END IF;
  SELECT * INTO item FROM public.inventory_items i WHERE i.id=(line->>'item_id')::uuid FOR SHARE;
  quantity:=(line->>'quantity')::numeric;
  discount_percent:=coalesce((line->>'discount_percent')::numeric,0);
  IF quantity IS NULL OR quantity<=0 OR quantity>1000000 OR quantity::text IN ('NaN','Infinity','-Infinity')
  OR quantity<>round(quantity,3) OR discount_percent<0 OR discount_percent>coalesce(item.max_discount_percent,0)
  OR discount_percent::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid quantity or discount.'; END IF;
  SELECT w.quantity-w.reserved INTO available FROM public.warehouse_inventory w
  WHERE w.warehouse_id=warehouse AND w.item_id=item.id FOR SHARE;
  IF available IS NULL OR quantity>available THEN RAISE EXCEPTION 'Insufficient stock in selected warehouse.'; END IF;
  unit_price:=item.price/(exchange->>item.currency::text)::numeric;
  IF item.price IS NULL OR item.price<0 OR item.price::text IN ('NaN','Infinity','-Infinity')
  OR item.cost IS NULL OR item.cost<0 OR item.cost::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Item pricing unavailable.'; END IF;
  -- Only admin-origin sale price promotions can change the administrator price.
  SELECT p.promotional_sale_price,p.currency INTO promo FROM public.promotions p
  WHERE p.item_id=item.id AND p.origin_type='admin' AND p.status='active' AND now() BETWEEN p.starts_at AND p.ends_at
  AND p.destination_scope IN ('all',scope)
  ORDER BY p.promotional_sale_price/(exchange->>p.currency::text)::numeric,p.ends_at,p.id LIMIT 1;
  IF FOUND THEN unit_price:=least(unit_price,promo.promotional_sale_price/(exchange->>promo.currency::text)::numeric); END IF;
  unit_price:=round(unit_price,2);
  discount:=round(quantity*unit_price*discount_percent/100,2);
  line_total:=round(quantity*unit_price-discount,2);
  freight_percent:=CASE scope WHEN 'py' THEN item.freight_py_percent WHEN 'sp' THEN item.freight_sp_percent ELSE item.freight_other_brazil_percent END;
  -- Shipping parity: cheapest current matching freight promotion, then item rule;
  -- base is internal item cost, converted with the same locked exchange snapshot.
  SELECT p.promotional_freight_percent INTO rate FROM public.promotions p
  WHERE p.item_id=item.id AND p.status='active' AND now() BETWEEN p.starts_at AND p.ends_at
  AND p.promotional_freight_percent IS NOT NULL AND p.destination_scope IN ('all',scope)
  ORDER BY p.promotional_freight_percent,p.id LIMIT 1;
  IF FOUND THEN freight_percent:=rate; END IF;
  shipping_base:=shipping_base+item.cost*quantity/(exchange->>item.currency::text)::numeric;
  freight:=freight+item.cost*quantity/(exchange->>item.currency::text)::numeric*freight_percent/100;
  gross:=gross+line_total; commission:=commission+round(line_total*coalesce(item.commission_percent,5)/100,2);
  lines:=lines||jsonb_build_array(jsonb_build_object('item_id',item.id,'product_id',item.product_id,
  'description',item.name,'sku',item.sku,'barcode',item.barcode,'unit',item.unit,'quantity',quantity,
  'unit_price',unit_price,'discount',discount,'total',line_total,
  'commission_percent',coalesce(item.commission_percent,5),'commission_amount',round(line_total*coalesce(item.commission_percent,5)/100,2),
  'max_discount_percent',coalesce(item.max_discount_percent,0)));
 END LOOP;
 -- Percentage is NEVER returned: cost could be inferred from freight / percentage.
 RETURN jsonb_build_object('currency',currency,'exchange',exchange,'items',lines,'subtotal',gross,
 'shipping_cost',round(freight,2),'total',round(gross+freight,2),'commission_total',commission);
END $function$
;