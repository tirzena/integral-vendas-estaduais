BEGIN;
CREATE TABLE public.ranking_championships (
 id text PRIMARY KEY, title text NOT NULL, destination text NOT NULL,
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
 individual_goal integer NOT NULL CHECK(individual_goal > 0),
 team_goal integer NOT NULL CHECK(team_goal > 0),
 counting_mode text NOT NULL DEFAULT 'proportional' CHECK(counting_mode IN ('paid','orders','proportional')),
 eligible_products text[] NOT NULL DEFAULT ARRAY['tirzena','tg','retrazin 40mg'],
 team_prize text NOT NULL DEFAULT 'A definir pelos administradores',
 media jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(media)='array'),
 enabled boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(ends_at > starts_at)
);
ALTER TABLE public.ranking_championships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ranking_championships FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.ranking_championships TO authenticated;
CREATE POLICY championships_read ON public.ranking_championships FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY championships_insert ON public.ranking_championships FOR INSERT TO authenticated WITH CHECK(public.is_admin(auth.uid()));
CREATE POLICY championships_update ON public.ranking_championships FOR UPDATE TO authenticated USING(public.is_admin(auth.uid())) WITH CHECK(public.is_admin(auth.uid()));
INSERT INTO public.ranking_championships(id,title,destination,starts_at,ends_at,individual_goal,team_goal,media) VALUES
 ('outubro-2026','Rota dos campeões','Porto de Galinhas','2026-09-16T00:00:00-03:00','2026-10-16T00:00:00-03:00',1500,8000,'[{"id":"porto-video","kind":"youtube","title":"Porto de Galinhas","url":"https://www.youtube.com/watch?v=_u8DPjyW-14"}]'),
 ('novembro-2026','Destino Buenos Aires','Buenos Aires','2026-10-16T00:00:00-03:00','2026-11-15T00:00:00-03:00',1000,6000,'[{"id":"buenos-video","kind":"youtube","title":"Buenos Aires","url":"https://www.youtube.com/watch?v=tx0GCVfID_U"}]'),
 ('dezembro-2026','Destino Puerto Plata','Puerto Plata','2026-11-15T00:00:00-03:00','2026-12-15T00:00:00-03:00',3500,8000,'[{"id":"puerto-video","kind":"youtube","title":"Puerto Plata","url":"https://www.youtube.com/watch?v=P4FQMqMhOj8"}]');
-- Only unit totals and display names are exposed, never customer/payment/financial details.
CREATE FUNCTION public.ranking_championship_standings(p_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
 FROM public.orders o
 LEFT JOIN LATERAL (SELECT sum(p.amount) amount FROM public.payments p WHERE p.order_id=o.id AND p.status='pago' AND coalesce(p.paid_at::timestamp AT TIME ZONE 'America/Sao_Paulo',p.created_at) < c.ends_at AND coalesce(p.paid_at::timestamp AT TIME ZONE 'America/Sao_Paulo',p.created_at)<=now()) pay ON true
 WHERE o.created_at>=c.starts_at AND o.created_at<least(c.ends_at,now())
 AND o.deleted_at IS NULL AND o.superseded_at IS NULL AND NOT coalesce(o.is_demo,false)
 AND o.seller_id IS NOT NULL AND o.status<>'cancelado'
 AND coalesce(o.workflow_stage,'') NOT IN ('cancelado','rascunho','solicitacao_catalogo')
 ), totals AS (
 SELECT e.seller_id id,round(sum(i.quantity*e.ratio),2) units
 FROM eligible e JOIN public.order_items i ON i.order_id=e.id
 WHERE cardinality(c.eligible_products)=0 OR lower(trim(i.description))=ANY(c.eligible_products)
 GROUP BY e.seller_id
 ), members AS (
 SELECT t.id,coalesce(nullif(p.full_name,''),'Sem nome') name,t.units FROM totals t LEFT JOIN public.profiles p ON p.id=t.id
 ), links AS (
 SELECT team_id,user_id FROM public.team_members UNION SELECT id,manager_id FROM public.teams WHERE manager_id IS NOT NULL
 ), teams AS (
 SELECT t.id,t.name,coalesce(sum(m.units),0) units FROM public.teams t LEFT JOIN links l ON l.team_id=t.id LEFT JOIN members m ON m.id=l.user_id WHERE NOT coalesce(t.is_demo,false) GROUP BY t.id,t.name
 )
 SELECT jsonb_build_object('members',coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY units DESC,name,id) FROM members m),'[]'::jsonb), 'teams',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY units DESC,name,id) FROM teams t),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.ranking_championship_standings(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ranking_championship_standings(text) TO authenticated;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('championship-media','championship-media',true,52428800,ARRAY['image/jpeg','image/png','image/webp','video/mp4','video/webm']) ON CONFLICT(id) DO NOTHING;
CREATE POLICY championship_media_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='championship-media' AND public.is_admin(auth.uid()));
CREATE POLICY championship_media_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='championship-media');
COMMIT;
