create policy "Admins read integration log" on public.integral_sync_log for select to authenticated using (public.has_role((select auth.uid()), 'admin'::public.app_role));
