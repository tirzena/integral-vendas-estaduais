insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('onboarding-documents','onboarding-documents',false,20971520,
array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.oasis.opendocument.text'])
on conflict(id) do nothing;

create table if not exists public.onboarding_materials (
 id uuid primary key default gen_random_uuid(),
 title text not null check(length(trim(title)) between 3 and 160),
 description text not null default '' check(length(description)<=1000),
 audience text not null check(audience in ('cliente','prestador')),
 status text not null default 'draft' check(status in ('draft','published')),
 file_name text not null,
 storage_path text not null unique,
 mime_type text not null check(mime_type in ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.oasis.opendocument.text')),
 file_size bigint not null check(file_size>0 and file_size<=20971520),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 published_at timestamptz,
 constraint onboarding_path_audience check(storage_path like audience || '/%')
);
alter table public.onboarding_materials enable row level security;
revoke all on public.onboarding_materials from anon,authenticated;
grant select on public.onboarding_materials to anon;
grant select,insert,update(status,published_at,description,title) on public.onboarding_materials to authenticated;
create policy "public client manuals" on public.onboarding_materials for select to anon
 using(audience='cliente' and status='published');
create policy "member onboarding read" on public.onboarding_materials for select to authenticated
 using(
   (audience='cliente' and status='published')
   or
   (exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_active is true)
    and (public.is_admin(auth.uid())
      or (audience='prestador' and status='published' and
         (exists(select 1 from public.user_roles r where r.user_id=auth.uid() and r.role in ('fornecedor','entregador','estoque'))
          or exists(select 1 from public.integral_division_access a where a.user_id=auth.uid() and a.system_code in ('fornecedores','transportes','estoques') and a.can_view is true)))))
 );
create policy "admins add onboarding" on public.onboarding_materials for insert to authenticated
 with check(public.is_admin(auth.uid()) and created_by=auth.uid() and status='draft' and published_at is null);
create policy "admins edit onboarding" on public.onboarding_materials for update to authenticated
 using(public.is_admin(auth.uid()))
 with check(public.is_admin(auth.uid()));
create policy "onboarding files published or admin" on storage.objects for select to anon,authenticated
 using(bucket_id='onboarding-documents' and
   exists(select 1 from public.onboarding_materials m where m.storage_path=name and
     ((m.audience='cliente' and m.status='published')
      or (auth.uid() is not null and exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_active is true)
          and (public.is_admin(auth.uid()) or
            (m.audience='prestador' and m.status='published' and
              (exists(select 1 from public.user_roles r where r.user_id=auth.uid() and r.role in ('fornecedor','entregador','estoque'))
               or exists(select 1 from public.integral_division_access a where a.user_id=auth.uid() and a.system_code in ('fornecedores','transportes','estoques') and a.can_view is true))))))));
create policy "admins upload onboarding" on storage.objects for insert to authenticated
 with check(bucket_id='onboarding-documents' and public.is_admin(auth.uid())
   and (storage.foldername(name))[1] in ('cliente','prestador'));

