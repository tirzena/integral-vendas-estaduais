CREATE OR REPLACE FUNCTION private.seller_in_creation()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT EXISTS(SELECT 1 FROM private.seller_creation_context c
 WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current()
 AND c.actor=auth.uid() AND c.operation IN ('create_sale','register_payment','edit_order','crm_write'))
$function$
;
CREATE OR REPLACE FUNCTION private.seller_creation_can_manage(p_actor uuid, p_seller uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT (NOT private.seller_is_restricted(auth.uid()) AND public.sales_can_manage(p_actor,p_seller)) OR (p_actor=auth.uid() AND p_seller=p_actor AND EXISTS (
 SELECT 1 FROM private.seller_creation_context c JOIN public.orders o ON o.id=c.new_order_id
 WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current()
 AND c.actor=p_actor AND c.operation IN ('create_sale','register_payment','edit_order') AND o.seller_id=p_actor))
$function$
;
CREATE OR REPLACE FUNCTION private.seller_write_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF NOT private.seller_is_restricted(auth.uid()) THEN RETURN NULL; END IF;
 IF TG_TABLE_NAME='customers' AND TG_OP='INSERT' AND EXISTS (
   SELECT 1 FROM private.seller_creation_context c
   WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current()
     AND c.actor=auth.uid() AND c.operation='create_sale'
 ) THEN RETURN NULL; END IF;
 IF TG_TABLE_NAME IN ('delivery_tracking_sessions','tracking_view_sessions') AND TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM private.seller_creation_context c WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.actor=auth.uid() AND c.operation='edit_order') THEN RETURN NULL; END IF;
 IF TG_TABLE_NAME IN ('customers','customer_products') AND TG_OP IN ('INSERT','UPDATE') AND EXISTS(SELECT 1 FROM private.seller_creation_context c WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.actor=auth.uid() AND c.operation='crm_write') THEN RETURN NULL; END IF;
 IF TG_OP='TRUNCATE' OR NOT private.seller_in_creation() OR TG_TABLE_NAME NOT IN (
  'orders','order_items','payments','order_payment_proofs','order_audit_log',
  'inventory_items','warehouse_inventory','inventory_movements','stock_lot_balances',
  'stock_lot_receipts','stock_lot_movements','purchase_orders','purchase_order_items',
  'purchase_payments','accounts_payable','accounts_receivable','document_counters'
 ) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Seller cannot edit data.'; END IF;
 RETURN NULL;
END $function$
;

ALTER TABLE private.seller_creation_context DROP CONSTRAINT seller_creation_context_operation_check; ALTER TABLE private.seller_creation_context ADD CONSTRAINT seller_creation_context_operation_check CHECK(operation IN('create_sale','register_payment','edit_order','crm_write'));
CREATE OR REPLACE FUNCTION public.estadual_seller_crm_create(p_request jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_variable
declare
  actor uuid := private.seller_require_actor();
  prod uuid; customer uuid; pipe uuid; stage uuid; opportunity uuid;
  currency public.currency_code; value numeric; name text;
begin
  IF NOT private.integral_operation_allowed(actor,'opportunities.create') THEN RAISE EXCEPTION 'Criação de oportunidade não concedida.' USING ERRCODE='42501'; END IF;
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
  insert into private.seller_creation_context values(pg_backend_pid(),txid_current(),actor,gen_random_uuid(),'crm_write');
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
    perform pg_advisory_xact_lock(hashtextextended('customer:'||actor::text||':'||lower(name)||':'||coalesce(p_request->>'phone',''),0));
    select c.id into customer from public.customers c where c.created_by=actor and c.deleted_at is null and lower(btrim(c.name))=lower(name) and coalesce(c.phone,'')=coalesce(p_request->>'phone','') order by c.created_at limit 1;
    if customer is null then
    insert into public.customers(name,phone,whatsapp,email,document,city,origin,created_by)
    values(name,nullif(p_request->>'phone',''),nullif(p_request->>'phone',''),
      nullif(p_request->>'email',''),nullif(p_request->>'document',''),
      nullif(p_request->>'city',''),nullif(p_request->>'lead_origin',''),actor)
    returning id into customer;
    end if;
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
  delete from private.seller_creation_context c where c.backend_pid=pg_backend_pid() and c.transaction_id=txid_current() and c.actor=actor;
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
#variable_conflict use_variable
declare actor uuid := private.seller_require_actor(); current_pipeline uuid;
begin
  IF NOT private.integral_operation_allowed(actor,'opportunities.edit') THEN RAISE EXCEPTION 'Edição de oportunidade não concedida.' USING ERRCODE='42501'; END IF;
  select cp.pipeline_id into current_pipeline from public.customer_products cp
  join public.product_users pu on pu.product_id=cp.product_id and pu.user_id=actor
  where cp.id=p_card_id and cp.owner_id=actor for update of cp;
  if current_pipeline is null or not exists (
    select 1 from public.pipeline_stages s where s.id=p_stage_id and s.pipeline_id=current_pipeline
  ) then raise exception using errcode='42501',message='Stage not granted for this opportunity.'; end if;
  insert into private.seller_creation_context values(pg_backend_pid(),txid_current(),actor,p_card_id,'crm_write');
  update public.customer_products set stage_id=p_stage_id,updated_at=now() where id=p_card_id;
  delete from private.seller_creation_context c where c.backend_pid=pg_backend_pid() and c.transaction_id=txid_current() and c.actor=actor;
end
$function$
;