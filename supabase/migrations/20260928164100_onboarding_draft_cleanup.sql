grant delete on public.onboarding_materials to authenticated;
create policy "admins remove draft onboarding" on public.onboarding_materials for delete to authenticated
 using(public.is_admin(auth.uid()) and status='draft');
create policy "admins remove onboarding files" on storage.objects for delete to authenticated
 using(bucket_id='onboarding-documents' and public.is_admin(auth.uid()));
