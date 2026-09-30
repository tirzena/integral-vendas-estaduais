-- Admins e superadmins gerenciam concessões na Direção Geral.
create policy "Admins read division access" on public.integral_division_access for select to authenticated using (public.has_role((select auth.uid()), 'admin'::public.app_role));
create policy "Admins insert division access" on public.integral_division_access for insert to authenticated with check (public.has_role((select auth.uid()), 'admin'::public.app_role));
create policy "Admins update division access" on public.integral_division_access for update to authenticated using (public.has_role((select auth.uid()), 'admin'::public.app_role)) with check (public.has_role((select auth.uid()), 'admin'::public.app_role));
create policy "Admins delete division access" on public.integral_division_access for delete to authenticated using (public.has_role((select auth.uid()), 'admin'::public.app_role));
