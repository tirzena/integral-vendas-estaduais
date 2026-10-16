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
 promo record; destination jsonb; shipping_base numeric:=0; rules jsonb; compensation jsonb; shipping jsonb; shipping_mode text; shipping_amount numeric; shipping_percent numeric;
BEGIN
 rules:=private.integral_compensation_rules_for_user(p_actor);
 IF jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR EXISTS(
 SELECT 1 FROM jsonb_object_keys(p_request) k WHERE k NOT IN ('currency','exchange','warehouse_id','destination','items','customer','notes','order_date','delivery_deadline','carrier','tracking_code','shipping'))
 THEN RAISE EXCEPTION 'Invalid sale request fields.'; END IF;
 shipping:=coalesce(p_request->'shipping','{"mode":"included"}'::jsonb);
 IF jsonb_typeof(shipping) IS DISTINCT FROM 'object' OR EXISTS(
 SELECT 1 FROM jsonb_object_keys(shipping) k WHERE k NOT IN('mode','amount','percentage'))
 THEN RAISE EXCEPTION 'Frete manual inválido.'; END IF;
 shipping_mode:=coalesce(shipping->>'mode','included');
 shipping_amount:=coalesce((shipping->>'amount')::numeric,0);
 shipping_percent:=coalesce((shipping->>'percentage')::numeric,0);
 IF shipping_mode NOT IN('included','value','percent')
 OR shipping_amount<0 OR shipping_amount>1000000000 OR shipping_amount<>round(shipping_amount,2)
 OR shipping_amount::text IN('NaN','Infinity','-Infinity')
 OR shipping_percent<0 OR shipping_percent>100 OR shipping_percent::text IN('NaN','Infinity','-Infinity')
 OR (shipping_mode='included' AND (shipping_amount<>0 OR shipping_percent<>0))
 OR (shipping_mode='value' AND shipping_percent<>0)
 OR (shipping_mode='percent' AND shipping_amount<>0)
 THEN RAISE EXCEPTION 'Frete manual inválido: confira valor e percentual.'; END IF;
 currency:=(p_request->>'currency')::public.currency_code;
 IF currency IS NULL THEN RAISE EXCEPTION 'Choose a currency.'; END IF;
 destination:=p_request->'destination';
 IF jsonb_typeof(destination) IS DISTINCT FROM 'object' OR EXISTS(
 SELECT 1 FROM jsonb_object_keys(destination) k WHERE k NOT IN ('country','state','city','address','number','recipient_name','recipient_document','cep','phone'))
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
  SELECT 1 FROM jsonb_object_keys(line) k WHERE k NOT IN ('item_id','quantity','discount_percent','unit_price'))
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
  IF line ? 'unit_price' THEN
   rate:=(line->>'unit_price')::numeric;
   IF rate IS NULL OR rate<=0 OR rate::text IN ('NaN','Infinity','-Infinity')
    OR rate<>round(rate,2) OR rate<round(unit_price*(1-coalesce(item.max_discount_percent,0)/100),2)
    OR rate>unit_price THEN RAISE EXCEPTION 'Preço fora do limite autorizado para %.',item.name; END IF;
   IF round(rate*(1-discount_percent/100),2)<round(unit_price*(1-coalesce(item.max_discount_percent,0)/100),2) THEN RAISE EXCEPTION 'Desconto fora do limite autorizado para %.',item.name; END IF;
   unit_price:=rate;
  END IF;
  IF unit_price<=0 THEN RAISE EXCEPTION 'Produto sem preço de venda definido: %.',item.name; END IF;
  discount:=round(quantity*unit_price*discount_percent/100,2);
  line_total:=round(quantity*unit_price-discount,2);
  -- Extra freight is added once, after the product subtotal; no automatic cost-based freight.
  freight:=0;
  gross:=gross+line_total; commission:=commission+round(line_total*coalesce(item.commission_percent,5)/100,2);
  lines:=lines||jsonb_build_array(jsonb_build_object('item_id',item.id,'product_id',item.product_id,
  'description',item.name,'sku',item.sku,'barcode',item.barcode,'unit',item.unit,'quantity',quantity,
  'unit_price',unit_price,'discount',discount,'total',line_total,
  'commission_percent',coalesce(item.commission_percent,5),'commission_amount',round(line_total*coalesce(item.commission_percent,5)/100,2),
  'max_discount_percent',coalesce(item.max_discount_percent,0)));
 END LOOP;
 freight:=CASE shipping_mode WHEN 'value' THEN shipping_amount WHEN 'percent' THEN round(gross*shipping_percent/100,2) ELSE 0 END;
 compensation:=private.integral_calculate_commission_rules(lines,exchange,rules);
 lines:=compensation->'items'; commission:=(compensation->>'commission_total')::numeric;
 -- Percentage is NEVER returned: cost could be inferred from freight / percentage.
 RETURN jsonb_build_object('currency',currency,'exchange',exchange,'items',lines,'subtotal',gross,
 'shipping_mode',shipping_mode,'shipping_percentage',CASE WHEN shipping_mode='percent' THEN shipping_percent ELSE NULL END,'shipping_cost',round(freight,2),'total',round(gross+freight,2),'commission_total',commission);
END $function$;

CREATE OR REPLACE FUNCTION public.integral_seller_create_pdv_order(p_args jsonb, p_followup jsonb, p_exchange jsonb, p_request_id uuid, p_estadual boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_variable
DECLARE actor uuid:=private.seller_require_actor(); fingerprint jsonb; previous private.remuneration_creation_requests; cust public.customers; payload jsonb; result jsonb; quote jsonb; li jsonb; items jsonb:='[]'; qty numeric; price numeric; discount numeric; exchange jsonb; cid uuid; ship_mode text;
BEGIN
 IF NOT private.integral_operation_allowed(actor,'orders.create') THEN RAISE EXCEPTION 'Criação de pedidos não concedida.' USING ERRCODE='42501'; END IF;
 IF p_estadual AND NOT EXISTS(SELECT 1 FROM public.integral_division_access WHERE user_id=actor AND system_code='vendas_estaduais' AND can_write) THEN RAISE EXCEPTION 'Acesso estadual de escrita não concedido.' USING ERRCODE='42501'; END IF;
 IF NOT coalesce((SELECT workflow_enabled FROM private.remuneration_settings),false) THEN RAISE EXCEPTION 'O fluxo de aprovação deve estar ativo.'; END IF;
 IF p_request_id IS NULL OR jsonb_typeof(p_args) IS DISTINCT FROM 'object' OR jsonb_typeof(p_followup) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Informe os dados completos do pedido.'; END IF;
 IF p_followup->>'seller_id' IS DISTINCT FROM actor::text THEN RAISE EXCEPTION 'O vendedor só pode criar pedidos em seu próprio nome.' USING ERRCODE='42501'; END IF;
 IF jsonb_array_length(coalesce(p_args->'p_payments','[]'))<>0 OR coalesce((p_args->>'p_discount')::numeric,0)<>0 OR coalesce((p_followup->>'variable_cost')::numeric,0)<>0 OR jsonb_array_length(coalesce(p_followup->'item_costs','[]'))<>0 THEN RAISE EXCEPTION 'Custos internos e pagamentos não podem ser acrescentados pelo vendedor neste cadastro.'; END IF;
 fingerprint:=jsonb_build_object('args',p_args,'followup',p_followup,'exchange',p_exchange,'estadual',p_estadual);
 PERFORM pg_advisory_xact_lock(hashtextextended('seller-sale:'||actor::text,0));
 SELECT * INTO previous FROM private.remuneration_creation_requests r WHERE r.actor=actor AND r.request_id=p_request_id;
 IF FOUND THEN
  IF previous.payload IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'Identificador já utilizado em outro conteúdo.'; END IF;
  RETURN previous.result||jsonb_build_object('replayed',true);
 END IF;
 cid:=nullif(p_args->>'p_customer_id','')::uuid;
 IF cid IS NOT NULL THEN
  SELECT * INTO cust FROM public.customers c WHERE c.id=cid AND c.deleted_at IS NULL AND (c.created_by=actor OR EXISTS(SELECT 1 FROM public.customer_products cp WHERE cp.customer_id=c.id AND cp.owner_id=actor) OR EXISTS(SELECT 1 FROM public.orders o WHERE o.customer_id=c.id AND o.seller_id=actor AND o.deleted_at IS NULL AND o.superseded_at IS NULL));
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente não atribuído ao vendedor.' USING ERRCODE='42501'; END IF;
 ELSE
  cust.name:=coalesce(nullif(btrim(p_followup->>'delivery_recipient_name'),''),'Venda balcão');
  cust.phone:=nullif(p_args->>'p_whatsapp','');
 END IF;
 IF jsonb_typeof(p_args->'p_items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_args->'p_items') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Adicione os produtos do pedido.'; END IF;
 FOR li IN SELECT value FROM jsonb_array_elements(p_args->'p_items') LOOP
  qty:=(li->>'quantity')::numeric;price:=(li->>'unit_price')::numeric;discount:=coalesce((li->>'discount')::numeric,0);
  IF qty IS NULL OR qty<=0 OR qty::text IN ('NaN','Infinity','-Infinity') OR price IS NULL OR price<=0 OR price::text IN ('NaN','Infinity','-Infinity') OR discount<0 OR discount>qty*price OR discount::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Confira preço, quantidade e desconto de cada produto.'; END IF;
  items:=items||jsonb_build_array(jsonb_build_object('item_id',li->>'item_id','quantity',qty,'unit_price',price,'discount_percent',discount*100/(qty*price)));
 END LOOP;
 exchange:=CASE WHEN p_exchange->>'mode'='manual' THEN jsonb_build_object('mode','manual','base',p_args->>'p_currency','USD',p_exchange->'USD','BRL',p_exchange->'BRL','PYG',p_exchange->'PYG') ELSE '{"mode":"automatic"}'::jsonb END;
 payload:=jsonb_build_object(
 'currency',p_args->>'p_currency','exchange',exchange,'warehouse_id',p_followup->>'warehouse_id',
 'customer',jsonb_build_object('name',cust.name,'phone',cust.phone,'document',cust.document,'email',cust.email,'whatsapp',coalesce(p_args->>'p_whatsapp',cust.whatsapp,cust.phone)),
 'destination',jsonb_build_object('country',coalesce(nullif(p_followup->>'shipping_country',''),'Brasil'),'state',p_followup->>'shipping_state','city',p_followup->>'shipping_city',
 'address',p_followup->>'shipping_address','number',p_followup->>'shipping_address_number','cep',p_followup->>'shipping_cep',
 'recipient_name',coalesce(nullif(p_followup->>'delivery_recipient_name',''),cust.name),'recipient_document',p_followup->>'delivery_recipient_document','phone',coalesce(p_args->>'p_whatsapp',cust.phone)),
 'order_date',p_followup->>'order_date','delivery_deadline',p_followup->>'delivery_deadline','carrier',p_followup->>'carrier','tracking_code',p_followup->>'tracking_code','notes',p_args->>'p_notes','items',items);
 ship_mode:=coalesce(nullif(p_followup->>'shipping_mode',''),CASE WHEN coalesce((p_args->>'p_shipping_cost')::numeric,0)>0 THEN 'value' ELSE 'included' END);
 IF coalesce((p_args->>'p_shipping_cost')::numeric,0)<0
 OR coalesce((p_args->>'p_shipping_cost')::numeric,0)::text IN('NaN','Infinity','-Infinity')
 OR (ship_mode='included' AND coalesce((p_args->>'p_shipping_cost')::numeric,0)<>0)
 THEN RAISE EXCEPTION 'Frete manual inválido.'; END IF;
 payload:=payload||jsonb_build_object('shipping',jsonb_build_object('mode',ship_mode,
 'amount',CASE WHEN ship_mode='value' THEN coalesce((p_args->>'p_shipping_cost')::numeric,0) ELSE 0 END,
 'percentage',CASE WHEN ship_mode='percent' THEN (p_args->>'p_shipping_percentage')::numeric ELSE NULL END));
 IF ship_mode='percent' AND nullif(p_args->>'p_shipping_percentage','') IS NULL THEN RAISE EXCEPTION 'Informe o percentual do frete.'; END IF;
 -- Requote with server-owned rates before enforcing submitted unit prices.
 -- A changed conversion returns a reviewable quote, without creating any order.
 quote:=private.seller_calculate(actor,jsonb_set(payload,'{items}',
  (SELECT jsonb_agg(value-'unit_price') FROM jsonb_array_elements(items))));
 IF EXISTS(
  SELECT 1 FROM jsonb_array_elements(items) submitted
  JOIN jsonb_array_elements(quote->'items') authorized
   ON submitted->>'item_id'=authorized->>'item_id'
  WHERE (submitted->>'unit_price')::numeric<>round((submitted->>'unit_price')::numeric,2)
   OR (submitted->>'unit_price')::numeric>(authorized->>'unit_price')::numeric
   OR round((submitted->>'unit_price')::numeric*(1-(submitted->>'discount_percent')::numeric/100),2)
    <round((authorized->>'unit_price')::numeric*(1-(authorized->>'max_discount_percent')::numeric/100),2)
 ) THEN
  IF NOT coalesce((p_args->>'p_price_confirmation_supported')::boolean,false) THEN
   RAISE EXCEPTION 'A cotação do pedido foi atualizada. Salve o rascunho e atualize a página para conferir os preços antes de enviar.';
  END IF;
  RETURN jsonb_build_object('requires_price_confirmation',true,'quote',quote);
 END IF;
 quote:=private.seller_calculate(actor,payload);
 IF coalesce((p_args->>'p_shipping_cost')::numeric,0) IS DISTINCT FROM (quote->>'shipping_cost')::numeric
 THEN RAISE EXCEPTION 'Valor do frete não corresponde ao percentual informado. Confira o resumo.'; END IF;
 result:=CASE WHEN p_estadual THEN public.estadual_seller_create_order(payload,p_request_id,quote,cid) ELSE public.integral_seller_create_order(payload,p_request_id,quote,cid) END;
 INSERT INTO private.remuneration_creation_requests(actor,request_id,payload,result) VALUES(actor,p_request_id,fingerprint,result);
 RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION public.seller_portal_create_sale(p_request jsonb, p_request_id uuid, p_payment jsonb, p_expected_quote jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_actor uuid:=private.seller_require_actor(); quote jsonb; existing record; order_id uuid:=gen_random_uuid();
 number integer; line jsonb; currency public.currency_code; method text; received numeric; credited numeric;
 payment_id uuid; proof_id uuid; payment_result jsonb; customer jsonb; destination jsonb; fingerprint jsonb; product_id uuid; context_order uuid; awaiting_review boolean;
BEGIN
 IF NOT private.integral_operation_allowed(auth.uid(),'orders.create') THEN RAISE EXCEPTION 'Operação não concedida: orders.create' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL THEN RAISE EXCEPTION 'Request ID is required.'; END IF;
 awaiting_review:=coalesce((SELECT workflow_enabled FROM private.remuneration_settings),false);
 IF awaiting_review AND p_payment IS NOT NULL AND p_payment<>'null'::jsonb THEN RAISE EXCEPTION 'Registre o pagamento após a aprovação do pedido.'; END IF;
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
 SELECT 1 FROM jsonb_object_keys(customer) k WHERE k NOT IN ('name','phone','whatsapp','document','email'))
 OR coalesce(length(btrim(customer->>'name')),0) NOT BETWEEN 1 AND 150
 OR coalesce(length(customer->>'whatsapp'),0)>80 OR coalesce(length(customer->>'phone'),0)>80 OR coalesce(length(customer->>'document'),0)>40 OR coalesce(length(customer->>'email'),0)>254 OR coalesce(length(p_request->>'notes'),0)>1000 THEN RAISE EXCEPTION 'Invalid customer.'; END IF;
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
 coalesce(nullif(destination->>'recipient_name',''),customer->>'name'),coalesce(nullif(destination->>'phone',''),customer->>'phone'),
 jsonb_build_object('customer_name',customer->>'name','customer_phone',customer->>'phone','country',destination->>'country','shipping_mode',quote->>'shipping_mode'),
 p_request->>'notes',CASE WHEN awaiting_review THEN NULL ELSE method END,order_id,quote->'exchange',
 CASE WHEN quote->'exchange'->>'mode'='manual' THEN 'Cotação manual do pedido' ELSE 'Cotação automática do pedido' END,now(),
 true,(quote->>'commission_total')::numeric);
 IF awaiting_review THEN
  UPDATE public.orders SET kind='pre_pedido',status='pre_pedido' WHERE id=order_id;
 END IF;
 UPDATE public.orders SET
  warehouse_id=(p_request->>'warehouse_id')::uuid,
  shipping_percentage=(quote->>'shipping_percentage')::numeric,
  delivery_recipient_document=nullif(destination->>'recipient_document',''),
  shipping_cep=nullif(regexp_replace(destination->>'cep','[^0-9]','','g'),''),
  order_date=coalesce(nullif(p_request->>'order_date','')::date,current_date),
  delivery_deadline=nullif(p_request->>'delivery_deadline','')::date,
  carrier=nullif(p_request->>'carrier',''),tracking_code=nullif(p_request->>'tracking_code',''),tracking_enabled=false
 WHERE id=order_id;
 IF nullif(destination->>'cep','') IS NOT NULL AND upper(btrim(destination->>'country')) IN ('BRASIL','BR','BRAZIL')
 AND length(regexp_replace(destination->>'cep','[^0-9]','','g'))<>8 THEN RAISE EXCEPTION 'Informe um CEP com 8 dígitos.'; END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(quote->'items') LOOP
 INSERT INTO public.order_items(order_id,item_id,description,sku,barcode,unit,quantity,unit_price,discount,total,
 commission_enabled,commission_percent,commission_amount,max_discount_percent)
 VALUES(order_id,(line->>'item_id')::uuid,line->>'description',line->>'sku',line->>'barcode',line->>'unit',
 (line->>'quantity')::numeric,(line->>'unit_price')::numeric,(line->>'discount')::numeric,(line->>'total')::numeric,
 true,(line->>'commission_percent')::numeric,(line->>'commission_amount')::numeric,(line->>'max_discount_percent')::numeric);
 END LOOP;
 PERFORM private.integral_apply_order_compensation(order_id,true);
 -- Pending orders keep the selected warehouse but do not reserve stock or create supplier orders.
 IF NOT awaiting_review THEN
 -- Canonical reservation + warehouse assignment; no fractional stock formula.
 PERFORM private.seller_legacy_sales_apply_stock(order_id,'reservar',v_actor);
 UPDATE public.orders o SET stock_state='reservado' WHERE o.id=order_id; INSERT INTO private.seller_stock_settlements(order_id) VALUES(order_id);
 PERFORM private.seller_legacy_sales_update_order_logistics(order_id,(p_request->>'warehouse_id')::uuid,
 destination->>'address',destination->>'city',destination->>'state');
 IF credited>0 THEN PERFORM private.seller_submit_receipt(order_id,p_payment); END IF;
 INSERT INTO public.accounts_receivable(description,product_id,order_id,amount,currency,due_date,status)
 VALUES('Saldo do pedido '||number,product_id,order_id,(quote->>'total')::numeric,currency,current_date,'pendente');

 END IF;
 INSERT INTO public.order_audit_log(order_id,root_order_id,revision_no,action,changed_by,note,new_snapshot)
 VALUES(order_id,order_id,1,'status_alterado',v_actor,CASE WHEN awaiting_review THEN 'Pedido completo enviado para aprovação pelo vendedor.' ELSE 'Venda criada atomicamente no portal do vendedor.' END,private.seller_legacy_sales_order_snapshot(order_id));
 IF awaiting_review THEN
  PERFORM private.remuneration_notify(order_id,'Pedido aguardando aprovação','Pedido #'||number||': confira os dados, produtos e comissão.','order_awaiting_approval');
 END IF;
 INSERT INTO private.seller_sale_requests VALUES(v_actor,p_request_id,fingerprint,order_id);
 DELETE FROM private.seller_creation_context c WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.actor=v_actor;
 RETURN jsonb_build_object('id',order_id,'number',number,'total',quote->'total','currency',currency,'replayed',false,'approval_status',CASE WHEN awaiting_review THEN 'pending' ELSE NULL END);
END $function$;

CREATE OR REPLACE FUNCTION private.remuneration_complete_order_fields(p_order uuid, f jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE o public.orders;cost numeric:=coalesce((f->>'variable_cost')::numeric,0);
BEGIN
 IF NOT private.integral_operation_allowed(auth.uid(),'orders.create') OR private.seller_is_restricted(auth.uid()) THEN RAISE EXCEPTION 'Use o cadastro de pedidos autorizado para seu perfil.' USING ERRCODE='42501'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=p_order FOR UPDATE;
 IF NOT FOUND OR o.approval_status IS DISTINCT FROM 'pending' OR NOT private.seller_legacy_sales_can_manage(auth.uid(),o.seller_id) THEN RAISE EXCEPTION 'Pedido indisponível para completar o cadastro.'; END IF;
 IF cost<0 OR cost::text IN ('NaN','Infinity','-Infinity') OR (cost<>0 AND NOT private.remuneration_can_review(auth.uid())) THEN RAISE EXCEPTION 'Custo variável não autorizado.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=(f->>'seller_id')::uuid AND is_active) OR NOT EXISTS(SELECT 1 FROM public.warehouses WHERE id=(f->>'warehouse_id')::uuid AND is_active) THEN RAISE EXCEPTION 'Selecione um vendedor ativo e o estoque de origem.'; END IF;
 PERFORM private.seller_legacy_sales_update_order_logistics(o.id,(f->>'warehouse_id')::uuid,f->>'shipping_address',f->>'shipping_city',f->>'shipping_state');
 UPDATE public.orders SET delivery_recipient_name=f->>'delivery_recipient_name',delivery_recipient_document=nullif(f->>'delivery_recipient_document',''),shipping_cep=nullif(f->>'shipping_cep',''),variable_cost=cost,delivery_deadline=(f->>'delivery_deadline')::date,carrier=nullif(f->>'carrier',''),tracking_code=nullif(f->>'tracking_code',''),tracking_enabled=false WHERE id=o.id;
 PERFORM private.seller_legacy_sales_assign_order_seller(o.id,(f->>'seller_id')::uuid);
 PERFORM private.seller_legacy_sales_update_order_dates(o.id,(f->>'order_date')::date,(f->>'delivery_deadline')::date,NULL,f->>'shipping_country');
 PERFORM private.seller_legacy_sales_update_order_address_number(o.id,f->>'shipping_address_number');
 IF jsonb_array_length(coalesce(f->'item_costs','[]'))>0 THEN
  IF NOT private.remuneration_can_review(auth.uid()) THEN RAISE EXCEPTION 'Custos de mercadoria restritos ao financeiro e administradores.'; END IF;
  PERFORM public.sales_set_order_item_costs(o.id,f->'item_costs');
 END IF;
 IF f ? 'shipping_mode' THEN
  IF f->>'shipping_mode' NOT IN('included','value','percent','automatic') OR f->>'shipping_mode' IS NULL THEN RAISE EXCEPTION 'Modalidade do frete inválida.'; END IF;
  UPDATE public.orders SET delivery=coalesce(delivery,'{}'::jsonb)||jsonb_build_object('shipping_mode',f->>'shipping_mode') WHERE id=o.id;
 END IF;
 PERFORM private.integral_apply_order_compensation(o.id);
END $function$;