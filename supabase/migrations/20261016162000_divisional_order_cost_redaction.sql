-- Divisional order projection: never return company profitability or internal
-- acquisition/transport costs to a divisional client, even for multi-role admins.
-- SECURITY INVOKER preserves the base orders table RLS and grants.
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(format('o.%I',column_name),', ' ORDER BY ordinal_position)
  INTO cols
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='orders'
    AND column_name NOT IN (
      'total_cost_usd','total_cost_brl','gross_margin','variable_cost',
      'merchandise_cost','transport_cost','transport_cost_order_amount',
      'source_payload','idempotency_key'
    );
  EXECUTE format(
    'CREATE OR REPLACE VIEW public.division_orders_public WITH (security_invoker = true) AS
     SELECT %s, jsonb_build_object(''observations'',o.source_payload->>''observations'') AS source_payload
     FROM public.orders o',
    cols
  );
END $$;
REVOKE ALL ON public.division_orders_public FROM PUBLIC, anon;
GRANT SELECT ON public.division_orders_public TO authenticated;

-- Preserve the existing permission checks from integral_order_context, but
-- remove all company-cost and margin fields from the returned JSON.
CREATE OR REPLACE FUNCTION public.division_order_context(p_order_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT
    (ctx
      - 'cost_brl' - 'cost_usd' - 'total_cost_brl' - 'total_cost_usd'
      - 'merchandise_cost' - 'variable_cost' - 'gross_margin'
      - 'transport_cost' - 'transport_cost_order_amount' - 'source_payload'
    ) || jsonb_build_object(
      'order',
      (ctx->'order')
        - 'total_cost_usd' - 'total_cost_brl' - 'gross_margin'
        - 'merchandise_cost' - 'variable_cost' - 'transport_cost'
        - 'transport_cost_order_amount' - 'source_payload' - 'idempotency_key'
    )
  FROM (SELECT public.integral_order_context(p_order_id) AS ctx) t
$$;
REVOKE ALL ON FUNCTION public.division_order_context(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.division_order_context(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
