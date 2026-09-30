create or replace function public.integral_mark_identity_connected(p_system_code text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_event text;
begin
  if v_user is null or p_system_code not in ('vendas_estaduais','lideranca_regional','distribuidores_municipais','estoques','fornecedores','transportes') then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  if not exists (select 1 from public.profiles where id=v_user and is_active is true) then
    raise exception 'Conta inativa.' using errcode='42501';
  end if;
  if not public.is_admin(v_user) and not exists (
    select 1 from public.integral_division_access a
    where a.user_id=v_user and a.system_code=p_system_code and (a.can_view or a.can_write)
  ) then raise exception 'Acesso não concedido.' using errcode='42501'; end if;
  v_event := 'identity:' || v_user::text || ':' || current_date::text;
  insert into public.integral_sync_log(source_code,external_event_id,entity_type,status)
  values (p_system_code,v_event,'identity','identity_connected')
  on conflict (source_code,external_event_id) do update set updated_at=now();
end $$;
revoke all on function public.integral_mark_identity_connected(text) from public, anon;
grant execute on function public.integral_mark_identity_connected(text) to authenticated;