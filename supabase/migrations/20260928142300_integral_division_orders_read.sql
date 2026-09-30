create or replace function public.integral_division_orders(p_system_code text, p_limit integer default 100)
returns table(id uuid, number integer, order_date date, created_at timestamptz, currency public.currency_code, total numeric, payment_status text, workflow_stage text, shipping_state text, seller_id uuid)
language sql stable security invoker set search_path = '' as $$
  select o.id,o.number,o.order_date,o.created_at,o.currency,o.total,o.payment_status,o.workflow_stage,o.shipping_state,o.seller_id
  from public.orders o
  where p_system_code='vendas_estaduais'
    and o.deleted_at is null and o.superseded_at is null
    and public.integral_can_access_record('vendas_estaduais',o.shipping_state,null,o.product_id,false,o.seller_id)
  order by o.created_at desc,o.id desc
  limit least(greatest(coalesce(p_limit,100),1),200)
$$;
revoke all on function public.integral_division_orders(text,integer) from public,anon;
grant execute on function public.integral_division_orders(text,integer) to authenticated;