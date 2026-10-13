-- Isolated seller CRM: privileged functions expose only the caller's own contacts
-- and granted products. No broad table policies are relaxed.
create or replace function public.estadual_seller_crm_data()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare actor uuid := private.seller_require_actor();
begin
  return jsonb_build_object(
    'pipelines', coalesce((
      select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'product_id',p.product_id))
      from public.pipelines p
      join public.product_users pu on pu.product_id=p.product_id and pu.user_id=actor
      join public.products prod on prod.id=p.product_id
      where p.is_default and prod.is_active and prod.deleted_at is null
    ),'[]'::jsonb),
    'stages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',s.id,'name',s.name,'position',s.position,'stage_type',s.stage_type,
        'pipeline_id',s.pipeline_id,'pipelines',jsonb_build_object('product_id',p.product_id)
      ) order by s.position)
      from public.pipeline_stages s
      join public.pipelines p on p.id=s.pipeline_id and p.is_default
      join public.product_users pu on pu.product_id=p.product_id and pu.user_id=actor
      join public.products prod on prod.id=p.product_id
      where prod.is_active and prod.deleted_at is null
    ),'[]'::jsonb),
    'cards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',cp.id,'customer_id',cp.customer_id,'product_id',cp.product_id,
        'pipeline_id',cp.pipeline_id,'stage_id',cp.stage_id,'owner_id',cp.owner_id,
        'commercial_status',cp.commercial_status,'lead_origin',cp.lead_origin,
        'potential_value',cp.potential_value,'currency',cp.currency,'notes',cp.notes,
        'last_contact_at',cp.last_contact_at,'next_action_at',cp.next_action_at,
        'entered_at',cp.entered_at,'created_at',cp.created_at,
        'customers',jsonb_build_object('name',c.name,'phone',c.phone),
        'products',jsonb_build_object('name',p.name,'main_currency',p.main_currency)
      ) order by cp.created_at desc)
      from public.customer_products cp
      join public.customers c on c.id=cp.customer_id and c.deleted_at is null
      join public.products p on p.id=cp.product_id
      join public.product_users pu on pu.product_id=cp.product_id and pu.user_id=actor
      where cp.owner_id=actor
    ),'[]'::jsonb),
    'customers', coalesce((
      select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name) order by c.name)
      from public.customers c
      where c.deleted_at is null and (
        c.created_by=actor or exists (
          select 1 from public.customer_products cp where cp.customer_id=c.id and cp.owner_id=actor
        )
      )
    ),'[]'::jsonb)
  );
end
$$;
revoke all on function public.estadual_seller_crm_data() from public,anon;
grant execute on function public.estadual_seller_crm_data() to authenticated;

create or replace function public.estadual_seller_crm_create(p_request jsonb)
returns uuid language plpgsql security definer set search_path = ''
as $$
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
$$;
revoke all on function public.estadual_seller_crm_create(jsonb) from public,anon;
grant execute on function public.estadual_seller_crm_create(jsonb) to authenticated;

create or replace function public.estadual_seller_crm_move(p_card_id uuid,p_stage_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
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
$$;
revoke all on function public.estadual_seller_crm_move(uuid,uuid) from public,anon;
grant execute on function public.estadual_seller_crm_move(uuid,uuid) to authenticated;
