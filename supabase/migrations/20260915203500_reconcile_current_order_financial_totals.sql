-- Corrige saldos históricos inconsistentes usando as baixas de pagamento como fonte de verdade.
WITH current_payment_totals AS (
  SELECT o.id,
    round(coalesce(sum(p.amount) FILTER (WHERE p.status = 'pago'), 0), 2) AS paid
  FROM public.orders o
  LEFT JOIN public.payments p ON p.order_id = o.id
  WHERE o.deleted_at IS NULL
    AND o.superseded_at IS NULL
    AND o.status <> 'cancelado'
  GROUP BY o.id
), inconsistent AS (
  SELECT o.id, o.total, t.paid
  FROM public.orders o
  JOIN current_payment_totals t ON t.id = o.id
  WHERE abs(coalesce(o.amount_paid, 0) - t.paid) > 0.01
     OR abs(coalesce(o.amount_receivable, 0) - greatest(round(o.total - t.paid, 2), 0)) > 0.01
     OR o.payment_status IS DISTINCT FROM CASE
       WHEN t.paid >= round(o.total, 2) THEN 'pago'
       WHEN t.paid > 0 THEN 'parcial'
       ELSE 'a_pagar'
     END
)
UPDATE public.orders o
SET amount_paid = i.paid,
    amount_receivable = greatest(round(i.total - i.paid, 2), 0),
    payment_status = CASE
      WHEN i.paid >= round(i.total, 2) THEN 'pago'
      WHEN i.paid > 0 THEN 'parcial'
      ELSE 'a_pagar'
    END,
    workflow_stage = CASE
      WHEN i.paid >= round(i.total, 2) THEN 'vendido'
      WHEN i.paid > 0 THEN 'pagamento_parcial'
      WHEN o.workflow_stage = 'vendido' THEN 'esperando_pagamento'
      ELSE o.workflow_stage
    END,
    updated_at = now()
FROM inconsistent i
WHERE o.id = i.id;

UPDATE public.accounts_receivable ar
SET amount = o.amount_receivable,
    status = CASE WHEN o.amount_receivable <= 0 THEN 'pago' ELSE 'pendente' END,
    paid_at = CASE WHEN o.amount_receivable <= 0 THEN coalesce(ar.paid_at, current_date) ELSE NULL END,
    updated_at = now()
FROM public.orders o
WHERE ar.order_id = o.id
  AND ar.status <> 'cancelado'
  AND o.deleted_at IS NULL
  AND o.superseded_at IS NULL;

INSERT INTO public.accounts_receivable(
  description, customer_id, product_id, order_id, amount, currency, due_date, status
)
SELECT 'Saldo do pedido ' || o.number,
  o.customer_id, o.product_id, o.id, o.amount_receivable, o.currency, current_date, 'pendente'
FROM public.orders o
WHERE o.deleted_at IS NULL
  AND o.superseded_at IS NULL
  AND o.status <> 'cancelado'
  AND o.amount_receivable > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.accounts_receivable ar
    WHERE ar.order_id = o.id AND ar.status <> 'cancelado'
  );
