-- Cancelled orders remain active until superseded; their numbers cannot be reused.
create or replace function private.seller_legacy_sales_next_number(p_scope text)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare next_number integer;
begin
  if p_scope = 'orders' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('sales_next_number:' || p_scope));
    select coalesce(max(number), 0) + 1 into next_number
    from public.orders
    where deleted_at is null and superseded_at is null;
    insert into public.document_counters(scope, last_number, updated_at)
    values (p_scope, next_number, now())
    on conflict (scope) do update
      set last_number = excluded.last_number, updated_at = now();
    return next_number;
  end if;
  insert into public.document_counters(scope, last_number, updated_at)
  values (p_scope, 1, now())
  on conflict (scope) do update
    set last_number = public.document_counters.last_number + 1, updated_at = now()
  returning last_number into next_number;
  return next_number;
end;
$$;
