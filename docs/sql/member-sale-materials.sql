CREATE TABLE IF NOT EXISTS private.member_catalog_create_context(backend_pid integer,transaction_id bigint,actor uuid,PRIMARY KEY(backend_pid,transaction_id,actor));
REVOKE ALL ON private.member_catalog_create_context FROM PUBLIC,anon,authenticated;
ALTER TABLE private.member_catalog_create_context ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION private.seller_write_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF TG_OP='INSERT' AND TG_TABLE_NAME IN ('digital_catalogs','audit_logs') AND EXISTS(SELECT 1 FROM private.member_catalog_create_context c WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.actor=auth.uid()) THEN RETURN NULL; END IF;
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
CREATE OR REPLACE FUNCTION public.integral_member_create_catalog(p_request_id uuid,p_title text,p_layout text,p_item_ids uuid[],p_currency text DEFAULT 'BRL',p_description text DEFAULT null,p_whatsapp text DEFAULT null,p_publish boolean DEFAULT true,p_shared boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); ids uuid[]; result public.digital_catalogs%ROWTYPE; v_slug text;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND is_active) THEN RAISE EXCEPTION 'Cadastro de material não autorizado.' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR coalesce(length(trim(p_title)),0) NOT BETWEEN 2 AND 120 OR p_layout IS NULL OR p_layout NOT IN ('cards','lista') OR p_currency IS NULL OR p_currency NOT IN ('BRL','USD','PYG') OR coalesce(length(p_description),0)>2000 OR coalesce(length(p_whatsapp),0)>30 THEN RAISE EXCEPTION 'Confira título, formato e moeda do material.'; END IF;
 SELECT array_agg(DISTINCT v) INTO ids FROM unnest(p_item_ids) AS item(v);
 IF coalesce(cardinality(ids),0) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Selecione de 1 a 500 produtos.'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(ids) AS requested(item_id) WHERE NOT EXISTS(SELECT 1 FROM public.inventory_items i JOIN public.products p ON p.id=i.product_id WHERE i.id=requested.item_id AND i.is_active AND p.is_active AND p.deleted_at IS NULL AND (public.is_admin(actor) OR private.seller_item_allowed(actor,i.id)))) THEN RAISE EXCEPTION 'Há produto indisponível ou não concedido ao seu perfil.' USING ERRCODE='42501'; END IF;
 v_slug:='material-'||p_request_id::text;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_slug,0));
 SELECT * INTO result FROM public.digital_catalogs c WHERE c.slug=v_slug;
 IF FOUND THEN
  IF result.created_by<>actor THEN RAISE EXCEPTION 'Identificador indisponível.' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('id',result.id,'slug',result.slug,'layout',result.layout);
 END IF;
 INSERT INTO private.member_catalog_create_context VALUES(pg_backend_pid(),txid_current(),actor);
 INSERT INTO public.digital_catalogs(title,slug,description,layout,currency,item_ids,created_by,default_seller_id,is_published,visible_to_all_members,visible_member_ids,pricing_rules,show_prices,orders_enabled,whatsapp,catalog_kind)
 VALUES(trim(p_title),v_slug,nullif(trim(p_description),''),p_layout,p_currency::public.currency_code,ids,actor,CASE WHEN public.is_admin(actor) OR public.has_role(actor,'vendedor') THEN actor ELSE null END,coalesce(p_publish,false),coalesce(p_shared,true),ARRAY[actor],'{"enabled":false,"member_fixed_sale_prices":true}'::jsonb,true,(public.is_admin(actor) OR public.has_role(actor,'vendedor')),nullif(trim(p_whatsapp),''),'selection') RETURNING * INTO result;
 INSERT INTO public.audit_logs(user_id,entity,entity_id,action,details) VALUES(actor,'digital_catalog',result.id,'created',jsonb_build_object('layout',p_layout,'item_ids',ids,'prices','direction_sale_prices'));
 DELETE FROM private.member_catalog_create_context ctx WHERE ctx.backend_pid=pg_backend_pid() AND ctx.transaction_id=txid_current() AND ctx.actor=auth.uid();
 RETURN jsonb_build_object('id',result.id,'slug',result.slug,'layout',result.layout);
END $$;
REVOKE ALL ON FUNCTION public.integral_member_create_catalog(uuid,text,text,uuid[],text,text,text,boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.integral_member_create_catalog(uuid,text,text,uuid[],text,text,text,boolean,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.integral_public_member_catalog_items(p_catalog_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT i.id FROM public.digital_catalogs c JOIN public.profiles owner ON owner.id=c.created_by AND owner.is_active JOIN public.inventory_items i ON i.id=ANY(c.item_ids) JOIN public.products p ON p.id=i.product_id
 WHERE c.id=p_catalog_id AND c.is_published AND c.pricing_rules->>'member_fixed_sale_prices'='true' AND i.is_active AND p.is_active AND p.deleted_at IS NULL AND (public.is_admin(owner.id) OR private.seller_item_allowed(owner.id,i.id));
$$;
REVOKE ALL ON FUNCTION public.integral_public_member_catalog_items(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.integral_public_member_catalog_items(uuid) TO service_role;

DROP FUNCTION IF EXISTS public.integral_member_create_catalog(uuid,text,text,uuid[],text,text,text,boolean);
