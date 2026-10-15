CREATE OR REPLACE FUNCTION public.estadual_seller_create_customer(p_name text, p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid := private.seller_require_actor(); customer uuid;
begin
  if not exists (select 1 from public.integral_division_access a
    where a.user_id=actor and a.system_code='vendas_estaduais' and a.can_write)
  then raise exception using errcode='42501',message='Estadual write access required.'; end if;
  p_name:=btrim(coalesce(p_name,''));
  if length(p_name) not between 1 and 150 or length(coalesce(p_phone,''))>80
    or length(coalesce(p_email,''))>254 then raise exception 'Invalid customer data.'; end if;
  select c.id into customer from public.customers c
  where c.created_by=actor and c.deleted_at is null
    and lower(btrim(c.name))=lower(p_name)
    and coalesce(c.phone,'')=coalesce(p_phone,'')
  order by c.created_at limit 1;
  if customer is not null then return customer; end if;
  insert into public.customers(name,phone,whatsapp,email,created_by,origin)
  values(p_name,nullif(p_phone,''),nullif(p_phone,''),nullif(p_email,''),actor,'Vendas Estaduais')
  returning id into customer;
  return customer;
end
$function$
;
CREATE OR REPLACE FUNCTION public.estadual_seller_crm_create(p_request jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := private.seller_require_actor();
  prod uuid; customer uuid; pipe uuid; stage uuid; opportunity uuid;
  currency public.currency_code; value numeric; name text;
begin
  if jsonb_typeof(p_request) is distinct from 'object' or exists (
    select 1 from jsonb_object_keys(p_request) k where k not in
      ('product_id','customer_id','name','phone','email','document','city',
       'lead_origin','potential_value','currency','notes')
  ) then raise exception 'Invalid opportunity fields.'; end if;
  prod := (p_request->>'product_id')::uuid;
  if prod is null or not exists (
    select 1 from public.product_users pu join public.products p on p.id=pu.product_id
    where pu.user_id=actor and pu.product_id=prod and p.is_active and p.deleted_at is null
  ) then raise exception using errcode='42501',message='Product not granted.'; end if;
  select p.id into pipe from public.pipelines p
  where p.product_id=prod and p.is_default order by p.id limit 1;
  select s.id into stage from public.pipeline_stages s
  where s.pipeline_id=pipe order by s.position,s.id limit 1;
  if stage is null then raise exception 'Category has no configured pipeline stages.'; end if;
  currency := coalesce(nullif(p_request->>'currency',''),'BRL')::public.currency_code;
  value := nullif(p_request->>'potential_value','')::numeric;
  if value is not null and (value<0 or value>100000000000 or value::text in ('NaN','Infinity','-Infinity'))
  then raise exception 'Invalid opportunity value.'; end if;
  if length(coalesce(p_request->>'notes',''))>4000 or length(coalesce(p_request->>'lead_origin',''))>150
  then raise exception 'Opportunity text is too long.'; end if;
  customer := nullif(p_request->>'customer_id','')::uuid;
  if customer is not null then
    if not exists (select 1 from public.customers c where c.id=customer and c.deleted_at is null
      and (c.created_by=actor or exists(select 1 from public.customer_products cp
         where cp.customer_id=c.id and cp.owner_id=actor)))
    then raise exception using errcode='42501',message='Customer not assigned.'; end if;
  else
    name := btrim(coalesce(p_request->>'name',''));
    if length(name) not between 1 and 150 then raise exception 'Enter a customer name.'; end if;
    if length(coalesce(p_request->>'phone',''))>80 or length(coalesce(p_request->>'email',''))>254
       or length(coalesce(p_request->>'document',''))>80 or length(coalesce(p_request->>'city',''))>150
    then raise exception 'Customer fields too long.'; end if;
    insert into public.customers(name,phone,whatsapp,email,document,city,origin,created_by)
    values(name,nullif(p_request->>'phone',''),nullif(p_request->>'phone',''),
      nullif(p_request->>'email',''),nullif(p_request->>'document',''),
      nullif(p_request->>'city',''),nullif(p_request->>'lead_origin',''),actor)
    returning id into customer;
  end if;
  if exists (select 1 from public.customer_products cp where cp.customer_id=customer and cp.product_id=prod)
  then raise exception 'This customer already has an opportunity in this category.'; end if;
  insert into public.customer_products(
    customer_id,product_id,pipeline_id,stage_id,owner_id,commercial_status,
    lead_origin,potential_value,currency,notes
  ) values(
    customer,prod,pipe,stage,actor,'em_negociacao',
    nullif(p_request->>'lead_origin',''),value,currency,
    nullif(p_request->>'notes','')
  ) returning id into opportunity;
  return opportunity;
end
$function$
;
CREATE OR REPLACE FUNCTION public.estadual_seller_crm_move(p_card_id uuid, p_stage_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid := private.seller_require_actor(); current_pipeline uuid;
begin
  select cp.pipeline_id into current_pipeline from public.customer_products cp
  join public.product_users pu on pu.product_id=cp.product_id and pu.user_id=actor
  where cp.id=p_card_id and cp.owner_id=actor for update of cp;
  if current_pipeline is null or not exists (
    select 1 from public.pipeline_stages s where s.id=p_stage_id and s.pipeline_id=current_pipeline
  ) then raise exception using errcode='42501',message='Stage not granted for this opportunity.'; end if;
  update public.customer_products set stage_id=p_stage_id,updated_at=now() where id=p_card_id;
end
$function$
;
CREATE OR REPLACE FUNCTION public.estadual_seller_create_order(p_request jsonb, p_request_id uuid, p_expected_quote jsonb, p_customer_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor uuid:=private.seller_require_actor();
  sale jsonb; order_id uuid; linked_customer uuid; customer uuid;
  customer_name text; customer_phone text;
BEGIN
 IF NOT private.integral_operation_allowed(auth.uid(),'orders.create') THEN RAISE EXCEPTION 'Operação não concedida: orders.create' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.integral_division_access a
   WHERE a.user_id=actor AND a.system_code='vendas_estaduais' AND a.can_write)
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Estadual write access required.'; END IF;
 sale:=public.seller_portal_create_sale(p_request,p_request_id,NULL,p_expected_quote);
 order_id:=(sale->>'id')::uuid;
 SELECT o.customer_id INTO linked_customer FROM public.orders o
 WHERE o.id=order_id AND o.seller_id=actor;
 IF NOT FOUND THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Order ownership mismatch.';
 END IF;
 IF linked_customer IS NOT NULL THEN
   IF p_customer_id IS NOT NULL AND p_customer_id<>linked_customer THEN
     RAISE EXCEPTION 'Request already linked to a different customer.';
   END IF;
   RETURN sale||jsonb_build_object('customer_id',linked_customer);
 END IF;
 customer_name:=btrim(coalesce(p_request->'customer'->>'name',''));
 customer_phone:=nullif(btrim(coalesce(p_request->'customer'->>'phone','')),'');
 IF length(customer_name) NOT BETWEEN 1 AND 150 OR length(coalesce(customer_phone,''))>80
 THEN RAISE EXCEPTION 'Invalid customer details.'; END IF;
 IF p_customer_id IS NOT NULL THEN
   SELECT c.id INTO customer FROM public.customers c
   WHERE c.id=p_customer_id AND c.deleted_at IS NULL AND (
     c.created_by=actor OR EXISTS(
       SELECT 1 FROM public.orders o WHERE o.customer_id=c.id AND o.seller_id=actor
         AND o.id<>order_id AND o.deleted_at IS NULL AND o.superseded_at IS NULL
     ) OR EXISTS(
       SELECT 1 FROM public.customer_products cp
       WHERE cp.customer_id=c.id AND cp.owner_id=actor
     )
   );
   IF customer IS NULL THEN
     RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Customer not assigned.';
   END IF;
 ELSE
   SELECT c.id INTO customer FROM public.customers c
   WHERE c.deleted_at IS NULL AND c.created_by=actor
     AND lower(btrim(c.name))=lower(customer_name)
     AND coalesce(c.phone,'')=coalesce(customer_phone,'')
   ORDER BY c.created_at,c.id LIMIT 1;
 END IF;
 INSERT INTO private.seller_creation_context(backend_pid,transaction_id,actor,new_order_id,operation)
 VALUES(pg_backend_pid(),txid_current(),actor,order_id,'create_sale');
 IF customer IS NULL THEN
   INSERT INTO public.customers(name,phone,whatsapp,created_by,origin)
   VALUES(customer_name,customer_phone,customer_phone,actor,'Vendas Estaduais')
   RETURNING id INTO customer;
 END IF;
 UPDATE public.orders SET customer_id=customer WHERE id=order_id AND seller_id=actor;
 DELETE FROM private.seller_creation_context c
 WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current()
   AND c.actor=actor AND c.new_order_id=order_id AND c.operation='create_sale';
 RETURN sale||jsonb_build_object('customer_id',customer);
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
CREATE OR REPLACE FUNCTION public.seller_portal_register_payment(p_order_id uuid, p_request_id uuid, p_payment jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_actor uuid:=private.seller_require_actor(); o public.orders%ROWTYPE; existing record; result jsonb;
BEGIN
 IF NOT private.integral_operation_allowed(auth.uid(),'payments.create') THEN RAISE EXCEPTION 'Operação não concedida: payments.create' USING ERRCODE='42501'; END IF;
 IF p_order_id IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'Order and request IDs required.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('seller-sale:'||v_actor::text,0));
 SELECT * INTO o FROM public.orders so WHERE so.id=p_order_id AND so.seller_id=v_actor FOR UPDATE;
 IF NOT FOUND OR o.deleted_at IS NOT NULL OR o.superseded_at IS NOT NULL OR o.status='cancelado'
 OR o.kind NOT IN ('venda','pre_pedido') OR o.workflow_stage IN ('cancelado','rascunho','solicitacao_catalogo','perdido')
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Own active order required.'; END IF;
 SELECT * INTO existing FROM private.seller_payment_requests r WHERE r.actor=v_actor AND r.request_id=p_request_id;
 IF FOUND THEN
 IF existing.order_id<>o.id OR existing.payment IS DISTINCT FROM p_payment THEN RAISE EXCEPTION 'Request ID reused with different receipt.'; END IF;
 RETURN existing.result||jsonb_build_object('replayed',true);
 END IF;
 INSERT INTO private.seller_creation_context VALUES(pg_backend_pid(),txid_current(),v_actor,o.id,'register_payment');
 PERFORM set_config('os.creating_order_id','',true);
 PERFORM set_config('os.created_payments','',true);
 IF o.stock_state='reservado' THEN
 INSERT INTO private.seller_stock_settlements(order_id,settled_ratio)
 VALUES(o.id,CASE WHEN EXISTS(SELECT 1 FROM public.inventory_movements m WHERE m.document_id=o.id AND m.movement_type='saida') THEN least(1,greatest(0,o.amount_paid/NULLIF(o.total,0))) ELSE 0 END)
 ON CONFLICT(order_id) DO NOTHING;
 END IF;
 result:=private.seller_submit_receipt(o.id,p_payment);
 INSERT INTO private.seller_payment_requests VALUES(v_actor,p_request_id,o.id,p_payment,result);
 DELETE FROM private.seller_creation_context c WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.actor=v_actor;
 RETURN result||jsonb_build_object('replayed',false);
END $function$
;
