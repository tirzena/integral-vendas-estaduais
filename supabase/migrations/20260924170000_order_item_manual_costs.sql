-- Manual costs belong to an order line, never to the inventory catalog.
-- This private table is deliberately absent from the Data API.
create table if not exists private.order_item_manual_costs (
  order_item_id uuid primary key references public.order_items(id) on delete cascade,
  unit_cost numeric not null check (unit_cost >= 0 and unit_cost < 1000000000000),
  updated_at timestamptz not null default now(),
  updated_by uuid not null
);
revoke all on private.order_item_manual_costs from public, anon, authenticated;

-- Preserve the existing total-cost calculation while preferring a per-line
-- manual value in the order currency when one has been recorded.
create or replace function private.seller_legacy_sales_recalculate_order_cost(p_order_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  order_currency public.currency_code;
  order_created_at timestamptz;
  order_rates jsonb;
  cost_in_order_currency numeric;
  cost_brl numeric;
  cost_usd numeric;
  conversion_rate numeric;
begin
  select currency, created_at, exchange_rates_snapshot
    into order_currency, order_created_at, order_rates
    from public.orders where id = p_order_id;
  if not found then return; end if;

  select coalesce(sum(oi.quantity * coalesce(
    manual.unit_cost,
    coalesce(ii.cost, 0) * case
      when ii.currency = order_currency then 1
      when nullif((order_rates->>ii.currency::text)::numeric, 0) is not null
        then 1 / nullif((order_rates->>ii.currency::text)::numeric, 0)
      else coalesce(rate.rate, 0)
    end
  )), 0)
    into cost_in_order_currency
    from public.order_items oi
    left join public.inventory_items ii on ii.id = oi.item_id
    left join private.order_item_manual_costs manual on manual.order_item_id = oi.id
    left join lateral private.seller_legacy_financial_rate_at(
      ii.currency, order_currency, order_created_at
    ) rate on true
    where oi.order_id = p_order_id;

  conversion_rate := nullif((order_rates->>'BRL')::numeric, 0);
  if conversion_rate is null then
    select rate into conversion_rate
      from private.seller_legacy_financial_rate_at(order_currency, 'BRL', order_created_at)
      limit 1;
  end if;
  cost_brl := round(cost_in_order_currency * coalesce(
    conversion_rate, case when order_currency = 'BRL' then 1 else 0 end
  ), 2);

  conversion_rate := nullif((order_rates->>'USD')::numeric, 0);
  if conversion_rate is null then
    select rate into conversion_rate
      from private.seller_legacy_financial_rate_at(order_currency, 'USD', order_created_at)
      limit 1;
  end if;
  cost_usd := round(cost_in_order_currency * coalesce(
    conversion_rate, case when order_currency = 'USD' then 1 else 0 end
  ), 2);

  update public.orders
    set merchandise_cost = round(cost_in_order_currency, 2),
        total_cost_brl = cost_brl,
        total_cost_usd = cost_usd,
        gross_margin = round(total - cost_in_order_currency
          - coalesce(shipping_cost, 0) - coalesce(variable_cost, 0), 2)
    where id = p_order_id;
end;
$$;

create or replace function public.sales_set_order_item_costs(p_order_id uuid, p_costs jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  entry jsonb;
  item_uuid uuid;
  amount numeric;
  actor uuid := auth.uid();
begin
  if actor is null or not exists (
    select 1 from public.user_roles r
    where r.user_id = actor and r.role::text in ('superadmin', 'admin', 'financeiro')
  ) then
    raise exception using errcode = '42501', message = 'Sem permissão para registrar custos.';
  end if;
  if not exists (select 1 from public.orders where id = p_order_id) then
    raise exception 'Pedido não encontrado.';
  end if;
  if jsonb_typeof(p_costs) is distinct from 'array'
     or jsonb_array_length(p_costs) > 200 then
    raise exception 'Lista de custos inválida.';
  end if;
  for entry in select value from jsonb_array_elements(p_costs) as x(value) loop
    item_uuid := (entry->>'item_id')::uuid;
    amount := (entry->>'unit_cost')::numeric;
    if item_uuid is null or amount is null or amount < 0
       or amount >= 1000000000000 or amount = 'NaN'::numeric then
      raise exception 'Custo unitário inválido.';
    end if;
    if (select count(*) from public.order_items
        where order_id = p_order_id and item_id = item_uuid) <> 1 then
      raise exception 'O produto informado deve constar uma única vez no pedido.';
    end if;
    insert into private.order_item_manual_costs
      (order_item_id, unit_cost, updated_by)
      select id, amount, actor
        from public.order_items
        where order_id = p_order_id and item_id = item_uuid
      on conflict (order_item_id) do update
        set unit_cost = excluded.unit_cost,
            updated_at = now(),
            updated_by = excluded.updated_by;
  end loop;
  perform private.seller_legacy_sales_recalculate_order_cost(p_order_id);
end;
$$;
revoke all on function public.sales_set_order_item_costs(uuid, jsonb) from public, anon;
grant execute on function public.sales_set_order_item_costs(uuid, jsonb) to authenticated;

create or replace function public.sales_get_order_item_costs(p_order_ids uuid[])
returns table(order_item_id uuid, unit_cost numeric, is_manual boolean)
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.user_roles r
    where r.user_id = auth.uid() and r.role::text in ('superadmin', 'admin', 'financeiro')
  ) then
    raise exception using errcode = '42501', message = 'Sem permissão para consultar custos.';
  end if;
  if coalesce(array_length(p_order_ids, 1), 0) > 500 then
    raise exception 'Limite de pedidos excedido.';
  end if;
  return query
    select oi.id,
      round(coalesce(manual.unit_cost,
        case when ii.cost is null then null else
          ii.cost * case
            when ii.currency = o.currency then 1
            when nullif((o.exchange_rates_snapshot->>ii.currency::text)::numeric, 0)
              is not null
              then 1 / nullif((o.exchange_rates_snapshot->>ii.currency::text)::numeric, 0)
            else rate.rate
          end
        end), 2),
      (manual.order_item_id is not null)
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    left join public.inventory_items ii on ii.id = oi.item_id
    left join private.order_item_manual_costs manual on manual.order_item_id = oi.id
    left join lateral private.seller_legacy_financial_rate_at(
      ii.currency, o.currency, o.created_at
    ) rate on true
    where oi.order_id = any(p_order_ids);
end;
$$;
revoke all on function public.sales_get_order_item_costs(uuid[]) from public, anon;
grant execute on function public.sales_get_order_item_costs(uuid[]) to authenticated;
