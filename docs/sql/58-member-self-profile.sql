CREATE TABLE IF NOT EXISTS private.profile_edit_context(
 backend_pid integer NOT NULL,transaction_id bigint NOT NULL,actor uuid NOT NULL,
 PRIMARY KEY(backend_pid,transaction_id,actor));
ALTER TABLE private.profile_edit_context ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.profile_edit_context FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS private.profile_edit_history(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES public.profiles(id),
 actor uuid NOT NULL REFERENCES public.profiles(id),previous_snapshot jsonb NOT NULL,new_snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE private.profile_edit_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.profile_edit_history FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.seller_write_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF TG_TABLE_NAME='profiles' AND TG_OP='UPDATE' AND EXISTS(
 SELECT 1 FROM private.profile_edit_context c WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.actor=auth.uid())
 THEN RETURN NULL; END IF;
 IF NOT private.seller_is_restricted(auth.uid()) THEN RETURN NULL; END IF;
 IF TG_TABLE_NAME IN ('bonus_awards','payroll_entries') AND TG_OP='INSERT' AND private.remuneration_can_review(auth.uid()) AND EXISTS(SELECT 1 FROM private.remuneration_action_context c WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.actor=auth.uid() AND c.mode IN ('approve','calculate','payment')) THEN RETURN NULL; END IF;
 IF TG_TABLE_NAME='notifications' AND TG_OP='INSERT' AND EXISTS(SELECT 1 FROM private.remuneration_action_context c WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.actor=auth.uid() AND c.mode IN ('approve','calculate','close','payment','replace')) THEN RETURN NULL; END IF;
 IF TG_TABLE_NAME='customers' AND TG_OP='INSERT' AND EXISTS (
   SELECT 1 FROM private.seller_creation_context c
   WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current()
     AND c.actor=auth.uid() AND c.operation='create_sale'
 ) THEN RETURN NULL; END IF;
 IF TG_TABLE_NAME IN ('delivery_tracking_sessions','tracking_view_sessions') AND TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM private.seller_creation_context c WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.actor=auth.uid() AND c.operation='edit_order') THEN RETURN NULL; END IF;
 IF TG_TABLE_NAME IN ('customers','customer_products') AND TG_OP IN ('INSERT','UPDATE') AND EXISTS(SELECT 1 FROM private.seller_creation_context c WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.actor=auth.uid() AND c.operation='crm_write') THEN RETURN NULL; END IF;
 IF TG_OP='TRUNCATE' OR NOT private.seller_in_creation() OR TG_TABLE_NAME NOT IN (
  'orders','order_items','payments','order_payment_proofs','order_audit_log',
  'inventory_items','warehouse_inventory','inventory_movements','stock_lot_balances',
  'stock_lot_receipts','stock_lot_movements','purchase_orders','purchase_order_items',
  'purchase_payments','accounts_payable','accounts_receivable','document_counters'
 ) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Seller cannot edit data.'; END IF;
 RETURN NULL;
END $function$
;
CREATE OR REPLACE FUNCTION public.integral_update_my_profile(p_profile jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$
#variable_conflict use_variable
DECLARE actor uuid:=auth.uid(); current_profile public.profiles; n text; ph text; avatar text; previous jsonb; result jsonb;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND is_active) THEN RAISE EXCEPTION 'Entre em uma conta ativa para editar seu perfil.' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_profile) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_profile) k WHERE k NOT IN('full_name','phone','avatar_url')) THEN RAISE EXCEPTION 'Altere apenas os dados pessoais do seu perfil.'; END IF;
 SELECT * INTO current_profile FROM public.profiles WHERE id=actor FOR UPDATE;
 n:=CASE WHEN p_profile ? 'full_name' THEN btrim(p_profile->>'full_name') ELSE current_profile.full_name END;
 ph:=CASE WHEN p_profile ? 'phone' THEN nullif(btrim(p_profile->>'phone'),'') ELSE current_profile.phone END;
 avatar:=CASE WHEN p_profile ? 'avatar_url' THEN nullif(btrim(p_profile->>'avatar_url'),'') ELSE current_profile.avatar_url END;
 IF n IS NULL OR length(n) NOT BETWEEN 1 AND 150 OR n ~ '[[:cntrl:]]' OR length(coalesce(ph,''))>40 THEN RAISE EXCEPTION 'Confira seu nome e telefone.'; END IF;
 IF avatar IS DISTINCT FROM current_profile.avatar_url AND avatar IS NOT NULL THEN
  IF avatar NOT LIKE 'storage://profile-avatars/'||actor::text||'/%' OR length(avatar)>500
  OR NOT EXISTS(SELECT 1 FROM storage.objects s WHERE s.bucket_id='profile-avatars' AND s.name=substr(avatar,length('storage://profile-avatars/')+1))
  THEN RAISE EXCEPTION 'Envie uma foto para o seu próprio perfil.' USING ERRCODE='42501'; END IF;
 END IF;
 previous:=jsonb_build_object('full_name',current_profile.full_name,'phone',current_profile.phone,'avatar_url',current_profile.avatar_url);
 INSERT INTO private.profile_edit_context VALUES(pg_backend_pid(),txid_current(),actor);
 UPDATE public.profiles SET full_name=n,phone=ph,avatar_url=avatar WHERE id=actor;
 DELETE FROM private.profile_edit_context c WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.actor=actor;
 result:=jsonb_build_object('full_name',n,'phone',ph,'avatar_url',avatar);
 IF previous IS DISTINCT FROM result THEN INSERT INTO private.profile_edit_history(user_id,actor,previous_snapshot,new_snapshot) VALUES(actor,actor,previous,result); END IF;
 RETURN result;
END $body$;
REVOKE ALL ON FUNCTION public.integral_update_my_profile(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.integral_update_my_profile(jsonb) TO authenticated;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('profile-avatars','profile-avatars',false,5242880,ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT(id) DO NOTHING;
CREATE POLICY profile_avatar_read ON storage.objects FOR SELECT TO authenticated
 USING(bucket_id='profile-avatars' AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.is_active));
CREATE POLICY profile_avatar_upload ON storage.objects FOR INSERT TO authenticated
 WITH CHECK(bucket_id='profile-avatars' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.is_active));
CREATE POLICY profile_avatar_delete ON storage.objects FOR DELETE TO authenticated
 USING(bucket_id='profile-avatars' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text);
CREATE POLICY profile_avatar_upload_owner_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK(bucket_id<>'profile-avatars' OR ((storage.foldername(name))[1]=(SELECT auth.uid())::text AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.is_active)));
CREATE POLICY profile_avatar_update_owner_guard ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(bucket_id<>'profile-avatars' OR (storage.foldername(name))[1]=(SELECT auth.uid())::text)
 WITH CHECK(bucket_id<>'profile-avatars' OR (storage.foldername(name))[1]=(SELECT auth.uid())::text);
CREATE POLICY profile_avatar_delete_owner_guard ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
 USING(bucket_id<>'profile-avatars' OR (storage.foldername(name))[1]=(SELECT auth.uid())::text);
CREATE POLICY profile_avatar_read_active_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
 USING(bucket_id<>'profile-avatars' OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.is_active));

CREATE OR REPLACE FUNCTION private.profile_in_edit()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $body$
 SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM private.profile_edit_context c WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.actor=auth.uid());
$body$;
REVOKE ALL ON FUNCTION private.profile_in_edit() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.profile_in_edit() TO authenticated;
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $body$
BEGIN
 IF private.seller_is_restricted(auth.uid()) AND NOT private.seller_in_creation()
 AND NOT(TG_TABLE_NAME='profiles' AND private.profile_in_edit())
 THEN RAISE EXCEPTION 'Seller writes are restricted to atomic creation.' USING ERRCODE='42501'; END IF;
 NEW.updated_at:=now();
 RETURN NEW;
END $body$;