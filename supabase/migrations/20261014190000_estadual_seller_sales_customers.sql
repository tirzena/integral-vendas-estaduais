-- Estadual sellers: primary category grants authorize active items.
-- Warehouse availability and stock reservations remain validated in seller_portal_quote/create_sale.
create or replace function private.seller_item_allowed(p_actor uuid, p_item uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.inventory_items i
    join public.products p on p.id=i.product_id
    where i.id=p_item and i.is_active and p.is_active and p.deleted_at is null
      and exists (select 1 from public.product_users pu
                  where pu.user_id=p_actor and pu.product_id=p.id)
      and (i.category_id is null or exists (
        select 1 from public.product_categories c
        where c.id=i.category_id and c.product_id=p.id
      ))
  )
$$;

create or replace function public.estadual_seller_warehouse_stock()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare actor uuid := private.seller_require_actor();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'warehouse_id', wi.warehouse_id, 'item_id', wi.item_id,
      'available', greatest(0,wi.quantity-wi.reserved)
    ))
    from public.warehouse_inventory wi
    join public.warehouses w on w.id=wi.warehouse_id and w.is_active
    where wi.quantity>wi.reserved and private.seller_item_allowed(actor,wi.item_id)
  ),'[]'::jsonb);
end
$$;
revoke all on function public.estadual_seller_warehouse_stock() from public,anon;
grant execute on function public.estadual_seller_warehouse_stock() to authenticated;

create or replace function public.estadual_seller_customers()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare actor uuid := private.seller_require_actor();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',c.id,'name',c.name,'phone',c.phone,'whatsapp',c.whatsapp,
      'email',c.email,'document',c.document,'city',c.city,'state',c.state,
      'address',c.address,'status',c.status
    ) order by c.name,c.id)
    from public.customers c
    where c.deleted_at is null and (
      c.created_by=actor
      or exists (select 1 from public.orders o where o.customer_id=c.id
        and o.seller_id=actor and o.deleted_at is null and o.superseded_at is null
        and o.status<>'cancelado')
      or exists (select 1 from public.customer_products cp
        where cp.customer_id=c.id and cp.owner_id=actor)
    )
  ),'[]'::jsonb);
end
$$;
revoke all on function public.estadual_seller_customers() from public,anon;
grant execute on function public.estadual_seller_customers() to authenticated;

create or replace function public.estadual_seller_create_customer(
  p_name text, p_phone text default null, p_email text default null
)
returns uuid language plpgsql security definer set search_path = ''
as $$
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
$$;
revoke all on function public.estadual_seller_create_customer(text,text,text) from public,anon;
grant execute on function public.estadual_seller_create_customer(text,text,text) to authenticated;

-- The existing atomic sale function reserves stock and deduplicates requests.
-- This wrapper also binds every new sale to a canonical customer, in the SAME transaction.
create or replace function public.estadual_seller_create_order(
  p_request jsonb, p_request_id uuid, p_expected_quote jsonb,
  p_customer_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := private.seller_require_actor();
  sale jsonb; order_id uuid; customer uuid; customer_name text; customer_phone text;
begin
  if not exists (select 1 from public.integral_division_access a
    where a.user_id=actor and a.system_code='vendas_estaduais' and a.can_write)
  then raise exception using errcode='42501',message='Estadual write access required.'; end if;
  sale:=public.seller_portal_create_sale(p_request,p_request_id,null,p_expected_quote);
  order_id:=(sale->>'id')::uuid;
  if not exists (select 1 from public.orders o where o.id=order_id and o.seller_id=actor)
  then raise exception using errcode='42501',message='Order ownership mismatch.'; end if;
  select o.customer_id into customer from public.orders o where o.id=order_id;
  if customer is not null then return sale; end if;
  customer_name:=btrim(coalesce(p_request->'customer'->>'name',''));
  customer_phone:=nullif(btrim(coalesce(p_request->'customer'->>'phone','')),'');
  if p_customer_id is not null then
    select c.id into customer from public.customers c
    where c.id=p_customer_id and c.deleted_at is null and (
      c.created_by=actor
      or exists(select 1 from public.orders o where o.customer_id=c.id
        and o.seller_id=actor and o.id<>order_id)
      or exists(select 1 from public.customer_products cp
        where cp.customer_id=c.id and cp.owner_id=actor)
    );
    if customer is null then raise exception using errcode='42501',message='Customer not assigned.'; end if;
  else
    select c.id into customer from public.customers c
    where c.deleted_at is null and lower(btrim(c.name))=lower(customer_name)
      and coalesce(c.phone,'')=coalesce(customer_phone,'')
      and (c.created_by=actor or exists(select 1 from public.orders o
        where o.customer_id=c.id and o.seller_id=actor))
    order by c.created_at limit 1;
    if customer is null then
      insert into public.customers(name,phone,whatsapp,created_by,origin)
      values(customer_name,customer_phone,customer_phone,actor,'Vendas Estaduais')
      returning id into customer;
    end if;
  end if;
  update public.orders set customer_id=customer where id=order_id and seller_id=actor;
  return sale||jsonb_build_object('customer_id',customer);
end
$$;
revoke all on function public.estadual_seller_create_order(jsonb,uuid,jsonb,uuid) from public,anon;
grant execute on function public.estadual_seller_create_order(jsonb,uuid,jsonb,uuid) to authenticated;
