-- Canonical sales orders historically stored the product on order_items.inventory_items
-- while orders.product_id can be null. Division scope must derive that product or sellers
-- lose access to their own legacy/current orders.
create or replace function public.integral_order_matches_access(
  p_system_code text,
  p_order_id uuid,
  p_write boolean default false
) returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1
    from public.orders o
    where o.id = p_order_id
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

drop policy if exists "Vendas estaduais read scoped orders" on public.orders;
create policy "Vendas estaduais read scoped orders"
on public.orders for select to authenticated
using (public.integral_order_matches_access('vendas_estaduais', id, false));

drop policy if exists "Vendas estaduais update scoped orders" on public.orders;
create policy "Vendas estaduais update scoped orders"
on public.orders for update to authenticated
using (public.integral_order_matches_access('vendas_estaduais', id, true))
with check (public.integral_order_matches_access('vendas_estaduais', id, true));

drop policy if exists "Vendas estaduais read scoped order items" on public.order_items;
create policy "Vendas estaduais read scoped order items"
on public.order_items for select to authenticated
using (public.integral_order_matches_access('vendas_estaduais', order_id, false));

create or replace function public.integral_division_orders(p_system_code text, p_limit integer default 100)
returns table(id uuid, number integer, order_date date, created_at timestamptz, currency public.currency_code, total numeric, payment_status text, workflow_stage text, shipping_state text, seller_id uuid)
language sql stable security invoker set search_path = '' as $$
  select o.id,o.number,o.order_date,o.created_at,o.currency,o.total,o.payment_status,o.workflow_stage,o.shipping_state,o.seller_id
  from public.orders o
  where p_system_code='vendas_estaduais'
    and o.deleted_at is null and o.superseded_at is null
    and public.integral_order_matches_access('vendas_estaduais',o.id,false)
  order by o.created_at desc,o.id desc
  limit least(greatest(coalesce(p_limit,100),1),200)
$$;
revoke all on function public.integral_division_orders(text,integer) from public,anon;
grant execute on function public.integral_division_orders(text,integer) to authenticated;
