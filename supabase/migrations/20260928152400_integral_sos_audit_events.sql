create table if not exists public.integral_sos_events (
 id uuid primary key default gen_random_uuid(),
 actor_id uuid not null references auth.users(id),
 target_id uuid not null references auth.users(id),
 action text not null check(action in ('access_disabled','access_reenabled')),
 created_at timestamptz not null default now()
);
alter table public.integral_sos_events enable row level security;
revoke all on public.integral_sos_events from anon,authenticated;
grant select on public.integral_sos_events to authenticated;
create policy "admin read sos events" on public.integral_sos_events for select to authenticated
 using (exists(select 1 from public.user_roles where user_id=auth.uid() and role in ('admin','superadmin')));
