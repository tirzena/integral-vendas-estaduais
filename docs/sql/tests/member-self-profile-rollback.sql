BEGIN;
DO $test$
DECLARE u uuid:=gen_random_uuid(); other_u uuid:=gen_random_uuid(); r jsonb;
BEGIN
 INSERT INTO auth.users(id,email,created_at) VALUES(u,'profile-test-'||u||'@example.invalid',now()),(other_u,'profile-test-'||other_u||'@example.invalid',now());
 UPDATE public.profiles SET is_active=true WHERE id IN(u,other_u);
 INSERT INTO public.user_roles(user_id,role) VALUES(u,'vendedor'),(other_u,'vendedor') ON CONFLICT DO NOTHING;
 PERFORM set_config('test.profile.actor',u::text,true);
 PERFORM set_config('test.profile.other',other_u::text,true);
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
END $test$;
SET LOCAL ROLE authenticated;
DO $test$
DECLARE u uuid:=current_setting('test.profile.actor')::uuid; other_u uuid:=current_setting('test.profile.other')::uuid; r jsonb;
BEGIN
 INSERT INTO storage.objects(bucket_id,name) VALUES('profile-avatars',u||'/test.jpg');
 BEGIN
  INSERT INTO storage.objects(bucket_id,name) VALUES('profile-avatars',other_u||'/forbidden.jpg');
  RAISE EXCEPTION 'Other avatar upload accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 r:=public.integral_update_my_profile(jsonb_build_object('full_name','Perfil atualizado','phone','55999999999','avatar_url','storage://profile-avatars/'||u||'/test.jpg'));
 ASSERT r->>'full_name'='Perfil atualizado','Name not saved';
 ASSERT (SELECT phone='55999999999' FROM public.profiles WHERE id=u),'Phone not saved';
 BEGIN
  PERFORM public.integral_update_my_profile('{"is_active":true,"cargo":"superadmin"}');
  RAISE EXCEPTION 'Privilege fields accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Altere apenas os dados pessoais%' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.integral_update_my_profile(jsonb_build_object('avatar_url','storage://profile-avatars/'||other_u||'/other.jpg'));
  RAISE EXCEPTION 'Other avatar assigned';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  UPDATE public.profiles SET full_name='Intrusão' WHERE id=other_u;
  RAISE EXCEPTION 'Direct profile update bypassed guard';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
RESET ROLE;
DO $test$
BEGIN
 ASSERT NOT EXISTS(SELECT 1 FROM private.profile_edit_context),'Profile edit context leaked';
 ASSERT EXISTS(SELECT 1 FROM private.profile_edit_history WHERE user_id=current_setting('test.profile.actor')::uuid),'Self edit missing from history';
 ASSERT NOT has_function_privilege('anon','public.integral_update_my_profile(jsonb)','EXECUTE'),'Anonymous profile RPC';
END $test$;
ROLLBACK;
select 'PASS own profile, private photo, name/phone, authorization and audit; rollback' verification;