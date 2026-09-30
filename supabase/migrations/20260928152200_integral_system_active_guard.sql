create or replace function public.integral_is_system_active(p_code text)
returns boolean language sql stable security definer set search_path=public,pg_temp
as $$
 select auth.uid() is not null and exists(select 1 from public.integral_system_connections where code=p_code and active);
$$;
revoke all on function public.integral_is_system_active(text) from public,anon;
grant execute on function public.integral_is_system_active(text) to authenticated;
