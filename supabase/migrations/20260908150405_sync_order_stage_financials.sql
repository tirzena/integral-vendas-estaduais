-- Mantem etapa, valores, pagamentos e contas a receber sincronizados ao editar o pedido.
CREATE OR REPLACE FUNCTION public.sales_set_stage(p_order_id uuid, p_stage text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := auth.uid();
  o public.orders%ROWTYPE;
  paid_total numeric := 0;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF p_stage NOT IN ('pedido_feito','em_caminho','vendido','esperando_pagamento') THEN
    RAISE EXCEPTION 'Estágio inválido.';
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR NOT public.sales_can_manage(uid, o.seller_id) THEN
    RAISE EXCEPTION 'Sem permissão para alterar o pedido.';
  END IF;
  IF o.status = 'cancelado' THEN
    RAISE EXCEPTION 'Pedido cancelado não pode mudar de estágio.';
  END IF;

  IF p_stage IN ('em_caminho','vendido','esperando_pagamento') AND o.stock_state = 'reservado' THEN
    PERFORM public.sales_apply_stock(p_order_id, 'baixar_reservado', uid);
  END IF;

  IF p_stage = 'vendido' THEN
    UPDATE public.payments
       SET status = 'pago', paid_at = coalesce(paid_at, current_date)
     WHERE order_id = p_order_id AND status <> 'cancelado';

    SELECT coalesce(sum(amount), 0) INTO paid_total
      FROM public.payments
     WHERE order_id = p_order_id AND status = 'pago';

    IF paid_total < o.total THEN
      INSERT INTO public.payments(order_id, amount, currency, method, paid_at, installment, status)
      VALUES (
        p_order_id,
        round(o.total - paid_total, 2),
        o.currency,
        'Status alterado no pedido',
        current_date,
        1,
        'pago'
      );
    END IF;

    UPDATE public.accounts_receivable
       SET status = 'pago', paid_at = coalesce(paid_at, current_date), updated_at = now()
     WHERE order_id = p_order_id AND status <> 'cancelado';
  ELSIF p_stage = 'esperando_pagamento' THEN
    UPDATE public.payments
       SET status = 'pendente', paid_at = NULL
     WHERE order_id = p_order_id AND status <> 'cancelado';

    IF EXISTS (
      SELECT 1
        FROM public.accounts_receivable
       WHERE order_id = p_order_id AND status <> 'cancelado'
    ) THEN
      UPDATE public.accounts_receivable
         SET amount = o.total,
             currency = o.currency,
             status = 'pendente',
             paid_at = NULL,
             updated_at = now()
       WHERE order_id = p_order_id AND status <> 'cancelado';
    ELSE
      INSERT INTO public.accounts_receivable(
        description, customer_id, product_id, order_id, amount, currency, due_date, status
      ) VALUES (
        'Pedido ' || coalesce(o.number::text, p_order_id::text),
        o.customer_id,
        o.product_id,
        p_order_id,
        o.total,
        o.currency,
        current_date,
        'pendente'
      );
    END IF;
  END IF;

  UPDATE public.orders
     SET workflow_stage = p_stage,
         kind = CASE
           WHEN p_stage IN ('em_caminho','vendido','esperando_pagamento') THEN 'venda'
           ELSE kind
         END,
         stock_state = CASE
           WHEN p_stage IN ('em_caminho','vendido','esperando_pagamento') THEN 'baixado'
           ELSE stock_state
         END,
         payment_status = CASE
           WHEN p_stage = 'vendido' THEN 'pago'
           WHEN p_stage = 'esperando_pagamento' THEN 'a_pagar'
           ELSE payment_status
         END,
         amount_paid = CASE WHEN p_stage = 'vendido' THEN total
                            WHEN p_stage = 'esperando_pagamento' THEN 0
                            ELSE amount_paid END,
         amount_receivable = CASE WHEN p_stage = 'vendido' THEN 0
                                  WHEN p_stage = 'esperando_pagamento' THEN total
                                  ELSE amount_receivable END,
         fulfillment_status = CASE
           WHEN p_stage = 'em_caminho' THEN 'a_caminho'
           WHEN p_stage = 'vendido' THEN 'entregue'
           ELSE fulfillment_status
         END,
         status = CASE WHEN p_stage = 'vendido' THEN 'entregue' ELSE status END,
         delivered_at = CASE WHEN p_stage = 'vendido' THEN coalesce(delivered_at, current_date)
                             ELSE delivered_at END,
         tracking_status = CASE WHEN p_stage = 'em_caminho' THEN 'Em caminho'
                                WHEN p_stage = 'vendido' THEN 'Entregue'
                                ELSE tracking_status END
   WHERE id = p_order_id;

  RETURN jsonb_build_object('id', p_order_id, 'stage', p_stage);
END
$$;

REVOKE ALL ON FUNCTION public.sales_set_stage(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_set_stage(uuid,text) TO authenticated;
