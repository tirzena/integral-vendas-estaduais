CREATE OR REPLACE FUNCTION public.integral_configure_new_member(p_actor uuid, p_user uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v jsonb; pid uuid; cid uuid; iid uuid; job uuid; lvl uuid; rule jsonb; wid uuid;
BEGIN
 -- Execute privileges are restricted to service_role; caller identity is checked below.
 IF NOT public.is_admin(p_actor) OR NOT private.integral_operation_allowed(p_actor,'members.manage') THEN RAISE EXCEPTION 'Administrador não autorizado.' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user AND created_at>now()-interval '5 minutes') OR EXISTS(SELECT 1 FROM public.integral_member_rules WHERE user_id=p_user) THEN RAISE EXCEPTION 'Cadastro já configurado ou conta ausente.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_payload->'roles')) THEN RAISE EXCEPTION 'Selecione um cargo.'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_payload->'roles') r WHERE r='superadmin')
 AND NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_actor AND role='superadmin') THEN RAISE EXCEPTION 'Somente superadmin pode conceder superadmin.'; END IF;
 IF p_payload ? 'general_access' AND jsonb_typeof(p_payload->'general_access')<>'boolean' THEN RAISE EXCEPTION 'Acesso à Direção Geral inválido.'; END IF;
 IF (NOT p_payload ? 'general_access' OR coalesce((p_payload->>'general_access')::boolean,false)) AND NOT private.integral_general_access_for(p_actor) THEN RAISE EXCEPTION 'Direção Geral fora dos limites administrativos.' USING ERRCODE='42501'; END IF;
 INSERT INTO public.profiles(id,full_name,email,phone,cargo,setor,is_active)
 VALUES(p_user,p_payload->>'full_name',p_payload->>'email',nullif(p_payload->>'phone',''),nullif(p_payload->>'cargo',''),nullif(p_payload->>'setor',''),true)
 ON CONFLICT(id) DO UPDATE SET full_name=excluded.full_name,email=excluded.email,phone=excluded.phone,cargo=excluded.cargo,setor=excluded.setor;
 DELETE FROM public.user_roles WHERE user_id=p_user;
 INSERT INTO public.user_roles(user_id,role) SELECT p_user,value::public.app_role FROM jsonb_array_elements_text(p_payload->'roles');
 FOR v IN SELECT value FROM jsonb_array_elements(coalesce(p_payload->'jobs','[]')) LOOP
 job:=(v->>'job_role_id')::uuid;lvl:=nullif(v->>'job_level_id','')::uuid;
 IF NOT EXISTS(SELECT 1 FROM public.job_roles WHERE id=job AND active) THEN RAISE EXCEPTION 'Cargo inválido.'; END IF;
 IF lvl IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.job_levels WHERE id=lvl) THEN RAISE EXCEPTION 'Nível inválido.'; END IF;
 INSERT INTO public.member_job_assignments(user_id,job_role_id,job_level_id,created_by) VALUES(p_user,job,lvl,p_actor);
 END LOOP;
 FOR v IN SELECT value FROM jsonb_array_elements(coalesce(p_payload->'access','[]')) LOOP
 IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_actor AND role='superadmin') AND
 NOT EXISTS(SELECT 1 FROM public.integral_division_access a WHERE a.user_id=p_actor AND a.system_code=v->>'system_code' AND a.can_write
 AND (a.region_code IS NULL OR a.region_code=v->>'region_code') AND (a.territory_uf IS NULL OR a.territory_uf=v->>'territory_uf')) THEN
 RAISE EXCEPTION 'O acesso concedido excede os limites administrativos.'; END IF;
 INSERT INTO public.integral_division_access(user_id,system_code,region_code,territory_uf,own_records_only,can_view,can_write)
 VALUES(p_user,v->>'system_code',nullif(v->>'region_code',''),nullif(v->>'territory_uf',''),coalesce((v->>'own_records_only')::boolean,true),true,coalesce((v->>'can_write')::boolean,false));
 END LOOP;
 INSERT INTO public.integral_member_rules(user_id,general_access,excluded_category_ids,excluded_item_ids,permission_overrides,updated_by)
 VALUES(p_user,(p_payload->>'general_access')::boolean,ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(coalesce(p_payload->'excluded_category_ids','[]'))),
 ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(coalesce(p_payload->'excluded_item_ids','[]'))),coalesce(p_payload->'permission_overrides','{}'),p_actor);
 FOR pid IN SELECT value::uuid FROM jsonb_array_elements_text(coalesce(p_payload->'product_ids','[]')) LOOP
 IF NOT EXISTS(SELECT 1 FROM public.products WHERE id=pid AND is_active AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Categoria inválida.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_actor AND role='superadmin') AND NOT EXISTS(SELECT 1 FROM public.product_users WHERE user_id=p_actor AND product_id=pid) THEN RAISE EXCEPTION 'Categoria fora da concessão administrativa.'; END IF;
 INSERT INTO public.product_users(user_id,product_id) VALUES(p_user,pid);
 INSERT INTO public.product_category_users(user_id,category_id,created_by) SELECT p_user,c.id,p_actor FROM public.product_categories c
 WHERE c.product_id=pid AND NOT(c.id=ANY(ARRAY(SELECT unnest(excluded_category_ids) FROM public.integral_member_rules WHERE user_id=p_user)));
 INSERT INTO public.inventory_item_users(user_id,item_id,created_by) SELECT p_user,i.id,p_actor FROM public.inventory_items i
 WHERE i.product_id=pid AND i.is_active AND NOT(i.id=ANY(ARRAY(SELECT unnest(excluded_item_ids) FROM public.integral_member_rules WHERE user_id=p_user)))
 AND (i.category_id IS NULL OR NOT(i.category_id=ANY(ARRAY(SELECT unnest(excluded_category_ids) FROM public.integral_member_rules WHERE user_id=p_user))));
 END LOOP;
 FOR wid IN SELECT value::uuid FROM jsonb_array_elements_text(coalesce(p_payload->'warehouse_ids','[]')) LOOP
 IF NOT EXISTS(SELECT 1 FROM public.warehouses WHERE warehouses.id=wid AND is_active) THEN RAISE EXCEPTION 'Estoque inválido.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_actor AND role='superadmin') AND NOT EXISTS(SELECT 1 FROM public.warehouse_user_assignments w WHERE w.user_id=p_actor AND w.warehouse_id=wid) THEN RAISE EXCEPTION 'Estoque fora da concessão administrativa.'; END IF;
 INSERT INTO public.warehouse_user_assignments(user_id,warehouse_id,product_id,created_by) SELECT p_user,wid,value::uuid,p_actor FROM jsonb_array_elements_text(coalesce(p_payload->'product_ids','[]'));
 END LOOP;
 FOR v IN SELECT value FROM jsonb_array_elements(coalesce(p_payload->'deals','[]')) LOOP
 IF (v->>'amount')::numeric<=0 OR ((v->>'comp_type')='percent' AND (v->>'amount')::numeric>100) THEN RAISE EXCEPTION 'Remuneração inválida.'; END IF;
 iid:=nullif(v->>'item_id','')::uuid;
 IF iid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.inventory_item_users WHERE user_id=p_user AND item_id=iid) THEN RAISE EXCEPTION 'Produto do acordo não concedido ao membro.'; END IF;
 INSERT INTO public.member_compensations(user_id,label,product_id,category_id,item_id,notes,comp_type,amount,currency,period,active)
 VALUES(p_user,nullif(v->>'label',''),nullif(v->>'product_id','')::uuid,nullif(v->>'category_id','')::uuid,iid,nullif(v->>'notes',''),v->>'comp_type',(v->>'amount')::numeric,(v->>'currency')::public.currency_code,v->>'period',true);
 END LOOP;
 INSERT INTO public.audit_logs(user_id,entity,entity_id,action,details) VALUES(p_actor,'member',p_user,'created',jsonb_build_object('transactional',true,'roles',p_payload->'roles'));
 RETURN jsonb_build_object('id',p_user);
END $function$
;
CREATE OR REPLACE FUNCTION private.integral_validate_compensation_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE p uuid; c uuid;
BEGIN
 IF NEW.comp_type IS NULL OR NEW.period IS NULL OR NEW.amount IS NULL OR NEW.amount<=0 OR NEW.amount::text IN ('NaN','Infinity','-Infinity')
 OR NEW.comp_type NOT IN ('percent','fixed') OR NEW.period NOT IN ('per_sale','day','week','month')
 OR (NEW.comp_type='percent' AND NEW.amount>100) THEN RAISE EXCEPTION 'Valor, percentual ou periodicidade inválidos.'; END IF;
 IF NEW.item_id IS NOT NULL THEN
 SELECT product_id,category_id INTO p,c FROM public.inventory_items WHERE id=NEW.item_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Produto do acordo não encontrado.'; END IF;
 IF NEW.product_id IS NOT NULL AND NEW.product_id IS DISTINCT FROM p THEN RAISE EXCEPTION 'Produto fora da categoria do acordo.'; END IF;
 IF NEW.category_id IS NOT NULL AND NEW.category_id IS DISTINCT FROM c THEN RAISE EXCEPTION 'Produto fora da subcategoria do acordo.'; END IF;
 NEW.product_id:=p; NEW.category_id:=c;
 ELSIF NEW.category_id IS NOT NULL THEN
 SELECT product_id INTO p FROM public.product_categories WHERE id=NEW.category_id;
 IF NOT FOUND OR (NEW.product_id IS NOT NULL AND NEW.product_id IS DISTINCT FROM p) THEN RAISE EXCEPTION 'Subcategoria fora da categoria do acordo.'; END IF;
 NEW.product_id:=p;
 END IF;
 RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION public.integral_update_member_grants(p_user uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_variable
DECLARE actor uuid:=auth.uid(); pid uuid; wid uuid; excluded_categories uuid[]; excluded_items uuid[];
BEGIN
 IF actor IS NULL OR NOT public.is_admin(actor) OR NOT private.integral_operation_allowed(actor,'members.manage') THEN RAISE EXCEPTION 'Administrador não autorizado.' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_user AND role='superadmin') AND NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=actor AND role='superadmin') THEN RAISE EXCEPTION 'Somente superadmin pode alterar esse membro.' USING ERRCODE='42501'; END IF;
 IF p_payload ? 'general_access' AND jsonb_typeof(p_payload->'general_access') NOT IN ('boolean','null') THEN RAISE EXCEPTION 'Acesso à Direção Geral inválido.'; END IF;
 IF coalesce((p_payload->>'general_access')::boolean,false) AND NOT private.integral_general_access_for(actor) THEN RAISE EXCEPTION 'Direção Geral fora dos limites administrativos.' USING ERRCODE='42501'; END IF;
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
 IF p_payload ? 'general_access' AND jsonb_typeof(p_payload->'general_access')='boolean' THEN UPDATE public.integral_member_rules SET general_access=(p_payload->>'general_access')::boolean WHERE user_id=p_user; END IF;
 RETURN jsonb_build_object('id',p_user,'saved',true);
END $function$
;