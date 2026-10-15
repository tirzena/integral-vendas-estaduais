-- Only orders created after this migration receive an agreement snapshot.
CREATE TABLE private.integral_order_compensation_rules (
 order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
 seller_id uuid NOT NULL,
 rules jsonb NOT NULL CHECK(jsonb_typeof(rules)='array'),
 item_scopes jsonb NOT NULL DEFAULT '{}'::jsonb,
 baseline jsonb NOT NULL DEFAULT '{}'::jsonb,
 captured_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.integral_order_compensation_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.integral_order_compensation_rules FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.integral_lock_compensation_changes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid;
BEGIN
 FOR uid IN SELECT DISTINCT u FROM unnest(ARRAY[CASE WHEN TG_OP<>'INSERT' THEN OLD.user_id END,CASE WHEN TG_OP<>'DELETE' THEN NEW.user_id END]) u WHERE u IS NOT NULL ORDER BY u LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended('integral:compensation:'||uid::text,0));
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.integral_lock_compensation_changes() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER integral_compensation_write_lock BEFORE INSERT OR UPDATE OR DELETE ON public.member_compensations FOR EACH ROW EXECUTE FUNCTION private.integral_lock_compensation_changes();

CREATE FUNCTION private.integral_compensation_rules_for_user(p_user uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('integral:compensation:'||p_user::text,0));
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'item_id',c.item_id,'category_id',c.category_id,'product_id',c.product_id,'comp_type',c.comp_type,'amount',c.amount,'currency',c.currency,'period',c.period,'label',c.label) ORDER BY c.id),'[]'::jsonb)
 INTO result FROM public.member_compensations c WHERE c.user_id=p_user AND c.active AND c.period='per_sale';
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION private.integral_compensation_rules_for_user(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.integral_calculate_commission_rules(p_lines jsonb,p_exchange jsonb,p_rules jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_typeof(p_rules) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Itens ou acordos inválidos.'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_rules) r WHERE r->>'comp_type'='fixed' AND (coalesce((p_exchange->>(r->>'currency'))::numeric,0)<=0 OR (p_exchange->>(r->>'currency'))::numeric::text IN ('NaN','Infinity','-Infinity'))) THEN RAISE EXCEPTION 'Cotação do acordo indisponível.'; END IF;
 WITH lines AS (
  SELECT e.value payload,e.ordinality ord,nullif(e.value->>'item_id','')::uuid item_id,
   coalesce(nullif(e.value->>'product_id','')::uuid,i.product_id) product_id,
   CASE WHEN e.value ? 'category_id' THEN nullif(e.value->>'category_id','')::uuid ELSE i.category_id END category_id,
   greatest(0,coalesce((e.value->>'total')::numeric,0)) basis
  FROM jsonb_array_elements(p_lines) WITH ORDINALITY e LEFT JOIN public.inventory_items i ON i.id=nullif(e.value->>'item_id','')::uuid
 ), rules AS (
  SELECT r.*,CASE WHEN r.item_id IS NOT NULL THEN 3 WHEN r.category_id IS NOT NULL THEN 2 WHEN r.product_id IS NOT NULL THEN 1 ELSE 0 END specificity
  FROM jsonb_to_recordset(p_rules) AS r(id uuid,item_id uuid,category_id uuid,product_id uuid,comp_type text,amount numeric,currency text)
 ), matches AS (
  SELECT l.ord,l.basis,r.*,max(r.specificity) OVER(PARTITION BY l.ord) highest
  FROM lines l JOIN rules r ON (r.item_id IS NULL OR r.item_id=l.item_id) AND (r.category_id IS NULL OR r.category_id=l.category_id) AND (r.product_id IS NULL OR r.product_id=l.product_id)
 ), chosen AS (SELECT * FROM matches WHERE specificity=highest), shares AS (
  SELECT *,round(amount/(p_exchange->>currency)::numeric,2) fixed_target,
   CASE WHEN sum(basis) OVER(PARTITION BY id)>0 THEN basis/sum(basis) OVER(PARTITION BY id) ELSE 1::numeric/count(*) OVER(PARTITION BY id) END weight,
   row_number() OVER(PARTITION BY id ORDER BY ord DESC) remainder_line
  FROM chosen
 ), pieces AS (
  SELECT *,trunc(fixed_target*weight,2) fixed_piece FROM shares
 ), amounts AS (
  SELECT ord,comp_type,amount,
   CASE WHEN comp_type='percent' THEN round(basis*amount/100,2)
    ELSE fixed_piece+CASE WHEN remainder_line=1 THEN fixed_target-sum(fixed_piece) OVER(PARTITION BY id) ELSE 0 END END earned
  FROM pieces
 ), totals AS (
  SELECT ord,sum(earned) earned,coalesce(sum(amount) FILTER(WHERE comp_type='percent'),0) percentage FROM amounts GROUP BY ord
 ), output AS (
  SELECT l.ord,l.payload||CASE WHEN t.ord IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('commission_enabled',true,'commission_percent',t.percentage,'commission_amount',t.earned,'commission_source','agreement') END payload,
   coalesce(t.earned,(l.payload->>'commission_amount')::numeric,0) earned,coalesce(t.percentage,0) percentage
  FROM lines l LEFT JOIN totals t ON t.ord=l.ord
 )
 SELECT jsonb_build_object('items',coalesce(jsonb_agg(payload ORDER BY ord),'[]'::jsonb),'commission_total',coalesce(sum(earned),0),'valid',coalesce(bool_and(percentage BETWEEN 0 AND 100),true)) INTO result FROM output;
 IF NOT (result->>'valid')::boolean THEN RAISE EXCEPTION 'Os percentuais dos acordos no mesmo escopo ultrapassam 100%%.'; END IF;
 RETURN result-'valid';
END $$;
REVOKE ALL ON FUNCTION private.integral_calculate_commission_rules(jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.integral_capture_order_compensation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.kind NOT IN ('venda','pre_pedido') OR NEW.seller_id IS NULL THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM private.seller_creation_context c WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.actor=auth.uid() AND c.operation='edit_order') THEN RETURN NEW; END IF;
 IF NEW.previous_order_id IS NOT NULL OR (NEW.root_order_id IS NOT NULL AND NEW.root_order_id<>NEW.id) THEN
  INSERT INTO private.integral_order_compensation_rules(order_id,seller_id,rules,item_scopes,baseline)
  SELECT NEW.id,seller_id,rules,item_scopes,baseline FROM private.integral_order_compensation_rules WHERE order_id=coalesce(NEW.previous_order_id,NEW.root_order_id);
 ELSE
  INSERT INTO private.integral_order_compensation_rules(order_id,seller_id,rules) VALUES(NEW.id,NEW.seller_id,private.integral_compensation_rules_for_user(NEW.seller_id));
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.integral_capture_order_compensation() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER integral_capture_order_compensation AFTER INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION private.integral_capture_order_compensation();

CREATE OR REPLACE FUNCTION private.integral_apply_order_compensation(p_order_id uuid, p_refresh_baseline boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_variable
DECLARE o public.orders%ROWTYPE; s private.integral_order_compensation_rules%ROWTYPE; l record; key text; scopes jsonb; baseline jsonb; lines jsonb:='[]'; outcome jsonb; exchange jsonb; code text; rate numeric;
BEGIN
 SELECT * INTO s FROM private.integral_order_compensation_rules WHERE order_id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 SELECT * INTO o FROM public.orders WHERE id=p_order_id;
 IF NOT FOUND OR o.deleted_at IS NOT NULL OR o.superseded_at IS NOT NULL OR o.status='cancelado' THEN RETURN; END IF;
 IF s.seller_id IS DISTINCT FROM o.seller_id THEN
  s.captured_at:=now();s.seller_id:=o.seller_id;s.rules:=private.integral_compensation_rules_for_user(o.seller_id);
 END IF;
 scopes:=s.item_scopes;baseline:=s.baseline;exchange:=o.exchange_rates_snapshot;
 IF exchange IS NULL THEN
  exchange:=jsonb_build_object('base',o.currency);
  FOREACH code IN ARRAY ARRAY['BRL','USD','PYG'] LOOP
   SELECT r.rate INTO rate FROM private.seller_legacy_financial_rate_at(o.currency,code::public.currency_code,o.created_at) r LIMIT 1;
   exchange:=exchange||jsonb_build_object(code,rate);
  END LOOP;
 END IF;
 FOR l IN SELECT oi.*,coalesce(i.product_id,o.product_id) product_id,i.category_id,i.commission_percent catalog_commission_percent FROM public.order_items oi LEFT JOIN public.inventory_items i ON i.id=oi.item_id WHERE oi.order_id=o.id ORDER BY oi.created_at,oi.id LOOP
  key:=coalesce(l.item_id::text,'manual')||':'||coalesce(l.description,'');
  IF NOT (scopes ? key) THEN scopes:=scopes||jsonb_build_object(key,jsonb_build_object('product_id',l.product_id,'category_id',l.category_id)); END IF;
  IF p_refresh_baseline OR NOT (baseline ? key) THEN baseline:=baseline||jsonb_build_object(key,jsonb_build_object('commission_enabled',CASE WHEN o.origin='seller_portal' AND NOT (baseline ? key) THEN true ELSE l.commission_enabled END,'commission_percent',CASE WHEN o.origin='seller_portal' AND NOT (baseline ? key) THEN coalesce(l.catalog_commission_percent,5) ELSE l.commission_percent END)); END IF;
  lines:=lines||jsonb_build_array(jsonb_build_object('line_id',l.id,'item_id',l.item_id,'total',l.total,
   'commission_enabled',coalesce((baseline->key->>'commission_enabled')::boolean,false),
   'commission_percent',coalesce((baseline->key->>'commission_percent')::numeric,0),
   'commission_amount',CASE WHEN coalesce((baseline->key->>'commission_enabled')::boolean,false) THEN round(greatest(0,l.total)*coalesce((baseline->key->>'commission_percent')::numeric,0)/100,2) ELSE 0 END)||(scopes->key));
 END LOOP;
 outcome:=private.integral_calculate_commission_rules(lines,exchange,s.rules);
 FOR l IN SELECT value FROM jsonb_array_elements(outcome->'items') LOOP
  UPDATE public.order_items SET commission_enabled=coalesce((l.value->>'commission_enabled')::boolean,false),commission_percent=coalesce((l.value->>'commission_percent')::numeric,0),commission_amount=coalesce((l.value->>'commission_amount')::numeric,0)
  WHERE id=(l.value->>'line_id')::uuid;
 END LOOP;
 UPDATE private.integral_order_compensation_rules SET seller_id=s.seller_id,captured_at=s.captured_at,rules=s.rules,item_scopes=scopes,baseline=baseline WHERE order_id=o.id;
 UPDATE public.orders SET commission_total=(outcome->>'commission_total')::numeric,commission_enabled=EXISTS(SELECT 1 FROM public.order_items WHERE order_id=o.id AND commission_enabled) WHERE id=o.id;
END $function$;
REVOKE ALL ON FUNCTION private.integral_apply_order_compensation(uuid,boolean) FROM PUBLIC,anon,authenticated;

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
 promo record; destination jsonb; shipping_base numeric:=0; rules jsonb; compensation jsonb;
BEGIN
 rules:=private.integral_compensation_rules_for_user(p_actor);
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
 compensation:=private.integral_calculate_commission_rules(lines,exchange,rules);
 lines:=compensation->'items'; commission:=(compensation->>'commission_total')::numeric;
 -- Percentage is NEVER returned: cost could be inferred from freight / percentage.
 RETURN jsonb_build_object('currency',currency,'exchange',exchange,'items',lines,'subtotal',gross,
 'shipping_cost',round(freight,2),'total',round(gross+freight,2),'commission_total',commission);
END $function$
;
CREATE OR REPLACE FUNCTION public.seller_portal_create_sale(p_request jsonb, p_request_id uuid, p_payment jsonb, p_expected_quote jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_actor uuid:=private.seller_require_actor(); quote jsonb; existing record; order_id uuid:=gen_random_uuid();
 number integer; line jsonb; currency public.currency_code; method text; received numeric; credited numeric;
 payment_id uuid; proof_id uuid; payment_result jsonb; customer jsonb; destination jsonb; fingerprint jsonb; product_id uuid; context_order uuid;
BEGIN
 IF NOT private.integral_operation_allowed(auth.uid(),'orders.create') THEN RAISE EXCEPTION 'Operação não concedida: orders.create' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL THEN RAISE EXCEPTION 'Request ID is required.'; END IF;
 -- Seller-wide serialization avoids stock/share-lock upgrade deadlocks and double clicks.
 PERFORM pg_advisory_xact_lock(hashtextextended('seller-sale:'||v_actor::text,0));
 fingerprint:=jsonb_build_object('request',p_request,'payment',p_payment,'expected',p_expected_quote);
 SELECT * INTO existing FROM private.seller_sale_requests r WHERE r.actor=v_actor AND r.request_id=p_request_id;
 IF FOUND THEN
  IF existing.request IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'Request ID already used with different data.'; END IF;
  RETURN jsonb_build_object('id',existing.order_id,'number',(SELECT o.number FROM public.orders o WHERE o.id=existing.order_id),'replayed',true);
 END IF;
 PERFORM private.integral_compensation_rules_for_user(v_actor);
 -- Acquire exclusive inventory locks BEFORE the shared calculator. Revalidate grants
 -- after locks; competing sellers cannot sell the same remaining units.
 PERFORM 1 FROM public.inventory_items i WHERE i.id IN (
 SELECT (e->>'item_id')::uuid FROM jsonb_array_elements(p_request->'items') e) ORDER BY i.id FOR UPDATE;
 PERFORM 1 FROM public.warehouse_inventory w WHERE w.warehouse_id=(p_request->>'warehouse_id')::uuid
 AND w.item_id IN (SELECT (e->>'item_id')::uuid FROM jsonb_array_elements(p_request->'items') e) ORDER BY w.item_id FOR UPDATE;
 -- Stabilize grants, macro/category rules and promotions until commit.
 LOCK TABLE public.product_users,public.product_category_users,public.inventory_item_users,
 public.products,public.product_categories,public.promotions,public.warehouses IN SHARE MODE;
 quote:=private.seller_calculate(v_actor,p_request);
 IF p_expected_quote IS NULL OR p_expected_quote IS DISTINCT FROM quote THEN RAISE EXCEPTION 'Quote changed. Review a new quote before creating the sale.'; END IF;
 currency:=(quote->>'currency')::public.currency_code;
 IF p_payment IS NOT NULL AND p_payment<>'null'::jsonb AND (jsonb_typeof(p_payment) IS DISTINCT FROM 'object' OR EXISTS(
 SELECT 1 FROM jsonb_object_keys(p_payment) k WHERE k NOT IN ('method','received_amount','proof_url')))
 THEN RAISE EXCEPTION 'Invalid payment fields.'; END IF;
 method:=coalesce(lower(btrim(p_payment->>'method')),'dinheiro');
 IF method NOT IN ('dinheiro','pix','transferencia','transferência','cartao','cartão','boleto') THEN RAISE EXCEPTION 'Invalid payment method.'; END IF;
 received:=coalesce((p_payment->>'received_amount')::numeric,0);
 IF received IS NULL OR received<0 OR received<>round(received,2) OR received::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid received amount.'; END IF;
 credited:=CASE WHEN method='pix' THEN round(received/(quote->'exchange'->>'BRL')::numeric,2) ELSE received END;
 IF credited>(quote->>'total')::numeric THEN RAISE EXCEPTION 'Payment exceeds the server total. Pix must be received in BRL.'; END IF;
 IF credited>0 AND method<>'dinheiro' AND (coalesce(p_payment->>'proof_url','') !~ '^https://[^[:space:]]+$'
 OR length(p_payment->>'proof_url')>2000) THEN RAISE EXCEPTION 'A payment proof HTTPS link is required.'; END IF;
 customer:=p_request->'customer'; destination:=p_request->'destination';
 IF jsonb_typeof(customer) IS DISTINCT FROM 'object' OR EXISTS(
 SELECT 1 FROM jsonb_object_keys(customer) k WHERE k NOT IN ('name','phone'))
 OR coalesce(length(btrim(customer->>'name')),0) NOT BETWEEN 1 AND 150
 OR coalesce(length(customer->>'phone'),0)>80 OR coalesce(length(p_request->>'notes'),0)>1000 THEN RAISE EXCEPTION 'Invalid customer.'; END IF;
 SELECT (e->>'product_id')::uuid INTO product_id FROM jsonb_array_elements(quote->'items') e LIMIT 1;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(quote->'items') e WHERE (e->>'product_id')::uuid IS DISTINCT FROM product_id)
 THEN product_id:=NULL; END IF;
 PERFORM set_config('os.order_exchange','',true);
 PERFORM set_config('os.created_payments','',true);
 PERFORM set_config('os.creating_order_id','',true);
 PERFORM set_config('os.payment_received','',true);
 INSERT INTO private.seller_creation_context VALUES(pg_backend_pid(),txid_current(),v_actor,order_id,'create_sale');
 number:=private.seller_legacy_sales_next_number('orders');
 INSERT INTO public.orders(id,number,product_id,seller_id,currency,discount,shipping_cost,total,
 kind,status,stock_state,origin,order_date,workflow_stage,payment_status,amount_paid,amount_receivable,
 warehouse_id,shipping_address,shipping_address_number,shipping_city,shipping_state,shipping_country,delivery_recipient_name,
 whatsapp,delivery,notes,payment_method,root_order_id,exchange_rates_snapshot,exchange_rate_source,exchange_rate_locked_at,
 commission_enabled,commission_total)
 VALUES(order_id,number,product_id,v_actor,currency,0,(quote->>'shipping_cost')::numeric,(quote->>'total')::numeric,
 'venda','faturado','nenhum','seller_portal',current_date,'pedido_feito','a_pagar',0,(quote->>'total')::numeric,
 NULL,destination->>'address',destination->>'number',destination->>'city',destination->>'state',destination->>'country',
 coalesce(nullif(destination->>'recipient_name',''),customer->>'name'),customer->>'phone',
 jsonb_build_object('customer_name',customer->>'name','customer_phone',customer->>'phone','country',destination->>'country'),
 p_request->>'notes',method,order_id,quote->'exchange',
 CASE WHEN quote->'exchange'->>'mode'='manual' THEN 'Cotação manual do pedido' ELSE 'Cotação automática do pedido' END,now(),
 true,(quote->>'commission_total')::numeric);
 FOR line IN SELECT value FROM jsonb_array_elements(quote->'items') LOOP
 INSERT INTO public.order_items(order_id,item_id,description,sku,barcode,unit,quantity,unit_price,discount,total,
 commission_enabled,commission_percent,commission_amount,max_discount_percent)
 VALUES(order_id,(line->>'item_id')::uuid,line->>'description',line->>'sku',line->>'barcode',line->>'unit',
 (line->>'quantity')::numeric,(line->>'unit_price')::numeric,(line->>'discount')::numeric,(line->>'total')::numeric,
 true,(line->>'commission_percent')::numeric,(line->>'commission_amount')::numeric,(line->>'max_discount_percent')::numeric);
 END LOOP;
 PERFORM private.integral_apply_order_compensation(order_id,true);
 -- Canonical reservation + warehouse assignment; no fractional stock formula.
 PERFORM private.seller_legacy_sales_apply_stock(order_id,'reservar',v_actor);
 UPDATE public.orders o SET stock_state='reservado' WHERE o.id=order_id; INSERT INTO private.seller_stock_settlements(order_id) VALUES(order_id);
 PERFORM private.seller_legacy_sales_update_order_logistics(order_id,(p_request->>'warehouse_id')::uuid,
 destination->>'address',destination->>'city',destination->>'state');
 IF credited>0 THEN PERFORM private.seller_submit_receipt(order_id,p_payment); END IF;
 INSERT INTO public.accounts_receivable(description,product_id,order_id,amount,currency,due_date,status)
 VALUES('Saldo do pedido '||number,product_id,order_id,(quote->>'total')::numeric,currency,current_date,'pendente');
 INSERT INTO public.order_audit_log(order_id,root_order_id,revision_no,action,changed_by,note,new_snapshot)
 VALUES(order_id,order_id,1,'status_alterado',v_actor,'Venda criada atomicamente no portal do vendedor.',private.seller_legacy_sales_order_snapshot(order_id));
 INSERT INTO private.seller_sale_requests VALUES(v_actor,p_request_id,fingerprint,order_id);
 DELETE FROM private.seller_creation_context c WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.actor=v_actor;
 RETURN jsonb_build_object('id',order_id,'number',number,'total',quote->'total','currency',currency,'replayed',false);
END $function$
;
CREATE OR REPLACE FUNCTION private.seller_legacy_sales_apply_order_commissions(p_order_id uuid, p_items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  line record;
  enabled boolean;
  percentage numeric;
  amount numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Itens inválidos para cálculo da comissão.';
  END IF;

  FOR line IN
    SELECT oi.id,oi.total,payload.value
    FROM public.order_items oi
    JOIN LATERAL (
      SELECT entry.value
      FROM jsonb_array_elements(p_items) entry(value)
      WHERE nullif(entry.value->>'item_id','')::uuid IS NOT DISTINCT FROM oi.item_id
        AND coalesce(entry.value->>'description','') = coalesce(oi.description,'')
      LIMIT 1
    ) payload ON true
    WHERE oi.order_id=p_order_id
  LOOP
    enabled := coalesce((line.value->>'commission_enabled')::boolean, false);
    percentage := CASE WHEN enabled THEN coalesce((line.value->>'commission_percent')::numeric,0) ELSE 0 END;
    IF percentage < 0 OR percentage > 100 THEN
      RAISE EXCEPTION 'Percentual de comissão inválido.';
    END IF;
    amount := CASE WHEN enabled THEN round(greatest(0,line.total) * percentage / 100,2) ELSE 0 END;
    UPDATE public.order_items
    SET commission_enabled=enabled,commission_percent=percentage,commission_amount=amount,
      max_discount_percent=least(100,greatest(0,coalesce((line.value->>'max_discount_percent')::numeric,0)))
    WHERE id=line.id;
  END LOOP;

  UPDATE public.orders o SET
    commission_enabled = EXISTS (
      SELECT 1 FROM public.order_items oi WHERE oi.order_id=o.id AND oi.commission_enabled
    ),
    commission_total = coalesce((
      SELECT sum(oi.commission_amount) FROM public.order_items oi WHERE oi.order_id=o.id
    ),0)
  WHERE o.id=p_order_id;
 PERFORM private.integral_apply_order_compensation(p_order_id,true);
END $function$
;
CREATE OR REPLACE FUNCTION private.seller_legacy_sales_confirm_order(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE uid uuid:=auth.uid(); o public.orders%ROWTYPE; line record; bal public.warehouse_inventory%ROWTYPE; before_snapshot jsonb;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF o.id IS NULL OR NOT private.seller_legacy_sales_can_manage(uid,o.seller_id) THEN RAISE EXCEPTION 'Sem permissão para confirmar este pedido.'; END IF;
 IF o.deleted_at IS NOT NULL OR o.superseded_at IS NOT NULL OR o.status='cancelado' THEN RAISE EXCEPTION 'Pedido excluído, cancelado ou substituído.'; END IF;
 IF o.kind NOT IN ('venda','pre_pedido') THEN RAISE EXCEPTION 'Documento inválido.'; END IF;
 PERFORM private.integral_apply_order_compensation(o.id);
 before_snapshot:=private.seller_legacy_sales_order_snapshot(o.id);
 IF o.stock_state<>'baixado' THEN
  IF o.stock_state NOT IN ('reservado','nenhum') THEN RAISE EXCEPTION 'Situação de estoque inválida.'; END IF;
  IF o.warehouse_id IS NULL THEN RAISE EXCEPTION 'Selecione o estoque de saída.'; END IF;
  FOR line IN SELECT item_id,sum(quantity) quantity FROM public.order_items WHERE order_id=o.id AND item_id IS NOT NULL GROUP BY item_id ORDER BY item_id LOOP
   SELECT * INTO bal FROM public.warehouse_inventory WHERE warehouse_id=o.warehouse_id AND item_id=line.item_id FOR UPDATE;
   IF NOT FOUND OR (o.stock_state='reservado' AND (bal.reserved<line.quantity OR bal.quantity<line.quantity)) OR (o.stock_state='nenhum' AND bal.quantity-bal.reserved<line.quantity) THEN RAISE EXCEPTION 'Saldo ou reserva insuficiente no estoque selecionado.'; END IF;
  END LOOP;
  PERFORM private.seller_legacy_sales_apply_stock(o.id,CASE WHEN o.stock_state='reservado' THEN 'baixar_reservado' ELSE 'baixar' END,uid);
 END IF;
 UPDATE public.orders SET kind='venda',stock_state='baixado',status=CASE WHEN status='pre_pedido' THEN 'faturado' ELSE status END WHERE id=o.id;
 PERFORM private.seller_legacy_purchase_sync_from_sales_order(o.id);
 IF o.stock_state<>'baixado' OR o.kind<>'venda' THEN
  INSERT INTO public.order_audit_log(order_id,root_order_id,revision_no,action,changed_by,note,previous_snapshot,new_snapshot) VALUES(o.id,coalesce(o.root_order_id,o.id),o.revision_no,'status_alterado',uid,'Pedido confirmado: saída do estoque e percurso da compra; pagamentos preservados.',before_snapshot,private.seller_legacy_sales_order_snapshot(o.id));
 END IF;
 RETURN jsonb_build_object('id',o.id,'number',o.number,'kind','venda','stock_state','baixado');
END $function$
;
CREATE OR REPLACE FUNCTION private.seller_legacy_sales_create_document_v2(p_kind text, p_customer_id uuid, p_product_id uuid, p_currency currency_code, p_discount numeric, p_shipping_cost numeric, p_shipping_percentage numeric, p_notes text, p_payment_method text, p_payment_installments text, p_valid_until date, p_whatsapp text, p_origin text, p_items jsonb, p_payments jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  uid uuid := auth.uid();
  result jsonb;
  new_id uuid;
  payment_row record;
  receipt_tokens jsonb := '[]'::jsonb;
  root_id uuid;
  revision integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;

  PERFORM private.integral_compensation_rules_for_user(uid);
  result := private.seller_legacy_sales_create_document_v2_without_cash_receipt(
    p_kind,p_customer_id,p_product_id,p_currency,p_discount,p_shipping_cost,p_shipping_percentage,p_notes,
    p_payment_method,p_payment_installments,p_valid_until,p_whatsapp,p_origin,p_items,p_payments
  );
  new_id := (result ->> 'id')::uuid;
  PERFORM private.seller_legacy_sales_apply_order_commissions(new_id,p_items);

  IF p_kind = 'venda' THEN
    FOR payment_row IN
      SELECT p.id,p.receipt_token
      FROM public.payments p
      WHERE p.order_id = new_id
        AND p.status = 'pago'
        AND lower(btrim(coalesce(p.method,''))) = 'dinheiro'
        AND NOT EXISTS (
          SELECT 1 FROM public.order_payment_proofs proof WHERE proof.payment_id = p.id
        )
      ORDER BY p.created_at,p.id
    LOOP
      INSERT INTO public.order_payment_proofs(
        order_id,payment_id,proof_type,file_path,file_name,uploaded_by
      ) VALUES (
        new_id,payment_row.id,'recibo_sistema',payment_row.receipt_token::text,
        'Recibo-pedido-' || lpad(coalesce((result ->> 'number')::integer,0)::text,2,'0') || '.pdf',uid
      );
      receipt_tokens := receipt_tokens || jsonb_build_array(payment_row.receipt_token);
    END LOOP;

    UPDATE public.orders
    SET amount_paid = round(total,2),amount_receivable = 0,payment_status = 'pago',
        workflow_stage = 'vendido',status = 'faturado'
    WHERE id = new_id;
    UPDATE public.accounts_receivable
    SET amount = 0,status = 'pago',paid_at = current_date,updated_at = now()
    WHERE order_id = new_id AND status <> 'cancelado';

    SELECT coalesce(root_order_id,id),revision_no INTO root_id,revision
    FROM public.orders WHERE id = new_id;
    INSERT INTO public.order_audit_log(
      order_id,root_order_id,revision_no,action,changed_by,note,new_snapshot
    ) VALUES (
      new_id,root_id,revision,'pagamento_registrado',uid,
      'Venda quitada no caixa: ' || round((result ->> 'total')::numeric,2) || ' ' || p_currency || '.',
      private.seller_legacy_sales_order_snapshot(new_id)
    );
    result := result || jsonb_build_object('receipt_tokens',receipt_tokens,'stage','vendido');
  END IF;

  RETURN result || jsonb_build_object(
    'commission_total',(SELECT commission_total FROM public.orders WHERE id=new_id)
  );
END $function$
;
CREATE OR REPLACE FUNCTION private.seller_legacy_sales_replace_order_version(p_previous_order_id uuid, p_customer_id uuid, p_product_id uuid, p_currency currency_code, p_discount numeric, p_shipping_cost numeric, p_shipping_percentage numeric, p_notes text, p_whatsapp text, p_items jsonb, p_warehouse_id uuid, p_shipping_address text, p_shipping_city text, p_shipping_state text, p_delivery_deadline date, p_carrier text, p_tracking_code text, p_revision_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE result jsonb; old_number integer; temporary_number integer; new_id uuid; context_created boolean:=false; target_seller uuid; lock_user uuid;
BEGIN
 SELECT number,seller_id INTO old_number,target_seller FROM public.orders WHERE id=p_previous_order_id;
 FOR lock_user IN SELECT DISTINCT uid FROM unnest(ARRAY[auth.uid(),target_seller]) uid WHERE uid IS NOT NULL ORDER BY uid LOOP PERFORM private.integral_compensation_rules_for_user(lock_user); END LOOP;
 INSERT INTO private.seller_creation_context(backend_pid,transaction_id,actor,new_order_id,operation)
 VALUES(pg_backend_pid(),txid_current(),auth.uid(),p_previous_order_id,'edit_order') ON CONFLICT DO NOTHING RETURNING true INTO context_created;
 result:=private.seller_legacy_sales_replace_order_version_internal(p_previous_order_id,p_customer_id,p_product_id,p_currency,p_discount,p_shipping_cost,p_shipping_percentage,p_notes,p_whatsapp,p_items,p_warehouse_id,p_shipping_address,p_shipping_city,p_shipping_state,p_delivery_deadline,p_carrier,p_tracking_code,p_revision_note);
 new_id:=(result->>'id')::uuid; temporary_number:=(result->>'number')::integer;
 UPDATE public.orders SET number=old_number WHERE id=new_id;
 UPDATE public.document_counters SET last_number=last_number-1,updated_at=now() WHERE scope='orders' AND last_number=temporary_number AND temporary_number>old_number;
 UPDATE public.order_audit_log SET new_snapshot=private.seller_legacy_sales_order_snapshot(new_id) WHERE order_id=new_id AND action='versao_criada' AND revision_no=(result->>'revision_no')::integer;
 IF coalesce(context_created,false) THEN DELETE FROM private.seller_creation_context WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current() AND actor=auth.uid() AND new_order_id=p_previous_order_id AND operation='edit_order'; END IF;
 RETURN result||jsonb_build_object('number',old_number);
END $function$
;
CREATE OR REPLACE FUNCTION private.seller_legacy_sales_replace_order_version_internal(p_previous_order_id uuid, p_customer_id uuid, p_product_id uuid, p_currency currency_code, p_discount numeric, p_shipping_cost numeric, p_shipping_percentage numeric, p_notes text, p_whatsapp text, p_items jsonb, p_warehouse_id uuid, p_shipping_address text, p_shipping_city text, p_shipping_state text, p_delivery_deadline date, p_carrier text, p_tracking_code text, p_revision_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  uid uuid:=auth.uid();
  old public.orders%rowtype;
  created jsonb;
  new_id uuid;
  root_id uuid;
  old_snapshot jsonb;
  new_snapshot jsonb;
  next_revision integer;
  old_stage text;
  old_kind text;
  paid_ids uuid[];
  paid_total numeric:=0;
  new_total numeric:=0;
  remaining numeric:=0;
  next_stage text;
  pay record;
  new_payment_id uuid;
  payment_remaining numeric:=0;
  payment_copy numeric:=0;
  payment_ratio numeric:=0;
  credit_excess numeric:=0;
begin
  if uid is null then raise exception 'Não autenticado.'; end if;
  if length(btrim(coalesce(p_revision_note,'')))<5 then
    raise exception 'Descreva a alteração realizada (mínimo 5 caracteres).';
  end if;

  select * into old from public.orders where id=p_previous_order_id for update;
  if old.id is null or old.deleted_at is not null or old.superseded_at is not null then
    raise exception 'Pedido não encontrado ou já substituído.';
  end if;
  if old.status='cancelado' or not private.seller_legacy_sales_can_manage(uid,old.seller_id) then
    raise exception 'Sem permissão para editar este pedido.';
  end if;

  old_snapshot:=private.seller_legacy_sales_order_snapshot(old.id);
  root_id:=coalesce(old.root_order_id,old.id);
  next_revision:=coalesce(old.revision_no,1)+1;
  old_stage:=coalesce(old.workflow_stage,'pedido_feito');
  old_kind:=old.kind;

  select coalesce(array_agg(id),'{}'::uuid[]),coalesce(sum(amount),0)
    into paid_ids,paid_total
  from public.payments
  where order_id=old.id and status='pago';

  perform private.seller_legacy_sales_cancel_order(
    old.id,
    'Substituído pela revisão '||next_revision||': '||btrim(p_revision_note)
  );

  created:=private.seller_legacy_sales_create_document_v2(
    'pre_pedido',p_customer_id,p_product_id,p_currency,p_discount,
    p_shipping_cost,p_shipping_percentage,p_notes,null,null,null,p_whatsapp,
    'edicao',p_items,'[]'::jsonb
  );
  new_id:=(created->>'id')::uuid;

  select total into new_total from public.orders where id=new_id;
  new_total:=round(coalesce(new_total,0),2);
  paid_total:=round(coalesce(paid_total,0),2);
  credit_excess:=greatest(0,round(paid_total-new_total,2));
  payment_remaining:=least(paid_total,new_total);

  perform private.seller_legacy_sales_update_order_logistics(
    new_id,p_warehouse_id,p_shipping_address,p_shipping_city,p_shipping_state
  );

  update public.orders
  set seller_id=old.seller_id,
      root_order_id=root_id,
      previous_order_id=old.id,
      revision_no=next_revision,
      delivery_deadline=p_delivery_deadline,
      carrier=nullif(btrim(p_carrier),''),
      tracking_code=nullif(btrim(p_tracking_code),'')
  where id=new_id;

  INSERT INTO private.integral_order_compensation_rules(order_id,seller_id,rules,item_scopes,baseline)
  SELECT new_id,seller_id,rules,item_scopes,baseline FROM private.integral_order_compensation_rules WHERE order_id=old.id ON CONFLICT(order_id) DO NOTHING;
  PERFORM private.integral_apply_order_compensation(new_id,true);

  for pay in
    select * from public.payments where id=any(paid_ids) order by created_at
  loop
    exit when payment_remaining<=0;
    payment_copy:=least(round(pay.amount,2),payment_remaining);
    if payment_copy<=0 then continue; end if;

    payment_ratio:=case when coalesce(pay.amount,0)>0 then payment_copy/pay.amount else 0 end;

    insert into public.payments(
      order_id,amount,currency,method,paid_at,due_date,installment,status,created_at,
      settled_amount_brl,settled_amount_usd,settled_amount_pyg,
      exchange_rates_snapshot,exchange_rate_source,exchange_rate_locked_at
    )
    values(
      new_id,payment_copy,pay.currency,pay.method,pay.paid_at,pay.due_date,pay.installment,'pago',pay.created_at,
      case when pay.settled_amount_brl is null then null else round(pay.settled_amount_brl*payment_ratio,4) end,
      case when pay.settled_amount_usd is null then null else round(pay.settled_amount_usd*payment_ratio,4) end,
      case when pay.settled_amount_pyg is null then null else round(pay.settled_amount_pyg*payment_ratio,4) end,
      pay.exchange_rates_snapshot,pay.exchange_rate_source,pay.exchange_rate_locked_at
    )
    returning id into new_payment_id;

    insert into public.order_payment_proofs(
      order_id,payment_id,proof_type,file_path,external_url,file_name,mime_type,uploaded_by,created_at
    )
    select new_id,new_payment_id,proof_type,file_path,external_url,file_name,mime_type,uploaded_by,created_at
    from public.order_payment_proofs
    where order_id=old.id and payment_id=pay.id;

    payment_remaining:=round(payment_remaining-payment_copy,2);
  end loop;

  insert into public.order_payment_proofs(
    order_id,payment_id,proof_type,file_path,external_url,file_name,mime_type,uploaded_by,created_at
  )
  select new_id,null,proof_type,file_path,external_url,file_name,mime_type,uploaded_by,created_at
  from public.order_payment_proofs
  where order_id=old.id and payment_id is null;

  if credit_excess>0 then
    if p_customer_id is null then
      raise exception 'O pedido possui valor pago excedente, mas não tem cliente para receber o crédito.';
    end if;
    perform public.customer_credit_post(
      p_customer_id,
      p_currency,
      credit_excess,
      'overpayment',
      'Crédito automático pela redução do pedido '||
        coalesce(old.number::text,old.id::text)||
        ' na revisão '||next_revision||
        '. Total anterior pago: '||paid_total||
        '; novo total: '||new_total||
        '; crédito: '||credit_excess||'.',
      new_id,
      null
    );
  end if;

  remaining:=greatest(0,round(new_total-least(paid_total,new_total),2));
  next_stage:=case
    when remaining=0 and least(paid_total,new_total)>0 then 'vendido'
    when least(paid_total,new_total)>0 then 'pagamento_parcial'
    else old_stage
  end;

  if next_stage in ('esperando_pagamento','em_caminho','vendido','pagamento_parcial') then
    perform private.seller_legacy_sales_apply_stock(new_id,'baixar_reservado',uid);
    update public.orders
    set kind='venda',
        stock_state='baixado',
        workflow_stage=next_stage,
        status=case when next_stage='vendido' then 'entregue' else 'faturado' end,
        payment_status=case
          when next_stage='vendido' then 'pago'
          when next_stage='pagamento_parcial' then 'parcial'
          when next_stage='esperando_pagamento' then 'a_pagar'
          else old.payment_status
        end,
        amount_paid=least(paid_total,new_total),
        amount_receivable=remaining,
        fulfillment_status=case
          when next_stage='em_caminho' then 'a_caminho'
          when next_stage='vendido' then 'entregue'
          else old.fulfillment_status
        end,
        delivered_at=case
          when next_stage='vendido' then coalesce(old.delivered_at,current_date)
          else old.delivered_at
        end,
        tracking_status=case
          when next_stage='em_caminho' then 'Em caminho'
          when next_stage='vendido' then 'Entregue'
          else old.tracking_status
        end
    where id=new_id;
  else
    update public.orders
    set kind=old_kind,
        workflow_stage='pedido_feito',
        amount_paid=least(paid_total,new_total),
        amount_receivable=remaining
    where id=new_id;
  end if;

  if remaining>0 and next_stage in ('esperando_pagamento','pagamento_parcial') then
    insert into public.accounts_receivable(
      description,customer_id,product_id,order_id,amount,currency,due_date,status
    )
    select 'Saldo do pedido '||number,customer_id,product_id,id,remaining,currency,current_date,'pendente'
    from public.orders
    where id=new_id;
  end if;

  update public.orders
  set superseded_at=now(),
      superseded_by=uid,
      superseded_by_order_id=new_id
  where id=old.id;

  new_snapshot:=private.seller_legacy_sales_order_snapshot(new_id);
  insert into public.order_audit_log(
    order_id,root_order_id,revision_no,action,changed_by,note,previous_snapshot,new_snapshot
  )
  values(
    new_id,root_id,next_revision,'versao_criada',uid,
    btrim(p_revision_note) ||
      case when credit_excess>0 then
        ' | Crédito automático ao cliente: '||credit_excess||' '||p_currency::text
      else '' end,
    old_snapshot,new_snapshot
  );

  return jsonb_build_object(
    'id',new_id,
    'number',created->'number',
    'revision_no',next_revision,
    'root_order_id',root_id,
    'credit_created',credit_excess
  );
end
$function$
;
CREATE OR REPLACE FUNCTION private.seller_legacy_sales_save_order_edit(p_args jsonb, p_followup jsonb, p_exchange jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE result jsonb; v_order_id uuid; commission_only boolean; persisted public.orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.orders WHERE id=(p_args->>'p_previous_order_id')::uuid
    AND deleted_at IS NULL AND superseded_at IS NULL AND status<>'cancelado'
    AND private.seller_legacy_sales_can_manage(auth.uid(),seller_id)) THEN
    RAISE EXCEPTION 'Sem permissão para editar este pedido.' USING ERRCODE='42501';
  END IF;
  IF p_followup IS NULL OR jsonb_typeof(p_followup)<>'object' THEN RAISE EXCEPTION 'Complementos do pedido inválidos.'; END IF;
  IF NOT p_followup ?& ARRAY['delivery_recipient_name','delivery_recipient_document','shipping_cep','variable_cost',
    'seller_id','order_date','delivery_deadline','delivered_at','shipping_country','shipping_address_number'] THEN
    RAISE EXCEPTION 'Complementos do pedido incompletos.';
  END IF;
  IF p_exchange IS NOT NULL THEN
    result:=private.seller_legacy_sales_with_order_exchange('sales_replace_order_version',p_args,p_exchange);
  ELSE
    result:=private.seller_legacy_sales_replace_order_version(
      (p_args->>'p_previous_order_id')::uuid,(p_args->>'p_customer_id')::uuid,(p_args->>'p_product_id')::uuid,
      (p_args->>'p_currency')::public.currency_code,(p_args->>'p_discount')::numeric,
      (p_args->>'p_shipping_cost')::numeric,(p_args->>'p_shipping_percentage')::numeric,
      p_args->>'p_notes',p_args->>'p_whatsapp',p_args->'p_items',(p_args->>'p_warehouse_id')::uuid,
      p_args->>'p_shipping_address',p_args->>'p_shipping_city',p_args->>'p_shipping_state',
      (p_args->>'p_delivery_deadline')::date,p_args->>'p_carrier',p_args->>'p_tracking_code',p_args->>'p_revision_note');
  END IF;
  v_order_id:=(result->>'id')::uuid; commission_only:=coalesce((result->>'commission_only')::boolean,false);
  SELECT * INTO persisted FROM public.orders WHERE id=v_order_id;
  IF commission_only AND
    ROW(persisted.delivery_recipient_name,persisted.delivery_recipient_document,persisted.shipping_cep,
      persisted.variable_cost,persisted.seller_id,persisted.order_date,persisted.delivery_deadline,
      persisted.delivered_at,persisted.shipping_country,persisted.shipping_address_number)
    IS NOT DISTINCT FROM ROW(p_followup->>'delivery_recipient_name',nullif(p_followup->>'delivery_recipient_document',''),
      nullif(p_followup->>'shipping_cep',''),(p_followup->>'variable_cost')::numeric,(p_followup->>'seller_id')::uuid,
      coalesce((p_followup->>'order_date')::date,persisted.order_date),(p_followup->>'delivery_deadline')::date,
      (p_followup->>'delivered_at')::date,nullif(btrim(p_followup->>'shipping_country'),''),
      nullif(btrim(p_followup->>'shipping_address_number'),'')) THEN RETURN result; END IF;
  UPDATE public.orders SET delivery_recipient_name=p_followup->>'delivery_recipient_name',
    delivery_recipient_document=nullif(p_followup->>'delivery_recipient_document',''),
    shipping_cep=nullif(p_followup->>'shipping_cep','')
  WHERE id=v_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Não foi possível atualizar os complementos do pedido.'; END IF;
  IF persisted.variable_cost IS DISTINCT FROM (p_followup->>'variable_cost')::numeric THEN
    UPDATE public.orders SET variable_cost=(p_followup->>'variable_cost')::numeric WHERE id=v_order_id;
  END IF;
  IF persisted.seller_id IS DISTINCT FROM (p_followup->>'seller_id')::uuid THEN
    PERFORM private.seller_legacy_sales_assign_order_seller(v_order_id,(p_followup->>'seller_id')::uuid);
  END IF;
  IF ROW(persisted.order_date,persisted.delivery_deadline,persisted.delivered_at,persisted.shipping_country)
    IS DISTINCT FROM ROW(coalesce((p_followup->>'order_date')::date,persisted.order_date),
      (p_followup->>'delivery_deadline')::date,(p_followup->>'delivered_at')::date,nullif(btrim(p_followup->>'shipping_country'),'')) THEN
    PERFORM private.seller_legacy_sales_update_order_dates(v_order_id,(p_followup->>'order_date')::date,
      (p_followup->>'delivery_deadline')::date,(p_followup->>'delivered_at')::date,p_followup->>'shipping_country');
  END IF;
  IF persisted.shipping_address_number IS DISTINCT FROM nullif(btrim(p_followup->>'shipping_address_number'),'') THEN
    PERFORM private.seller_legacy_sales_update_order_address_number(v_order_id,p_followup->>'shipping_address_number');
  END IF;
  IF NOT commission_only THEN
    PERFORM private.seller_legacy_sales_preserve_revision_number(v_order_id);
    PERFORM private.seller_legacy_sales_confirm_order(v_order_id);
  END IF;
  PERFORM private.integral_apply_order_compensation(v_order_id);
  PERFORM private.seller_legacy_sales_finalize_order_edit_audit(v_order_id,
    coalesce((result->>'audit_id')::uuid,(SELECT id FROM public.order_audit_log
      WHERE order_id=v_order_id AND action='versao_criada' AND changed_by=auth.uid() ORDER BY created_at DESC,id DESC LIMIT 1)));
  RETURN result;
END $function$
;
CREATE OR REPLACE FUNCTION private.seller_legacy_sales_assign_order_seller(p_order_id uuid, p_seller_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
uid uuid := auth.uid();
current_order public.orders%ROWTYPE;
before_snapshot jsonb;
BEGIN
IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
SELECT * INTO current_order
FROM public.orders
WHERE id = p_order_id AND deleted_at IS NULL AND superseded_at IS NULL
FOR UPDATE;
IF current_order.id IS NULL OR NOT private.seller_legacy_sales_can_manage(uid, current_order.seller_id) THEN
RAISE EXCEPTION 'Pedido não encontrado ou sem permissão para atribuir vendedor.';
END IF;
IF NOT private.seller_legacy_sales_can_assign_seller(uid, p_seller_id) THEN
RAISE EXCEPTION 'Escolha um vendedor da sua equipe.';
END IF;
IF current_order.seller_id = p_seller_id THEN RETURN; END IF;

before_snapshot := private.seller_legacy_sales_order_snapshot(current_order.id);
UPDATE public.orders SET seller_id = p_seller_id, updated_at = now() WHERE id = current_order.id;
PERFORM private.integral_apply_order_compensation(current_order.id);
INSERT INTO public.order_audit_log(
order_id,root_order_id,revision_no,action,changed_by,note,previous_snapshot,new_snapshot
) VALUES (
current_order.id,coalesce(current_order.root_order_id,current_order.id),current_order.revision_no,
'vendedor_atribuido',uid,'Vendedor responsável alterado.',before_snapshot,
private.seller_legacy_sales_order_snapshot(current_order.id)
);
END $function$
;
CREATE OR REPLACE FUNCTION public.integral_preview_order_commission(p_seller_id uuid,p_exchange jsonb,p_items jsonb,p_order_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); rules jsonb; owner uuid; scopes jsonb; code text; r numeric;
BEGIN
 IF actor IS NULL OR private.seller_is_restricted(actor) OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND is_active)
 OR NOT private.seller_legacy_sales_can_manage(actor,p_seller_id)
 THEN RAISE EXCEPTION 'Prévia de comissão não autorizada.' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_seller_id AND is_active) THEN RAISE EXCEPTION 'Vendedor inválido.'; END IF;
 IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items)>100 OR p_exchange->>'base' IS NULL OR p_exchange->>'base' NOT IN ('BRL','USD','PYG') THEN RAISE EXCEPTION 'Itens ou moeda inválidos.'; END IF;
 FOREACH code IN ARRAY ARRAY['BRL','USD','PYG'] LOOP
 r:=(p_exchange->>code)::numeric;
 IF r IS NULL OR r<=0 OR r>1000000000 OR r::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Cotação inválida.'; END IF;
 END LOOP;
 IF (p_exchange->>(p_exchange->>'base'))::numeric<>1 THEN RAISE EXCEPTION 'Cotação da moeda base inválida.'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_items) l WHERE (l->>'total') IS NULL OR (l->>'total')::numeric<0 OR (l->>'total')::numeric::text IN ('NaN','Infinity','-Infinity') OR coalesce((l->>'commission_percent')::numeric,0) NOT BETWEEN 0 AND 100) THEN RAISE EXCEPTION 'Valor ou percentual inválido.'; END IF;
 IF p_order_id IS NOT NULL THEN
 SELECT seller_id INTO owner FROM public.orders WHERE id=p_order_id AND deleted_at IS NULL AND superseded_at IS NULL;
 IF NOT FOUND OR NOT private.seller_legacy_sales_can_manage(actor,owner) THEN RAISE EXCEPTION 'Pedido não autorizado.' USING ERRCODE='42501'; END IF;
 SELECT s.rules,s.item_scopes INTO rules,scopes FROM private.integral_order_compensation_rules s WHERE s.order_id=p_order_id;
 IF rules IS NULL THEN rules:='[]'; ELSIF owner IS DISTINCT FROM p_seller_id THEN rules:=private.integral_compensation_rules_for_user(p_seller_id); END IF;
 ELSE rules:=private.integral_compensation_rules_for_user(p_seller_id);
 END IF;
 IF p_order_id IS NOT NULL AND scopes IS NOT NULL THEN
 SELECT coalesce(jsonb_agg(l.value || coalesce(scopes->(coalesce(l.value->>'item_id','manual')||':'||coalesce(l.value->>'description','')),'{}'::jsonb) ORDER BY l.ordinality),'[]'::jsonb) INTO p_items FROM jsonb_array_elements(p_items) WITH ORDINALITY l(value,ordinality);
 END IF;
 RETURN private.integral_calculate_commission_rules(p_items,p_exchange,rules);
END $$;
REVOKE ALL ON FUNCTION public.integral_preview_order_commission(uuid,jsonb,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.integral_preview_order_commission(uuid,jsonb,jsonb,uuid) TO authenticated;