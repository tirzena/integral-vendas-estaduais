-- Only the caller's current session is inspected. No session identifiers are exposed.
create or replace function public.integral_my_session_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from auth.sessions s
    where s.id = nullif(auth.jwt()->>'session_id', '')::uuid
      and s.user_id = auth.uid()
      and (s.not_after is null or s.not_after > now())
  );
$$;
revoke all on function public.integral_my_session_active() from public, anon;
grant execute on function public.integral_my_session_active() to authenticated;
comment on function public.integral_my_session_active() is
'Checks only the authenticated caller session; detects password-change and logout revocation before JWT expiry.';
