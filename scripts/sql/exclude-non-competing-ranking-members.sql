CREATE OR REPLACE FUNCTION private.seller_legacy_ranking_championship_standings(p_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE c public.ranking_championships; result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
 SELECT * INTO c FROM public.ranking_championships WHERE id=p_id AND enabled;
 IF NOT FOUND THEN RETURN '{"members":[],"teams":[]}'::jsonb; END IF;
 WITH eligible AS (
 SELECT o.id,o.seller_id,
 CASE WHEN c.counting_mode='orders' THEN 1::numeric
 WHEN c.counting_mode='paid' THEN CASE WHEN o.stock_state='baixado' AND o.total>0 AND coalesce(pay.amount,0)>=o.total-0.01 THEN 1::numeric ELSE 0::numeric END
 ELSE CASE WHEN o.total>0 THEN least(1::numeric,greatest(0::numeric,coalesce(pay.amount,0)/o.total)) ELSE 0::numeric END END AS ratio
 FROM public.orders o LEFT JOIN LATERAL (SELECT sum(p.amount) amount FROM public.payments p WHERE p.order_id=o.id AND p.status='pago' AND coalesce(p.paid_at::timestamp AT TIME ZONE 'America/Sao_Paulo',p.created_at)<c.ends_at AND coalesce(p.paid_at::timestamp AT TIME ZONE 'America/Sao_Paulo',p.created_at)<=now()) pay ON true
 WHERE o.created_at>=c.starts_at AND o.created_at<least(c.ends_at,now()) AND o.deleted_at IS NULL AND o.superseded_at IS NULL AND NOT coalesce(o.is_demo,false) AND o.seller_id IS NOT NULL
 AND o.seller_id NOT IN ('cf25abd8-ed9d-438d-8b09-85e27a71e808'::uuid,'90a39e4e-4529-4929-b682-33377cf34080'::uuid)
 AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=o.seller_id AND ur.role='vendedor')
 AND EXISTS (SELECT 1 FROM public.profiles sp WHERE sp.id=o.seller_id AND sp.is_active IS NOT FALSE) AND o.status<>'cancelado' AND coalesce(o.workflow_stage,'') NOT IN ('cancelado','rascunho','solicitacao_catalogo')
 ), totals AS (
 SELECT e.seller_id id,round(sum(i.quantity*e.ratio),2) units FROM eligible e JOIN public.order_items i ON i.order_id=e.id WHERE (cardinality(c.eligible_macro_ids)=0 OR EXISTS (SELECT 1 FROM public.inventory_items inv WHERE inv.id=i.item_id AND inv.product_id=ANY(c.eligible_macro_ids)))
 AND (cardinality(c.eligible_category_ids)=0 OR EXISTS (SELECT 1 FROM public.inventory_items inv WHERE inv.id=i.item_id AND inv.category_id=ANY(c.eligible_category_ids)))
 AND (cardinality(c.eligible_item_ids)=0 OR i.item_id=ANY(c.eligible_item_ids))
 AND (cardinality(c.eligible_macro_ids)+cardinality(c.eligible_category_ids)+cardinality(c.eligible_item_ids)>0 OR cardinality(c.eligible_products)=0 OR lower(trim(i.description))=ANY(c.eligible_products)) GROUP BY e.seller_id
 ), members AS (
 SELECT t.id,coalesce(nullif(p.full_name,''),'Sem nome') name,t.units FROM totals t LEFT JOIN public.profiles p ON p.id=t.id
 ), links AS (
 SELECT team_id,user_id FROM public.team_members UNION SELECT id,manager_id FROM public.teams WHERE manager_id IS NOT NULL
 ), teams AS (
 SELECT t.id,t.name,coalesce(sum(m.units),0) units FROM public.teams t LEFT JOIN links l ON l.team_id=t.id LEFT JOIN members m ON m.id=l.user_id WHERE NOT coalesce(t.is_demo,false) GROUP BY t.id,t.name
 ) SELECT jsonb_build_object('members',coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY units DESC,name,id) FROM members m),'[]'::jsonb),'teams',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY units DESC,name,id) FROM teams t),'[]'::jsonb)) INTO result;
 RETURN result;
END $function$
