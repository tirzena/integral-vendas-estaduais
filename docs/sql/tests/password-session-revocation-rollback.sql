BEGIN;
DO $test$
DECLARE u uuid:=gen_random_uuid(); v uuid:=gen_random_uuid(); sid uuid:=gen_random_uuid(); other_sid uuid:=gen_random_uuid();
BEGIN
 INSERT INTO auth.users(id,email,created_at) VALUES(u,'session-test-'||u||'@example.invalid',now()),(v,'session-test-'||v||'@example.invalid',now());
 INSERT INTO auth.sessions(id,user_id,created_at,updated_at) VALUES(sid,u,now(),now()),(other_sid,v,now(),now());
 PERFORM set_config('test.session.user',u::text,true);
 PERFORM set_config('test.session.id',sid::text,true);
 PERFORM set_config('test.session.other',other_sid::text,true);
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','session_id',sid)::text,true);
END $test$;
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
 ASSERT public.integral_my_session_active(), 'Active own session refused';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.session.user'),'role','authenticated','session_id',current_setting('test.session.other'))::text,true);
 ASSERT NOT public.integral_my_session_active(), 'Another user session accepted';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.session.user'),'role','authenticated')::text,true);
 ASSERT NOT public.integral_my_session_active(), 'Missing session accepted';
END $test$;
RESET ROLE;
DELETE FROM auth.sessions WHERE id=current_setting('test.session.id')::uuid;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.session.user'),'role','authenticated','session_id',current_setting('test.session.id'))::text,true);
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
 ASSERT NOT public.integral_my_session_active(), 'Revoked session accepted before token expiry';
END $test$;
RESET ROLE;
DO $test$
BEGIN
 ASSERT NOT has_function_privilege('anon','public.integral_my_session_active()','EXECUTE'),'Anonymous session check exposed';
END $test$;
ROLLBACK;
SELECT 'PASS active own session, cross-account denial, missing session, revoked JWT, anonymous denial; all changes rolled back' AS verification;
