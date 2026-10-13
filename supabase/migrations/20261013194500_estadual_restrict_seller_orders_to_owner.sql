-- A restricted seller must never see or edit another seller's orders.
-- Product/category grants control WHICH of the seller's OWN orders are visible;
-- they must not turn into permission to browse colleagues' orders.
-- Keep SECURITY DEFINER to avoid recursive RLS on orders/order_items.
create or replace function public.integral_order_matches_access(
  p_system_code text,
  p_order_id uuid,
  p_write boolean default false
) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.orders o
    where o.id = p_order_id
      and (
        not private.seller_is_restricted((select auth.uid()))
        or o.seller_id = (select auth.uid())
      )
      and (
        public.integral_can_access_record(
          p_system_code, o.shipping_state, null, o.product_id, p_write, o.seller_id
        )
        or exists (
          select 1
          from public.order_items oi
          join public.inventory_items ii on ii.id = oi.item_id
          where oi.order_id = o.id
            and public.integral_can_access_record(
              p_system_code, o.shipping_state, null, ii.product_id, p_write, o.seller_id
            )
        )
      )
  )
$$;
revoke all on function public.integral_order_matches_access(text,uuid,boolean) from public,anon;
grant execute on function public.integral_order_matches_access(text,uuid,boolean) to authenticated;
