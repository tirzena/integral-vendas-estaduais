revoke all on public.integral_system_connections from authenticated;
grant select(code,name,base_url,active,token_rotated_at,created_at,updated_at),
 insert(code,name,base_url,active), update(name,base_url,active)
 on public.integral_system_connections to authenticated;
create or replace function public.integral_connection_ping(p_code text,p_token text)
returns boolean language plpgsql security definer set search_path=public,extensions,pg_temp
as $$
begin
  if not exists(select 1 from public.integral_system_connections
    where code=p_code and active and token_hash is not null
      and token_hash=encode(extensions.digest(p_token,'sha256'),'hex')) then
    return false;
  end if;
  insert into public.integral_sync_log(source_code,external_event_id,entity_type,status)
    values(p_code,'connection:'||p_code,'connection','connection_verified')
    on conflict (source_code,external_event_id) do update set status='connection_verified',updated_at=now();
  return true;
end $$;
