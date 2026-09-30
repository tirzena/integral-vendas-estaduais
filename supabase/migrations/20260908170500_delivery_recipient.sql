ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_recipient_name text;

UPDATE public.orders o
SET delivery_recipient_name = c.name
FROM public.customers c
WHERE o.customer_id = c.id
  AND nullif(btrim(o.delivery_recipient_name), '') IS NULL;

COMMENT ON COLUMN public.orders.delivery_recipient_name IS
  'Nome da pessoa que receberá a entrega; pode ser diferente do cliente do pedido.';

DROP FUNCTION IF EXISTS public.my_deliveries();
CREATE FUNCTION public.my_deliveries()
RETURNS TABLE(
  order_id uuid, number integer, status text, tracking_status text,
  workflow_stage text, fulfillment_status text, tracking_enabled boolean,
  recipient text, address text, city text, state text, phone text, deadline date,
  delivered_at date, instructions text, warehouse_name text, warehouse_address text,
  warehouse_city text, warehouse_state text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT o.id, o.number, o.status, o.tracking_status, o.workflow_stage,
         o.fulfillment_status, o.tracking_enabled,
         coalesce(nullif(btrim(o.delivery_recipient_name), ''), o.delivery->>'name', 'Não informado'),
         coalesce(o.shipping_address, o.delivery->>'address'), o.shipping_city, o.shipping_state,
         coalesce(o.whatsapp, o.delivery->>'phone'), o.delivery_deadline, o.delivered_at,
         o.delivery->>'notes', w.name, w.address, w.city, w.state
  FROM public.orders o
  JOIN public.delivery_assignments d ON d.order_id = o.id AND d.driver_id = auth.uid()
  LEFT JOIN public.warehouses w ON w.id = o.warehouse_id
  WHERE auth.uid() IS NOT NULL
    AND o.deleted_at IS NULL
    AND o.superseded_at IS NULL
  ORDER BY o.delivery_deadline NULLS LAST, o.number DESC
  LIMIT 300
$$;
REVOKE EXECUTE ON FUNCTION public.my_deliveries() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_deliveries() TO authenticated;

-- Compartilhamento detalhado por link sigiloso. O UUID funciona como chave de acesso
-- e não permite descobrir pedidos por numeração sequencial.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS share_token uuid DEFAULT gen_random_uuid();

UPDATE public.orders SET share_token = gen_random_uuid() WHERE share_token IS NULL;
ALTER TABLE public.orders ALTER COLUMN share_token SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS orders_share_token_uq ON public.orders(share_token);

CREATE OR REPLACE FUNCTION public.sales_order_share_token(p_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := auth.uid(); result uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  SELECT o.share_token INTO result
  FROM public.orders o
  WHERE o.id = p_order_id
    AND o.deleted_at IS NULL
    AND o.superseded_at IS NULL
    AND public.sales_can_manage(uid, o.seller_id);
  IF result IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado ou sem permissão.'; END IF;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.sales_order_share_token(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_order_share_token(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.public_order_by_share_token(p_token uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'order', jsonb_build_object(
      'id', o.id, 'number', o.number, 'revision_no', o.revision_no,
      'created_at', o.created_at, 'order_date', o.order_date, 'status', o.status,
      'workflow_stage', o.workflow_stage, 'payment_status', o.payment_status,
      'fulfillment_status', o.fulfillment_status, 'currency', o.currency,
      'discount', o.discount, 'shipping_cost', o.shipping_cost,
      'shipping_percentage', o.shipping_percentage, 'total', o.total,
      'amount_paid', o.amount_paid, 'amount_receivable', o.amount_receivable,
      'bonus_amount', o.bonus_amount, 'total_cost_brl', o.total_cost_brl,
      'total_cost_usd', o.total_cost_usd, 'gross_margin', o.gross_margin,
      'origin', o.origin, 'source_reference', o.source_reference,
      'source_month', o.source_month, 'notes', o.notes, 'whatsapp', o.whatsapp,
      'delivery_recipient_name', o.delivery_recipient_name,
      'shipping_address', o.shipping_address, 'shipping_city', o.shipping_city,
      'shipping_state', o.shipping_state, 'delivery_deadline', o.delivery_deadline,
      'delivered_at', o.delivered_at, 'carrier', o.carrier,
      'tracking_code', o.tracking_code, 'tracking_status', o.tracking_status,
      'exchange_rates_snapshot', o.exchange_rates_snapshot,
      'exchange_rate_source', o.exchange_rate_source,
      'exchange_rate_locked_at', o.exchange_rate_locked_at
    ),
    'customer', CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object(
      'name', c.name, 'trade_name', c.trade_name, 'document', c.document,
      'foreign_document', c.foreign_document, 'phone', c.phone, 'whatsapp', c.whatsapp,
      'email', c.email, 'country', c.country, 'state', c.state, 'city', c.city,
      'address', c.address
    ) END,
    'seller', jsonb_build_object('name', p.full_name),
    'warehouse', CASE WHEN w.id IS NULL THEN NULL ELSE jsonb_build_object(
      'name', w.name, 'address', w.address, 'city', w.city, 'state', w.state
    ) END,
    'items', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'description', i.description, 'sku', i.sku, 'barcode', i.barcode,
      'unit', i.unit, 'quantity', i.quantity, 'unit_price', i.unit_price,
      'discount', i.discount, 'total', i.total
    ) ORDER BY i.created_at) FROM public.order_items i WHERE i.order_id = o.id), '[]'::jsonb),
    'payments', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'amount', pay.amount, 'currency', pay.currency, 'method', pay.method,
      'paid_at', pay.paid_at, 'installment', pay.installment, 'status', pay.status,
      'created_at', pay.created_at, 'settled_amount_brl', pay.settled_amount_brl,
      'settled_amount_usd', pay.settled_amount_usd, 'settled_amount_pyg', pay.settled_amount_pyg,
      'exchange_rates_snapshot', pay.exchange_rates_snapshot,
      'exchange_rate_source', pay.exchange_rate_source,
      'exchange_rate_locked_at', pay.exchange_rate_locked_at
    ) ORDER BY pay.created_at) FROM public.payments pay WHERE pay.order_id = o.id), '[]'::jsonb),
    'proofs', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'type', pr.proof_type, 'file_name', pr.file_name,
      'external_url', pr.external_url, 'created_at', pr.created_at
    ) ORDER BY pr.created_at) FROM public.order_payment_proofs pr WHERE pr.order_id = o.id), '[]'::jsonb),
    'history', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'action', h.action, 'revision_no', h.revision_no, 'note', h.note,
      'created_at', h.created_at, 'changed_by', hp.full_name
    ) ORDER BY h.created_at DESC)
      FROM public.order_audit_log h
      LEFT JOIN public.profiles hp ON hp.id = h.changed_by
      WHERE h.root_order_id = coalesce(o.root_order_id, o.id)), '[]'::jsonb)
  )
  FROM public.orders o
  LEFT JOIN public.customers c ON c.id = o.customer_id
  LEFT JOIN public.profiles p ON p.id = o.seller_id
  LEFT JOIN public.warehouses w ON w.id = o.warehouse_id
  WHERE o.share_token = p_token
    AND o.deleted_at IS NULL
    AND o.superseded_at IS NULL
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.public_order_by_share_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_order_by_share_token(uuid) TO anon, authenticated;
