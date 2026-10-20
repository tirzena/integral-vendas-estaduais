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
      'source_payload','idempotency_key','transport_currency'
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

-- Recursively redact nested line/snapshot payloads as well as order totals.
-- Pure JSON transformation: no privileged table access.
CREATE OR REPLACE FUNCTION public.division_redact_order_payload(payload jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE result jsonb;
BEGIN
  CASE jsonb_typeof(payload)
    WHEN 'object' THEN
      SELECT coalesce(jsonb_object_agg(e.key, public.division_redact_order_payload(e.value)), '{}'::jsonb)
      INTO result FROM jsonb_each(payload) e
      WHERE e.key <> ALL (ARRAY[
        'cost','cost_brl','cost_usd','unit_cost','unit_cost_brl','unit_cost_usd',
        'unit_cost_currency','cost_currency','total_cost','total_cost_brl','total_cost_usd',
        'gross_margin','margin','margin_percent','profit','profit_amount','profit_margin',
        'merchandise_cost','variable_cost','transport_cost','transport_currency',
        'transport_cost_order_amount','source_payload','idempotency_key','transport_currency'
      ]);
      RETURN result;
    WHEN 'array' THEN
      SELECT coalesce(jsonb_agg(public.division_redact_order_payload(e.value) ORDER BY e.ordinality), '[]'::jsonb)
      INTO result FROM jsonb_array_elements(payload) WITH ORDINALITY e(value,ordinality);
      RETURN result;
    ELSE RETURN payload;
  END CASE;
END $$;
REVOKE ALL ON FUNCTION public.division_redact_order_payload(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.division_redact_order_payload(jsonb) TO authenticated;

-- Original authorization remains authoritative; redaction also covers items.
CREATE OR REPLACE FUNCTION public.division_order_context(p_order_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT public.division_redact_order_payload(public.integral_order_context(p_order_id));
$$;
REVOKE ALL ON FUNCTION public.division_order_context(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.division_order_context(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
