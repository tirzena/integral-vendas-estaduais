CREATE OR REPLACE FUNCTION public.integral_seller_create_pdv_order(p_args jsonb, p_followup jsonb, p_exchange jsonb, p_request_id uuid, p_estadual boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_variable
DECLARE actor uuid:=private.seller_require_actor(); fingerprint jsonb; previous private.remuneration_creation_requests; cust public.customers; payload jsonb; result jsonb; quote jsonb; li jsonb; items jsonb:='[]'; qty numeric; price numeric; discount numeric; exchange jsonb; cid uuid;
BEGIN
 IF NOT private.integral_operation_allowed(actor,'orders.create') THEN RAISE EXCEPTION 'Criação de pedidos não concedida.' USING ERRCODE='42501'; END IF;
 IF p_estadual AND NOT EXISTS(SELECT 1 FROM public.integral_division_access WHERE user_id=actor AND system_code='vendas_estaduais' AND can_write) THEN RAISE EXCEPTION 'Acesso estadual de escrita não concedido.' USING ERRCODE='42501'; END IF;
 IF NOT coalesce((SELECT workflow_enabled FROM private.remuneration_settings),false) THEN RAISE EXCEPTION 'O fluxo de aprovação deve estar ativo.'; END IF;
 IF p_request_id IS NULL OR jsonb_typeof(p_args) IS DISTINCT FROM 'object' OR jsonb_typeof(p_followup) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Informe os dados completos do pedido.'; END IF;
 IF p_followup->>'seller_id' IS DISTINCT FROM actor::text THEN RAISE EXCEPTION 'O vendedor só pode criar pedidos em seu próprio nome.' USING ERRCODE='42501'; END IF;
 IF jsonb_array_length(coalesce(p_args->'p_payments','[]'))<>0 OR coalesce((p_args->>'p_shipping_cost')::numeric,0)<>0 OR coalesce((p_args->>'p_discount')::numeric,0)<>0 OR coalesce((p_followup->>'variable_cost')::numeric,0)<>0 OR jsonb_array_length(coalesce(p_followup->'item_costs','[]'))<>0 THEN RAISE EXCEPTION 'Frete, custos internos e pagamentos não podem ser acrescentados pelo vendedor neste cadastro.'; END IF;
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
  RETURN jsonb_build_object('requires_price_confirmation',true,'quote',quote);
 END IF;
 quote:=private.seller_calculate(actor,payload);
 result:=CASE WHEN p_estadual THEN public.estadual_seller_create_order(payload,p_request_id,quote,cid) ELSE public.integral_seller_create_order(payload,p_request_id,quote,cid) END;
 INSERT INTO private.remuneration_creation_requests(actor,request_id,payload,result) VALUES(actor,p_request_id,fingerprint,result);
 RETURN result;
END $function$
