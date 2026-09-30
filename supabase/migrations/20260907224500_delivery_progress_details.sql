ALTER TABLE public.delivery_events
  ADD COLUMN IF NOT EXISTS distance_remaining_km numeric(12,2),
  ADD COLUMN IF NOT EXISTS estimated_arrival_at timestamptz;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_issue text;

CREATE OR REPLACE FUNCTION public.sales_update_order_delivery(
  p_order_id uuid,
  p_deadline date,
  p_carrier text,
  p_tracking_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := auth.uid();
  o public.orders%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR NOT public.sales_can_manage(uid, o.seller_id) THEN
    RAISE EXCEPTION 'Sem permissão para alterar a entrega.';
  END IF;

  UPDATE public.orders
  SET delivery_deadline = p_deadline,
      carrier = nullif(btrim(p_carrier), ''),
      tracking_code = nullif(btrim(p_tracking_code), ''),
      tracking_enabled = CASE
        WHEN nullif(btrim(p_tracking_code), '') IS NOT NULL THEN true
        ELSE tracking_enabled
      END
  WHERE id = p_order_id;

  RETURN jsonb_build_object('id', p_order_id, 'updated', true);
END;
$$;

REVOKE ALL ON FUNCTION public.sales_update_order_delivery(uuid,date,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_update_order_delivery(uuid,date,text,text) TO authenticated;
