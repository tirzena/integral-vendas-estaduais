-- Reconstroi a reserva por estoque usando somente pedidos ativos que ainda
-- estao no estado reservado. Isso remove residuos deixados por revisoes ou
-- cancelamentos antigos sem alterar quantidade fisica nem dados dos pedidos.
WITH expected AS (
  SELECT
    o.warehouse_id,
    oi.item_id,
    sum(oi.quantity)::numeric(14,3) AS reserved
  FROM public.orders o
  JOIN public.order_items oi ON oi.order_id = o.id
  WHERE o.deleted_at IS NULL
    AND o.superseded_at IS NULL
    AND o.stock_state = 'reservado'
    AND o.warehouse_id IS NOT NULL
    AND oi.item_id IS NOT NULL
  GROUP BY o.warehouse_id, oi.item_id
), corrected AS (
  SELECT
    wi.id,
    coalesce(e.reserved, 0)::numeric(14,3) AS reserved
  FROM public.warehouse_inventory wi
  LEFT JOIN expected e
    ON e.warehouse_id = wi.warehouse_id
   AND e.item_id = wi.item_id
)
UPDATE public.warehouse_inventory wi
SET reserved = corrected.reserved,
    updated_at = now()
FROM corrected
WHERE corrected.id = wi.id
  AND wi.reserved IS DISTINCT FROM corrected.reserved;

DO $$
BEGIN
  IF EXISTS (
    WITH expected AS (
      SELECT
        o.warehouse_id,
        oi.item_id,
        sum(oi.quantity)::numeric(14,3) AS reserved
      FROM public.orders o
      JOIN public.order_items oi ON oi.order_id = o.id
      WHERE o.deleted_at IS NULL
        AND o.superseded_at IS NULL
        AND o.stock_state = 'reservado'
        AND o.warehouse_id IS NOT NULL
        AND oi.item_id IS NOT NULL
      GROUP BY o.warehouse_id, oi.item_id
    )
    SELECT 1
    FROM public.warehouse_inventory wi
    LEFT JOIN expected e
      ON e.warehouse_id = wi.warehouse_id
     AND e.item_id = wi.item_id
    WHERE wi.reserved IS DISTINCT FROM coalesce(e.reserved, 0)
  ) THEN
    RAISE EXCEPTION 'Nao foi possivel reconciliar todas as reservas de estoque.';
  END IF;
END $$;
