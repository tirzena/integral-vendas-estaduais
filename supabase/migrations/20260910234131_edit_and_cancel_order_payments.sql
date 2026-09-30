-- Corrige ou cancela baixas sem apagar o histórico financeiro do pedido.
ALTER TABLE public.order_audit_log DROP CONSTRAINT IF EXISTS order_audit_log_action_check;
ALTER TABLE public.order_audit_log
  ADD CONSTRAINT order_audit_log_action_check CHECK (
    action IN (
      'versao_criada','status_alterado','comprovante_adicionado','excluido',
      'pagamento_registrado','pagamento_editado','pagamento_cancelado','entrega_confirmada'
    )
  );

CREATE OR REPLACE FUNCTION public.sales_edit_order_payment(
  p_order_id uuid,
  p_payment_id uuid,
  p_amount numeric,
  p_method text,
  p_proof_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := auth.uid();
  o public.orders%ROWTYPE;
  pay public.payments%ROWTYPE;
  proof public.order_payment_proofs%ROWTYPE;
  paid_total numeric := 0;
  remaining numeric := 0;
  next_stage text;
  before_snapshot jsonb;
  root_id uuid;
  is_cash boolean := lower(btrim(coalesce(p_method, ''))) = 'dinheiro';
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF coalesce(p_amount, 0) <= 0 OR coalesce(btrim(p_method), '') = '' THEN
    RAISE EXCEPTION 'Informe valor e forma de pagamento.';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'Informe o motivo da alteração (mínimo 5 caracteres).';
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF o.id IS NULL OR o.status = 'cancelado' OR o.deleted_at IS NOT NULL
    OR NOT public.sales_can_manage(uid, o.seller_id) THEN
    RAISE EXCEPTION 'Sem permissão para editar o pagamento deste pedido.';
  END IF;

  SELECT * INTO pay
  FROM public.payments
  WHERE id = p_payment_id AND order_id = o.id
  FOR UPDATE;
  IF pay.id IS NULL OR pay.status <> 'pago' THEN
    RAISE EXCEPTION 'Pagamento não encontrado ou já cancelado.';
  END IF;

  IF NOT is_cash THEN
    IF p_proof_id IS NOT NULL THEN
      SELECT * INTO proof
      FROM public.order_payment_proofs
      WHERE id = p_proof_id AND order_id = o.id AND payment_id IS NULL
      FOR UPDATE;
      IF proof.id IS NULL THEN
        RAISE EXCEPTION 'Selecione um comprovante ainda não utilizado.';
      END IF;
      UPDATE public.order_payment_proofs
      SET payment_id = NULL
      WHERE payment_id = pay.id
        AND coalesce(proof_type, '') <> 'recibo_sistema';
      UPDATE public.order_payment_proofs SET payment_id = pay.id WHERE id = proof.id;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.order_payment_proofs pr
      WHERE pr.payment_id = pay.id
        AND coalesce(pr.proof_type, '') <> 'recibo_sistema'
    ) THEN
      RAISE EXCEPTION 'Anexe um comprovante antes de usar esta forma de pagamento.';
    END IF;

    -- Recibos automáticos só representam pagamentos feitos em dinheiro.
    DELETE FROM public.order_payment_proofs
    WHERE payment_id = pay.id AND proof_type = 'recibo_sistema';
  END IF;

  before_snapshot := public.sales_order_snapshot(o.id);
  root_id := coalesce(o.root_order_id, o.id);

  UPDATE public.payments
  SET amount = round(p_amount, 2), method = btrim(p_method)
  WHERE id = pay.id;

  IF is_cash THEN
    -- Ao corrigir para dinheiro, libera comprovantes enviados para exclusão ou outro pagamento.
    UPDATE public.order_payment_proofs
    SET payment_id = NULL
    WHERE payment_id = pay.id
      AND coalesce(proof_type, '') <> 'recibo_sistema';

    IF NOT EXISTS (
      SELECT 1 FROM public.order_payment_proofs pr
      WHERE pr.payment_id = pay.id AND pr.proof_type = 'recibo_sistema'
    ) THEN
      INSERT INTO public.order_payment_proofs(
        order_id, payment_id, proof_type, file_path, file_name, uploaded_by
      ) VALUES (
        o.id, pay.id, 'recibo_sistema', pay.receipt_token::text,
        'Recibo-pedido-' || lpad(coalesce(o.number, 0)::text, 2, '0') || '.pdf', uid
      );
    END IF;
  END IF;

  SELECT round(coalesce(sum(amount), 0), 2) INTO paid_total
  FROM public.payments
  WHERE order_id = o.id AND status = 'pago';
  IF paid_total > round(o.total, 2) THEN
    RAISE EXCEPTION 'O total dos pagamentos não pode ultrapassar o valor do pedido.';
  END IF;

  remaining := greatest(0, round(o.total - paid_total, 2));
  next_stage := CASE
    WHEN remaining = 0 THEN 'vendido'
    WHEN paid_total > 0 THEN 'pagamento_parcial'
    ELSE 'esperando_pagamento'
  END;

  UPDATE public.orders
  SET amount_paid = paid_total,
      amount_receivable = remaining,
      payment_status = CASE
        WHEN remaining = 0 THEN 'pago'
        WHEN paid_total > 0 THEN 'parcial'
        ELSE 'a_pagar'
      END,
      workflow_stage = next_stage,
      status = 'faturado'
  WHERE id = o.id;

  IF EXISTS (
    SELECT 1 FROM public.accounts_receivable
    WHERE order_id = o.id AND status <> 'cancelado'
  ) THEN
    UPDATE public.accounts_receivable
    SET amount = remaining,
        status = CASE WHEN remaining = 0 THEN 'pago' ELSE 'pendente' END,
        paid_at = CASE WHEN remaining = 0 THEN current_date ELSE NULL END,
        updated_at = now()
    WHERE order_id = o.id AND status <> 'cancelado';
  ELSIF remaining > 0 THEN
    INSERT INTO public.accounts_receivable(
      description, customer_id, product_id, order_id, amount, currency, due_date, status
    ) VALUES (
      'Saldo do pedido ' || coalesce(o.number::text, o.id::text),
      o.customer_id, o.product_id, o.id, remaining, o.currency, current_date, 'pendente'
    );
  END IF;

  INSERT INTO public.order_audit_log(
    order_id, root_order_id, revision_no, action, changed_by, note,
    previous_snapshot, new_snapshot
  ) VALUES (
    o.id, root_id, o.revision_no, 'pagamento_editado', uid,
    'Pagamento editado de ' || pay.amount || ' ' || pay.currency || ' (' || coalesce(pay.method, 'sem forma') ||
      ') para ' || round(p_amount, 2) || ' ' || pay.currency || ' (' || btrim(p_method) || '). Motivo: ' || btrim(p_reason),
    before_snapshot, public.sales_order_snapshot(o.id)
  );

  RETURN jsonb_build_object(
    'id', o.id,
    'payment_id', pay.id,
    'paid', paid_total,
    'remaining', remaining,
    'stage', next_stage
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sales_edit_order_payment(uuid, uuid, numeric, text, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_edit_order_payment(uuid, uuid, numeric, text, uuid, text)
  TO authenticated;


CREATE OR REPLACE FUNCTION public.sales_cancel_order_payment(
  p_order_id uuid,
  p_payment_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := auth.uid();
  o public.orders%ROWTYPE;
  pay public.payments%ROWTYPE;
  paid_total numeric := 0;
  remaining numeric := 0;
  next_stage text;
  before_snapshot jsonb;
  root_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'Informe o motivo do cancelamento (mínimo 5 caracteres).';
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF o.id IS NULL OR o.status = 'cancelado' OR o.deleted_at IS NOT NULL
    OR NOT public.sales_can_manage(uid, o.seller_id) THEN
    RAISE EXCEPTION 'Sem permissão para cancelar o pagamento deste pedido.';
  END IF;

  SELECT * INTO pay
  FROM public.payments
  WHERE id = p_payment_id AND order_id = o.id
  FOR UPDATE;
  IF pay.id IS NULL OR pay.status <> 'pago' THEN
    RAISE EXCEPTION 'Pagamento não encontrado ou já cancelado.';
  END IF;

  before_snapshot := public.sales_order_snapshot(o.id);
  root_id := coalesce(o.root_order_id, o.id);
  UPDATE public.payments SET status = 'cancelado' WHERE id = pay.id;

  SELECT round(coalesce(sum(amount), 0), 2) INTO paid_total
  FROM public.payments
  WHERE order_id = o.id AND status = 'pago';
  remaining := greatest(0, round(o.total - paid_total, 2));
  next_stage := CASE
    WHEN remaining = 0 THEN 'vendido'
    WHEN paid_total > 0 THEN 'pagamento_parcial'
    ELSE 'esperando_pagamento'
  END;

  UPDATE public.orders
  SET amount_paid = paid_total,
      amount_receivable = remaining,
      payment_status = CASE
        WHEN remaining = 0 THEN 'pago'
        WHEN paid_total > 0 THEN 'parcial'
        ELSE 'a_pagar'
      END,
      workflow_stage = next_stage,
      status = 'faturado'
  WHERE id = o.id;

  IF EXISTS (
    SELECT 1 FROM public.accounts_receivable
    WHERE order_id = o.id AND status <> 'cancelado'
  ) THEN
    UPDATE public.accounts_receivable
    SET amount = remaining,
        status = CASE WHEN remaining = 0 THEN 'pago' ELSE 'pendente' END,
        paid_at = CASE WHEN remaining = 0 THEN current_date ELSE NULL END,
        updated_at = now()
    WHERE order_id = o.id AND status <> 'cancelado';
  ELSIF remaining > 0 THEN
    INSERT INTO public.accounts_receivable(
      description, customer_id, product_id, order_id, amount, currency, due_date, status
    ) VALUES (
      'Saldo do pedido ' || coalesce(o.number::text, o.id::text),
      o.customer_id, o.product_id, o.id, remaining, o.currency, current_date, 'pendente'
    );
  END IF;

  INSERT INTO public.order_audit_log(
    order_id, root_order_id, revision_no, action, changed_by, note,
    previous_snapshot, new_snapshot
  ) VALUES (
    o.id, root_id, o.revision_no, 'pagamento_cancelado', uid,
    'Pagamento cancelado: ' || pay.amount || ' ' || pay.currency || ' (' || coalesce(pay.method, 'sem forma') ||
      '). Motivo: ' || btrim(p_reason),
    before_snapshot, public.sales_order_snapshot(o.id)
  );

  RETURN jsonb_build_object(
    'id', o.id,
    'payment_id', pay.id,
    'paid', paid_total,
    'remaining', remaining,
    'stage', next_stage
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sales_cancel_order_payment(uuid, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_cancel_order_payment(uuid, uuid, text)
  TO authenticated;
