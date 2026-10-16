
CREATE TABLE IF NOT EXISTS private.chat_action_context(backend_pid integer NOT NULL, transaction_id bigint NOT NULL, actor uuid NOT NULL, PRIMARY KEY(backend_pid,transaction_id,actor));
REVOKE ALL ON private.chat_action_context FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.seller_write_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF TG_TABLE_NAME IN ('internal_conversations','internal_conversation_members','internal_messages') AND TG_OP IN ('INSERT','UPDATE') AND EXISTS(SELECT 1 FROM private.chat_action_context c WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.actor=auth.uid()) THEN RETURN NULL; END IF;
 IF TG_TABLE_NAME='profiles' AND TG_OP='UPDATE' AND EXISTS(
 SELECT 1 FROM private.profile_edit_context c WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.actor=auth.uid())
 THEN RETURN NULL; END IF;
 IF TG_TABLE_NAME='order_cancellation_requests' AND TG_OP='INSERT' AND EXISTS(
 SELECT 1 FROM private.seller_creation_context c WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.actor=auth.uid() AND c.operation='edit_order')
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
CREATE OR REPLACE FUNCTION public.integral_chat(p_action text,p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); conv uuid; msg uuid; ids uuid[]; result jsonb; kind text; title text; body text; attachment text;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND is_active) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Acesso indisponível.'; END IF;
 IF p_action='directory' THEN
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',coalesce(nullif(full_name,''),'Membro'),'is_active',true) ORDER BY full_name) FROM public.profiles WHERE is_active),'[]'::jsonb);
 END IF;
 IF p_action='list' THEN
  RETURN coalesce((SELECT jsonb_agg(v ORDER BY v->>'updated_at' DESC) FROM (
    SELECT jsonb_build_object('id',c.id,'name',c.name,'conversation_type',c.conversation_type,'updated_at',coalesce(last_msg.created_at,c.updated_at),
     'members',(SELECT jsonb_agg(m.user_id) FROM public.internal_conversation_members m WHERE m.conversation_id=c.id),
     'last',to_jsonb(last_msg)) v
    FROM public.internal_conversations c
    LEFT JOIN LATERAL (SELECT lm.body,lm.created_at,lm.sender_id,lm.deleted_at FROM public.internal_messages lm WHERE lm.conversation_id=c.id ORDER BY lm.created_at DESC,lm.id DESC LIMIT 1) last_msg ON true
    WHERE public.is_conversation_member(c.id,actor)
  ) listed),'[]'::jsonb);
 END IF;
 IF p_action='create' THEN
  kind:=p_payload->>'type'; title:=trim(p_payload->>'name');
  SELECT array_agg(DISTINCT value::uuid) INTO ids FROM jsonb_array_elements_text(coalesce(p_payload->'members','[]'::jsonb));
  ids:=array(SELECT DISTINCT unnest(coalesce(ids,'{}'::uuid[])||ARRAY[actor]));
  IF kind NOT IN ('direta','grupo') OR kind IS NULL OR cardinality(ids)<2 OR cardinality(ids)>200 OR (kind='direta' AND cardinality(ids)<>2) OR (kind='grupo' AND (coalesce(title,'')='' OR length(title)>120)) THEN RAISE EXCEPTION 'Informe os participantes e o nome do grupo.'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(ids) AS requested(member_id) WHERE NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=requested.member_id AND p.is_active)) THEN RAISE EXCEPTION 'Participante indisponível.'; END IF;
  IF kind='direta' THEN
   PERFORM pg_advisory_xact_lock(hashtextextended(array_to_string(array(SELECT unnest(ids) ORDER BY 1),','),0));
   SELECT c.id INTO conv FROM public.internal_conversations c WHERE c.conversation_type='direta' AND public.is_conversation_member(c.id,ids[1]) AND public.is_conversation_member(c.id,ids[2]) AND (SELECT count(*) FROM public.internal_conversation_members WHERE conversation_id=c.id)=2 ORDER BY c.created_at LIMIT 1;
   IF conv IS NOT NULL THEN RETURN to_jsonb(conv); END IF;
  END IF;
  INSERT INTO private.chat_action_context VALUES(pg_backend_pid(),txid_current(),actor) ON CONFLICT DO NOTHING;
  INSERT INTO public.internal_conversations(name,conversation_type,created_by) VALUES(CASE WHEN kind='grupo' THEN title ELSE null END,kind,actor) RETURNING id INTO conv;
  INSERT INTO public.internal_conversation_members(conversation_id,user_id) SELECT conv,unnest(ids);
 ELSIF p_action IN ('messages','send','delete') THEN
  IF p_action='delete' THEN
   msg:=(p_payload->>'id')::uuid;
   SELECT conversation_id INTO conv FROM public.internal_messages WHERE id=msg AND sender_id=actor;
  ELSE conv:=(p_payload->>'conversation_id')::uuid; END IF;
  IF conv IS NULL OR NOT public.is_conversation_member(conv,actor) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Conversa não autorizada.'; END IF;
  IF p_action='messages' THEN
   RETURN coalesce((SELECT jsonb_agg(to_jsonb(m)||jsonb_build_object('profiles',jsonb_build_object('full_name',p.full_name)) ORDER BY m.created_at,m.id) FROM (SELECT * FROM public.internal_messages WHERE conversation_id=conv ORDER BY created_at DESC,id DESC LIMIT 500) m LEFT JOIN public.profiles p ON p.id=m.sender_id),'[]'::jsonb);
  END IF;
  INSERT INTO private.chat_action_context VALUES(pg_backend_pid(),txid_current(),actor) ON CONFLICT DO NOTHING;
  IF p_action='delete' THEN
   UPDATE public.internal_messages SET deleted_at=now(),body=null,attachment_url=null,attachment_name=null,attachment_type=null WHERE id=msg AND sender_id=actor;
  ELSE
   body:=nullif(trim(p_payload->>'body'),''); attachment:=nullif(p_payload->>'attachment_url','');
   IF (body IS NULL AND attachment IS NULL) OR length(body)>20000 THEN RAISE EXCEPTION 'Mensagem inválida.'; END IF;
   IF attachment IS NOT NULL AND (split_part(attachment,'/',1)<>actor::text OR split_part(attachment,'/',2)<>conv::text OR attachment LIKE '%..%') THEN RAISE EXCEPTION 'Anexo inválido.'; END IF;
   IF nullif(p_payload->>'reply_to','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.internal_messages WHERE id=(p_payload->>'reply_to')::uuid AND conversation_id=conv) THEN RAISE EXCEPTION 'Resposta inválida.'; END IF;
   INSERT INTO public.internal_messages(conversation_id,sender_id,body,reply_to,attachment_url,attachment_type,attachment_name)
   VALUES(conv,actor,body,nullif(p_payload->>'reply_to','')::uuid,attachment,p_payload->>'attachment_type',left(p_payload->>'attachment_name',255)) RETURNING id INTO msg;
  END IF;
 ELSE RAISE EXCEPTION 'Ação inválida.'; END IF;
 DELETE FROM private.chat_action_context ctx WHERE ctx.backend_pid=pg_backend_pid() AND ctx.transaction_id=txid_current() AND ctx.actor=auth.uid();
 RETURN to_jsonb(coalesce(msg,conv));
END $$;
REVOKE ALL ON FUNCTION public.integral_chat(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.integral_chat(text,jsonb) TO authenticated;
