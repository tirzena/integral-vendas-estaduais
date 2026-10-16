
-- Read model for dashboard stock. Keeps grants and warehouse balances unchanged.
create or replace function private.integral_dashboard_stock()
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare actor uuid:=auth.uid(); admin boolean; show_cost boolean; result jsonb;
begin
 if actor is null or not exists(select 1 from public.profiles p where p.id=actor and p.is_active)
   or not exists(select 1 from public.user_roles r where r.user_id=actor) then
  raise exception using errcode='42501',message='Conta não autorizada.';
 end if;
 if not private.seller_is_restricted(actor) then raise exception using errcode='42501',message='Use a consulta de estoque do seu perfil.'; end if;
 admin:=public.is_admin(actor);
 show_cost:=admin or (public.sales_sees_all(actor) and exists(select 1 from public.get_my_capabilities() c where c='company_finance'));
 with allowed_warehouses as (
  select w.id,w.name,w.city,w.state,w.country,w.level,w.parent_id from public.warehouses w where w.is_active
   and (admin or public.stock_user_warehouse_scope(actor,w.id)
     or (not exists(select 1 from public.integral_member_rules r where r.user_id=actor)
       and not exists(select 1 from public.user_roles r where r.user_id=actor and r.role='estoque')))
 ), allowed_items as (
  select i.id,i.name,i.variation,i.quantity,i.min_quantity,i.product_id,i.category_id,
   case when show_cost then i.cost else null end cost,i.currency
  from public.inventory_items i join public.products p on p.id=i.product_id
  where i.is_active and p.is_active and p.deleted_at is null
    and (admin or private.seller_item_allowed(actor,i.id))
 ), balances as (
  select wi.warehouse_id,wi.item_id,greatest(0,wi.quantity-wi.reserved) quantity,0 reserved,wi.min_quantity,wi.location
  from public.warehouse_inventory wi join allowed_warehouses w on w.id=wi.warehouse_id join allowed_items i on i.id=wi.item_id
 )
 select jsonb_build_object(
  'canSeeCost',show_cost,
  'inventory',coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('quantity',coalesce((select sum(b.quantity) from balances b where b.item_id=i.id),0)) order by i.name) from allowed_items i),'[]'::jsonb),
  'warehouses',coalesce((select jsonb_agg(w order by w.name) from allowed_warehouses w),'[]'::jsonb),
  'balances',coalesce((select jsonb_agg(b) from balances b),'[]'::jsonb)) into result;
 return result;
end $fn$;
revoke all on function private.integral_dashboard_stock() from public,anon;
grant execute on function private.integral_dashboard_stock() to authenticated;
create or replace function public.integral_dashboard_stock()
returns jsonb language plpgsql stable security invoker set search_path='' as $fn$
declare actor uuid:=auth.uid(); show_cost boolean; result jsonb;
begin
 if private.seller_is_restricted(actor) then return private.integral_dashboard_stock(); end if;
 if actor is null or not exists(select 1 from public.profiles p where p.id=actor and p.is_active)
   or not exists(select 1 from public.user_roles r where r.user_id=actor) then
  raise exception using errcode='42501',message='Conta não autorizada.';
 end if;
 show_cost:=public.is_admin(actor) or (public.sales_sees_all(actor) and exists(select 1 from public.get_my_capabilities() c where c='company_finance'));
 -- Non-seller reads retain the existing table RLS, including stock ownership scope.
 with allowed_warehouses as (
  select w.id,w.name,w.city,w.state,w.country,w.level,w.parent_id from public.warehouses w where w.is_active
 ), allowed_items as (
  select i.id,i.name,i.variation,i.min_quantity,i.product_id,i.category_id,
    case when show_cost then i.cost else null end cost,i.currency
  from public.inventory_items i join public.products p on p.id=i.product_id
  where i.is_active and p.is_active and p.deleted_at is null
 ), balances as (
  select wi.warehouse_id,wi.item_id,greatest(0,wi.quantity-wi.reserved) quantity,0 reserved,wi.min_quantity,wi.location
  from public.warehouse_inventory wi join allowed_warehouses w on w.id=wi.warehouse_id join allowed_items i on i.id=wi.item_id
 )
 select jsonb_build_object('canSeeCost',show_cost,
  'inventory',coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('quantity',coalesce((select sum(b.quantity) from balances b where b.item_id=i.id),0)) order by i.name) from allowed_items i),'[]'::jsonb),
  'warehouses',coalesce((select jsonb_agg(w order by w.name) from allowed_warehouses w),'[]'::jsonb),
  'balances',coalesce((select jsonb_agg(b) from balances b),'[]'::jsonb)) into result;
 return result;
end $fn$;
revoke all on function public.integral_dashboard_stock() from public,anon;
grant execute on function public.integral_dashboard_stock() to authenticated;
