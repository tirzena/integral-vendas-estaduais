create or replace function public.integral_delivery_filter_metadata(p_order_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); manager boolean; result jsonb;
begin
 if actor is null or not exists(select 1 from public.profiles where id=actor and is_active) then raise exception 'Acesso não autorizado.'; end if;
 if p_order_ids is null or cardinality(p_order_ids)>500 then raise exception 'Lista de entregas inválida.'; end if;
 manager:=coalesce(public.app_has_cap(actor,'deliveries_manage'),false);
 if not manager and exists(select 1 from unnest(p_order_ids) requested(id) where not exists(select 1 from public.my_deliveries() d where d.order_id=requested.id)) then raise exception 'Entrega não autorizada.'; end if;
 with o as (select id,seller_id,origin,order_date,created_at from public.orders where id=any(p_order_ids) and deleted_at is null and superseded_at is null),
 l as (select oi.order_id,oi.item_id,oi.description,oi.quantity from public.order_items oi join o on o.id=oi.order_id),
 i as (select id,name,supplier_id from public.inventory_items where id in(select item_id from l)),
 m as (select distinct team_id,user_id from public.team_members where user_id in(select seller_id from o))
 select jsonb_build_object(
 'orders',coalesce((select jsonb_agg(o) from o),'[]'::jsonb),
 'lines',coalesce((select jsonb_agg(l) from l),'[]'::jsonb),
 'items',coalesce((select jsonb_agg(i) from i),'[]'::jsonb),
 'teamMembers',coalesce((select jsonb_agg(m) from m),'[]'::jsonb),
 'people',coalesce((select jsonb_agg(p) from(select id,full_name from public.profiles where id in(select seller_id from o))p),'[]'::jsonb),
 'suppliers',coalesce((select jsonb_agg(s) from(select id,name from public.suppliers where id in(select supplier_id from i))s),'[]'::jsonb),
 'teams',coalesce((select jsonb_agg(t) from(select id,name from public.teams where id in(select team_id from m))t),'[]'::jsonb)) into result;
 return result;
end; $$;
revoke all on function public.integral_delivery_filter_metadata(uuid[]) from public,anon;
grant execute on function public.integral_delivery_filter_metadata(uuid[]) to authenticated;