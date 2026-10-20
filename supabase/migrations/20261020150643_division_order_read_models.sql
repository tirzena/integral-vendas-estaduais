CREATE OR REPLACE FUNCTION public.division_order_detail(p_order_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $$ SELECT public.division_redact_order_payload(public.sales_order_detail(p_order_id)); $$;
CREATE OR REPLACE FUNCTION public.division_order_history(p_order_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $$ SELECT coalesce(jsonb_agg(public.division_redact_order_payload(to_jsonb(h))),'[]'::jsonb) FROM public.sales_order_history(p_order_id) h; $$;
CREATE OR REPLACE FUNCTION public.division_commission_breakdown(p_order uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $$
 SELECT jsonb_build_object('currency',d->'currency','commission_total',d->'commission_total','exception_amount',d->'exception_amount',
 'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',i->'id','description',i->'description','commission_amount',i->'commission_amount','commission_enabled',i->'commission_enabled')) FROM jsonb_array_elements(d->'items') i),'[]'::jsonb))
 FROM (SELECT public.remuneration_commission_breakdown(p_order) d) t;
$$;
REVOKE ALL ON FUNCTION public.division_order_detail(uuid),public.division_order_history(uuid),public.division_commission_breakdown(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.division_order_detail(uuid),public.division_order_history(uuid),public.division_commission_breakdown(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
