CREATE OR REPLACE FUNCTION private.effective_capabilities(_uid uuid)
 RETURNS SETOF text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.key from public.permission_catalog p
  where exists (select 1 from public.profiles active_profile where active_profile.id=_uid and active_profile.is_active)
  and (exists (select 1 from public.user_roles ur where ur.user_id=_uid and ur.role='superadmin')
     or (exists (select 1 from public.user_roles ur where ur.user_id=_uid and ur.role='admin')
       and p.key in ('company_finance','company_sales','manage_discounts','manage_team','manage_access_vault',
        'manage_suppliers','marketing','admin_area','inventory_view','inventory_manage','deliveries_view',
        'deliveries_manage','tracking_view_exact','tracking_manage','customers.view','customers.create',
        'customers.edit','customers.delete','opportunities.view','opportunities.create','opportunities.edit',
        'opportunities.delete','orders.view','orders.create','orders.edit_open','orders.request_change',
        'orders.approve_change','orders.delete','payments.create','payments.view','commissions.view',
        'products.manage','categories.manage','prices.manage','stock.view','stock.move','members.manage',
        'history.view','reports.view','company.observe','logistics.manage','logistics.dispatch'))
     or exists (
       select 1 from public.member_job_assignments a
       join public.job_role_permissions rp on rp.job_role_id=a.job_role_id
         and rp.permission_key=p.key and (rp.job_level_id=a.job_level_id or rp.job_level_id is null)
       where a.user_id=_uid and a.status='ativo'
         and (a.start_date is null or a.start_date<=current_date) and (a.end_date is null or a.end_date>=current_date)
         and exists(select 1 from public.job_roles j where j.id=a.job_role_id and j.active) and rp.allowed
         and (rp.job_level_id=a.job_level_id or not exists (
           select 1 from public.job_role_permissions level_rule
           where level_rule.job_role_id=a.job_role_id and level_rule.job_level_id=a.job_level_id
             and level_rule.permission_key=p.key
         ))
     )
     or exists (
       select 1 from public.user_roles ur where ur.user_id=_uid and
         ((p.key='company_finance' and ur.role='financeiro')
          or (p.key='company_sales' and ur.role in ('gestor','financeiro'))
          or (p.key='manage_team' and ur.role='gestor')
          or (p.key='manage_suppliers' and ur.role in ('gestor','financeiro','estoque'))
          or (p.key='marketing' and ur.role='gestor')
          or (p.key='inventory_view' and ur.role in ('gestor','financeiro','estoque'))
          or (p.key='inventory_manage' and ur.role='estoque')
          or (p.key='deliveries_view' and ur.role in ('gestor','entregador'))
          or (p.key='deliveries_manage' and ur.role='gestor')
          or (p.key='tracking_share_own' and ur.role='entregador'))
     ));
$function$;

CREATE OR REPLACE FUNCTION private.integral_can_review_financial(actor uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT actor IS NOT NULL AND public.is_admin(actor)
 AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=actor AND p.is_active)
 AND (public.has_role(actor,'superadmin') OR EXISTS(
 SELECT 1 FROM public.member_job_assignments a JOIN public.job_roles j ON j.id=a.job_role_id
 JOIN public.job_role_permissions rp ON rp.job_role_id=a.job_role_id AND rp.permission_key='financial_approvals'
 WHERE a.user_id=actor AND j.active AND a.status='ativo'
 AND (a.start_date IS NULL OR a.start_date<=current_date) AND (a.end_date IS NULL OR a.end_date>=current_date)
 AND rp.allowed AND (rp.job_level_id=a.job_level_id OR (rp.job_level_id IS NULL AND NOT EXISTS(
 SELECT 1 FROM public.job_role_permissions level_rule WHERE level_rule.job_role_id=a.job_role_id AND level_rule.job_level_id=a.job_level_id AND level_rule.permission_key='financial_approvals')))));
$function$;

CREATE OR REPLACE FUNCTION private.integral_operation_allowed(actor uuid, operation text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT actor IS NOT NULL AND EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND is_active)
 AND CASE WHEN public.has_role(actor,'superadmin') THEN true WHEN EXISTS(SELECT 1 FROM public.integral_member_rules r WHERE r.user_id=actor AND r.permission_overrides ? operation)
 THEN (SELECT (r.permission_overrides->>operation)::boolean FROM public.integral_member_rules r WHERE r.user_id=actor)
 ELSE EXISTS(SELECT 1 FROM private.effective_capabilities(actor) c WHERE c=operation)
 OR (EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=actor AND role='vendedor') AND operation IN
 ('customers.view','customers.create','customers.edit','opportunities.view','opportunities.create','opportunities.edit',
 'orders.view','orders.create','orders.edit_open','orders.request_change','payments.create','payments.view','commissions.view','stock.view','history.view','reports.view'))
 OR (EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=actor AND role='financeiro') AND operation IN ('payments.create','payments.view','commissions.view','history.view','reports.view')) END
$function$
;
CREATE OR REPLACE FUNCTION public.integral_order_decision_history(p_offset integer DEFAULT 0, p_limit integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF NOT private.integral_can_view_order_approvals(auth.uid()) THEN RAISE EXCEPTION 'Histórico restrito aos aprovadores.' USING ERRCODE='42501'; END IF;
 IF p_offset<0 OR p_limit NOT BETWEEN 1 AND 100 OR p_offset IS NULL OR p_limit IS NULL THEN RAISE EXCEPTION 'Paginação inválida.'; END IF;
 RETURN (WITH eligible AS (
 SELECT a.id,a.order_id,o.number,o.revision_no,a.created_at,a.note,p.full_name actor_name,c.name customer_name,a.new_snapshot->>'history_origin' history_origin,
 coalesce(a.new_snapshot->>'review_decision',CASE a.new_snapshot->>'approval_status' WHEN 'approved' THEN 'approve' ELSE 'reject' END) decision
 FROM public.order_audit_log a JOIN public.orders o ON o.id=a.order_id
 LEFT JOIN public.profiles p ON p.id=a.changed_by LEFT JOIN public.customers c ON c.id=o.customer_id
 WHERE a.new_snapshot ? 'review_decision' OR (
 a.new_snapshot->>'approval_status' IN ('approved','rejected') AND a.previous_snapshot->>'approval_status'='pending'
 AND NOT EXISTS(SELECT 1 FROM public.order_audit_log other WHERE other.order_id=a.order_id AND other.changed_by=a.changed_by AND other.created_at=a.created_at AND other.new_snapshot ? 'review_decision'))
 ), selected AS (SELECT * FROM eligible ORDER BY created_at DESC,id DESC OFFSET p_offset LIMIT p_limit)
 SELECT jsonb_build_object('total',(SELECT count(*) FROM eligible),'rows',coalesce((SELECT jsonb_agg(to_jsonb(selected) ORDER BY created_at DESC,id DESC) FROM selected),'[]')));
END $function$
;

DO $migration$
DECLARE responsible uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('legacy-approval-history-v1',0));
 SELECT p.id INTO STRICT responsible FROM public.profiles p
 JOIN public.user_roles ur ON ur.user_id=p.id AND ur.role='admin'
 WHERE lower(p.email)='tirzenaadm@gmail.com' AND p.is_active;
 INSERT INTO public.order_audit_log(order_id,root_order_id,revision_no,action,changed_by,note,previous_snapshot,new_snapshot)
 SELECT o.id,coalesce(o.root_order_id,o.id),o.revision_no,'status_alterado',responsible,
 'Regularização retroativa do fluxo anterior. Responsável de referência: Zé. Pedido já efetivado antes da central de aprovações; registro importado agora, sem simular revisão manual ou data antiga.',
 jsonb_build_object('approval_status',o.approval_status,'status',o.status,'fulfillment_status',o.fulfillment_status,'payment_status',o.payment_status),
 jsonb_build_object('review_decision','approve','approval_status','approved','history_origin','legacy_regularization',
 'recorded_by','system_migration','reference_responsible_id',responsible,'status',o.status,'fulfillment_status',o.fulfillment_status,'payment_status',o.payment_status,'original_order_created_at',o.created_at)
 FROM public.orders o
 WHERE o.deleted_at IS NULL AND o.superseded_at IS NULL AND NOT o.is_demo AND o.kind='venda'
 AND o.status IN ('faturado','entregue') AND o.approval_status IS NULL
 AND NOT EXISTS(SELECT 1 FROM public.order_audit_log a WHERE a.order_id=o.id AND
 (a.new_snapshot ? 'review_decision' OR a.new_snapshot->>'approval_status' IN ('approved','rejected')));
 INSERT INTO private.integral_payment_reviews(payment_id,order_id,decision,reviewed_by,note,previous_snapshot,new_snapshot)
 SELECT p.id,p.order_id,'confirmed',responsible,
 'Regularização retroativa do fluxo anterior. Responsável de referência: Zé. Pagamento já recebido no sistema; registro importado agora, sem simular conferência manual, criar comprovante ou alterar a data do recebimento.',
 to_jsonb(p),to_jsonb(p)||jsonb_build_object('history_origin','legacy_regularization','recorded_by','system_migration','reference_responsible_id',responsible)
 FROM public.payments p JOIN public.orders o ON o.id=p.order_id
 WHERE p.status='pago' AND o.deleted_at IS NULL AND o.superseded_at IS NULL AND NOT o.is_demo
 AND o.kind='venda' AND o.status IN('faturado','entregue') AND o.approval_status IS NULL
 AND NOT EXISTS(SELECT 1 FROM private.seller_pending_receipts r WHERE r.payment_id=p.id AND r.confirmed_at IS NULL)
 AND NOT EXISTS(SELECT 1 FROM private.integral_payment_reviews r WHERE r.payment_id=p.id);
END $migration$;