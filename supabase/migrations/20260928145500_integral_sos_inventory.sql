create or replace function public.integral_sos_inventory(p_user_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  r record;
  n bigint;
  result jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.user_roles where user_id = auth.uid() and role in ('admin','superadmin')
  ) then raise exception 'Acesso restrito a administradores'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Membro não encontrado';
  end if;
  for r in
    select distinct c.table_name, c.column_name
    from information_schema.table_constraints t
    join information_schema.key_column_usage c
      on c.constraint_schema = t.constraint_schema and c.constraint_name = t.constraint_name
    join information_schema.constraint_column_usage p
      on p.constraint_schema = t.constraint_schema and p.constraint_name = t.constraint_name
    where t.constraint_type = 'FOREIGN KEY' and t.table_schema = 'public'
      and p.table_schema = 'public' and p.table_name = 'profiles'
    order by c.table_name, c.column_name
  loop
    execute format('select count(*) from public.%I where %I = $1', r.table_name, r.column_name)
      into n using p_user_id;
    if n > 0 then
      result := result || jsonb_build_array(jsonb_build_object(
        'table',r.table_name,'column',r.column_name,'count',n
      ));
    end if;
  end loop;
  return result;
end;
$$;
revoke all on function public.integral_sos_inventory(uuid) from public, anon;
grant execute on function public.integral_sos_inventory(uuid) to authenticated;
