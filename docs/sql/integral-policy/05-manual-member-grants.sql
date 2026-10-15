CREATE FUNCTION public.integral_update_member_grants(p_user uuid,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE actor uuid:=auth.uid(); pid uuid; wid uuid; excluded_categories uuid[]; excluded_items uuid[];
BEGIN
 IF actor IS NULL OR NOT public.is_admin(actor) OR NOT private.integral_operation_allowed(actor,'members.manage') THEN RAISE EXCEPTION 'Administrador não autorizado.' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user) THEN RAISE EXCEPTION 'Membro não encontrado.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=actor AND role='superadmin') AND
 EXISTS(SELECT 1 FROM public.product_users target WHERE target.user_id=p_user AND NOT EXISTS(SELECT 1 FROM public.product_users own WHERE own.user_id=actor AND own.product_id=target.product_id)) THEN RAISE EXCEPTION 'Membro possui concessões fora do seu limite administrativo.'; END IF;
 excluded_categories:=ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(coalesce(p_payload->'excluded_category_ids','[]')));
 excluded_items:=ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(coalesce(p_payload->'excluded_item_ids','[]')));
 PERFORM 1 FROM public.profiles WHERE id=p_user FOR UPDATE;
 FOR pid IN SELECT value::uuid FROM jsonb_array_elements_text(p_payload->'product_ids') LOOP
 IF NOT EXISTS(SELECT 1 FROM public.products WHERE id=pid AND deleted_at IS NULL AND is_active) OR
 (NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=actor AND role='superadmin') AND NOT EXISTS(SELECT 1 FROM public.product_users WHERE user_id=actor AND product_id=pid)) THEN RAISE EXCEPTION 'Categoria não autorizada.'; END IF;
 END LOOP;
 FOR wid IN SELECT value::uuid FROM jsonb_array_elements_text(p_payload->'warehouse_ids') LOOP
 IF NOT EXISTS(SELECT 1 FROM public.warehouses WHERE id=wid AND is_active) OR
 (NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=actor AND role='superadmin') AND NOT EXISTS(SELECT 1 FROM public.warehouse_user_assignments WHERE user_id=actor AND warehouse_id=wid)) THEN RAISE EXCEPTION 'Estoque não autorizado.'; END IF;
 END LOOP;
 INSERT INTO public.audit_logs(user_id,entity,entity_id,action,details) VALUES(actor,'member_grants',p_user,'updated',jsonb_build_object('previous_products',(SELECT jsonb_agg(product_id) FROM public.product_users WHERE user_id=p_user),'proposed',p_payload));
 DELETE FROM public.inventory_item_users WHERE user_id=p_user;
 DELETE FROM public.product_category_users WHERE user_id=p_user;
 DELETE FROM public.product_users WHERE user_id=p_user;
 DELETE FROM public.warehouse_user_assignments WHERE user_id=p_user;
 INSERT INTO public.integral_member_rules(user_id,excluded_category_ids,excluded_item_ids,inherit_new_products,permission_overrides,updated_by)
 VALUES(p_user,excluded_categories,excluded_items,coalesce((p_payload->>'inherit_new_products')::boolean,true),coalesce(p_payload->'permission_overrides','{}'),actor)
 ON CONFLICT(user_id) DO UPDATE SET excluded_category_ids=excluded.excluded_category_ids,excluded_item_ids=excluded.excluded_item_ids,inherit_new_products=excluded.inherit_new_products,permission_overrides=excluded.permission_overrides,updated_by=actor,updated_at=now();
 FOR pid IN SELECT value::uuid FROM jsonb_array_elements_text(p_payload->'product_ids') LOOP
 INSERT INTO public.product_users(user_id,product_id) VALUES(p_user,pid);
 INSERT INTO public.product_category_users(user_id,category_id,created_by) SELECT p_user,id,actor FROM public.product_categories WHERE product_id=pid AND NOT(id=ANY(excluded_categories));
 INSERT INTO public.inventory_item_users(user_id,item_id,created_by) SELECT p_user,id,actor FROM public.inventory_items WHERE product_id=pid AND is_active AND NOT(id=ANY(excluded_items)) AND (category_id IS NULL OR NOT(category_id=ANY(excluded_categories)));
 FOR wid IN SELECT value::uuid FROM jsonb_array_elements_text(p_payload->'warehouse_ids') LOOP
 INSERT INTO public.warehouse_user_assignments(user_id,product_id,warehouse_id,created_by) VALUES(p_user,pid,wid,actor);
 END LOOP;
 END LOOP;
 RETURN jsonb_build_object('id',p_user,'saved',true);
END $$;
REVOKE ALL ON FUNCTION public.integral_update_member_grants(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.integral_update_member_grants(uuid,jsonb) TO authenticated;
