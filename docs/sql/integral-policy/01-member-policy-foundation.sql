-- Central member rules are opt-in: existing grants are deliberately untouched.
CREATE TABLE public.integral_member_rules (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 excluded_category_ids uuid[] NOT NULL DEFAULT '{}',
 excluded_item_ids uuid[] NOT NULL DEFAULT '{}',
 inherit_new_products boolean NOT NULL DEFAULT true,
 permission_overrides jsonb NOT NULL DEFAULT '{}',
 updated_by uuid REFERENCES public.profiles(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.integral_member_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integral_member_rules FROM anon,authenticated;
GRANT SELECT ON public.integral_member_rules TO authenticated;
CREATE POLICY member_rules_read ON public.integral_member_rules FOR SELECT TO authenticated
 USING(user_id=(select auth.uid()) OR public.is_admin((select auth.uid())));

INSERT INTO public.permission_catalog(key,label,group_name,sort_order)
SELECT key,label,grp,1000+ord FROM (VALUES
 ('customers.view','Visualizar clientes','Clientes',1),('customers.create','Criar clientes','Clientes',2),
 ('customers.edit','Editar clientes','Clientes',3),('customers.delete','Excluir clientes','Clientes',4),
 ('opportunities.view','Visualizar oportunidades','CRM',5),('opportunities.create','Criar oportunidades','CRM',6),
 ('opportunities.edit','Editar oportunidades','CRM',7),('opportunities.delete','Excluir oportunidades','CRM',8),
 ('orders.view','Visualizar pedidos','Pedidos',9),('orders.create','Criar pedidos','Pedidos',10),
 ('orders.edit_open','Editar pedidos abertos','Pedidos',11),('orders.request_change','Solicitar alteração','Pedidos',12),
 ('orders.approve_change','Aprovar ou rejeitar alterações','Pedidos',13),('orders.delete','Excluir pedidos','Pedidos',14),
 ('payments.create','Lançar pagamento','Financeiro',15),('payments.view','Consultar pagamentos','Financeiro',16),
 ('commissions.view','Consultar comissões','Financeiro',17),('products.manage','Gerenciar produtos','Catálogo',18),
 ('categories.manage','Gerenciar categorias','Catálogo',19),('prices.manage','Gerenciar preços','Catálogo',20),
 ('stock.view','Consultar estoques','Estoque',21),('stock.move','Movimentar estoques','Estoque',22),
 ('members.manage','Gerenciar membros e concessões','Membros',23),('history.view','Consultar históricos','Auditoria',24),
 ('reports.view','Consultar relatórios','Auditoria',25)
) x(key,label,grp,ord) ON CONFLICT(key) DO NOTHING;

CREATE FUNCTION private.integral_operation_allowed(actor uuid,operation text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT actor IS NOT NULL AND EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND is_active)
 AND CASE WHEN EXISTS(SELECT 1 FROM public.integral_member_rules r WHERE r.user_id=actor AND r.permission_overrides ? operation)
 THEN (SELECT (r.permission_overrides->>operation)::boolean FROM public.integral_member_rules r WHERE r.user_id=actor)
 ELSE public.is_admin(actor) OR EXISTS(SELECT 1 FROM private.effective_capabilities(actor) c WHERE c=operation)
 OR (EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=actor AND role='vendedor') AND operation IN
 ('customers.view','customers.create','customers.edit','opportunities.view','opportunities.create','opportunities.edit',
 'orders.view','orders.create','orders.edit_open','orders.request_change','payments.create','payments.view','commissions.view','stock.view','history.view','reports.view'))
 OR (EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=actor AND role='financeiro') AND operation IN ('payments.create','payments.view','commissions.view','history.view','reports.view')) END
$$;
REVOKE ALL ON FUNCTION private.integral_operation_allowed(uuid,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.integral_my_operations() RETURNS SETOF text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT key FROM public.permission_catalog WHERE private.integral_operation_allowed(auth.uid(),key)
$$;
REVOKE ALL ON FUNCTION public.integral_my_operations() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.integral_my_operations() TO authenticated;

CREATE OR REPLACE FUNCTION public.integral_configure_new_member(p_actor uuid,p_user uuid,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v jsonb; pid uuid; cid uuid; iid uuid; job uuid; lvl uuid; rule jsonb; wid uuid;
BEGIN
 -- Execute privileges are restricted to service_role; caller identity is checked below.
 IF NOT public.is_admin(p_actor) OR NOT private.integral_operation_allowed(p_actor,'members.manage') THEN RAISE EXCEPTION 'Administrador não autorizado.' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user AND created_at>now()-interval '5 minutes') OR EXISTS(SELECT 1 FROM public.integral_member_rules WHERE user_id=p_user) THEN RAISE EXCEPTION 'Cadastro já configurado ou conta ausente.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_payload->'roles')) THEN RAISE EXCEPTION 'Selecione um cargo.'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_payload->'roles') r WHERE r='superadmin')
 AND NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_actor AND role='superadmin') THEN RAISE EXCEPTION 'Somente superadmin pode conceder superadmin.'; END IF;
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
 INSERT INTO public.integral_member_rules(user_id,excluded_category_ids,excluded_item_ids,permission_overrides,updated_by)
 VALUES(p_user,ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(coalesce(p_payload->'excluded_category_ids','[]'))),
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
 INSERT INTO public.member_compensations(user_id,label,product_id,category_id,comp_type,amount,currency,period,active)
 VALUES(p_user,nullif(v->>'label',''),nullif(v->>'product_id','')::uuid,nullif(v->>'category_id','')::uuid,v->>'comp_type',(v->>'amount')::numeric,(v->>'currency')::public.currency_code,v->>'period',true);
 END LOOP;
 INSERT INTO public.audit_logs(user_id,entity,entity_id,action,details) VALUES(p_actor,'member',p_user,'created',jsonb_build_object('transactional',true,'roles',p_payload->'roles'));
 RETURN jsonb_build_object('id',p_user);
END $$;
REVOKE ALL ON FUNCTION public.integral_configure_new_member(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.integral_configure_new_member(uuid,uuid,jsonb) TO service_role;
