create extension if not exists pgcrypto with schema extensions;
create table if not exists public.integral_system_connections (
  code text primary key check (code ~ '^[a-z][a-z0-9_]{2,48}$'),
  name text not null,
  base_url text not null check (base_url ~ '^https://[^ /?#]+/?$'),
  active boolean not null default true,
  token_hash text,
  token_rotated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.integral_system_connections(code,name,base_url) values
 ('captacao','Captação','https://captacao.qrcodevalidacao.com'),
 ('vendas_estaduais','Vendas Estaduais','https://estadual.qrcodevalidacao.com'),
 ('lideranca_regional','Liderança Regional','https://regional.qrcodevalidacao.com'),
 ('distribuidores_municipais','Distribuidores Municipais','https://municipal.qrcodevalidacao.com'),
 ('estoques','Estoques','https://estoque.qrcodevalidacao.com'),
 ('fornecedores','Fornecedores','https://fornecedor.qrcodevalidacao.com'),
 ('transportes','Transportes','https://transporte.qrcodevalidacao.com')
on conflict(code) do nothing;
alter table public.integral_division_access drop constraint if exists integral_division_access_system_code_check;
alter table public.integral_division_access add constraint integral_division_access_system_code_fkey
 foreign key(system_code) references public.integral_system_connections(code);
alter table public.integral_system_connections enable row level security;
revoke all on public.integral_system_connections from anon, authenticated;
grant select, insert, update on public.integral_system_connections to authenticated;
create policy "admin read system connections" on public.integral_system_connections
 for select to authenticated using (exists(select 1 from public.user_roles where user_id=auth.uid() and role in ('admin','superadmin')));
create policy "admin create system connections" on public.integral_system_connections
 for insert to authenticated with check (exists(select 1 from public.user_roles where user_id=auth.uid() and role in ('admin','superadmin')));
create policy "admin update system connections" on public.integral_system_connections
 for update to authenticated using (exists(select 1 from public.user_roles where user_id=auth.uid() and role in ('admin','superadmin')))
 with check (exists(select 1 from public.user_roles where user_id=auth.uid() and role in ('admin','superadmin')));
revoke select(token_hash),update(token_hash) on public.integral_system_connections from authenticated;
create or replace function public.integral_rotate_connection_token(p_code text)
returns text language plpgsql security definer set search_path=public,extensions,pg_temp
as $$
declare secret text;
begin
  if auth.uid() is null or not exists(select 1 from public.user_roles where user_id=auth.uid() and role in ('admin','superadmin')) then
    raise exception 'Acesso restrito';
  end if;
  secret := 'ic_' || encode(extensions.gen_random_bytes(32),'hex');
  update public.integral_system_connections
     set token_hash=encode(extensions.digest(secret,'sha256'),'hex'), token_rotated_at=now(), updated_at=now()
   where code=p_code;
  if not found then raise exception 'Sistema não encontrado'; end if;
  return secret;
end $$;
revoke all on function public.integral_rotate_connection_token(text) from public,anon;
grant execute on function public.integral_rotate_connection_token(text) to authenticated;
create or replace function public.integral_connection_ping(p_code text,p_token text)
returns boolean language plpgsql security definer set search_path=public,extensions,pg_temp
as $$
begin
  if not exists(select 1 from public.integral_system_connections
    where code=p_code and active and token_hash is not null
      and token_hash=encode(extensions.digest(p_token,'sha256'),'hex')) then
    return false;
  end if;
  insert into public.integral_sync_log(source_code,entity_type,entity_id,status)
    values(p_code,'connection',p_code,'connection_verified')
    on conflict do nothing;
  return true;
end $$;
revoke all on function public.integral_connection_ping(text,text) from public;
grant execute on function public.integral_connection_ping(text,text) to anon,authenticated;
