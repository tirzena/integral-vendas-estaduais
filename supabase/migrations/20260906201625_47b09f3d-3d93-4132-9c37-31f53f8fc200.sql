-- 1. Colunas incrementais -------------------------------------------------
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS discount numeric NOT NULL DEFAULT 0;

ALTER TABLE public.quote_items
  ADD COLUMN IF NOT EXISTS item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS discount numeric NOT NULL DEFAULT 0;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'venda',
  ADD COLUMN IF NOT EXISTS stock_state text NOT NULL DEFAULT 'baixado',
  ADD COLUMN IF NOT EXISTS origin text DEFAULT 'pdv',
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS origin text DEFAULT 'pdv',
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS converted_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS converted_at timestamptz;

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS document_type text,
  ADD COLUMN IF NOT EXISTS document_id uuid,
  ADD COLUMN IF NOT EXISTS document_number integer;

CREATE INDEX IF NOT EXISTS idx_order_items_item ON public.order_items(item_id);
CREATE INDEX IF NOT EXISTS idx_quote_items_item ON public.quote_items(item_id);
CREATE INDEX IF NOT EXISTS idx_orders_kind_status ON public.orders(kind, status);
CREATE INDEX IF NOT EXISTS idx_inv_mov_document ON public.inventory_movements(document_id);

-- 2. Numeração transacional ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.document_counters (
  scope text PRIMARY KEY,
  last_number integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.document_counters TO authenticated;
GRANT ALL ON public.document_counters TO service_role;
ALTER TABLE public.document_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "counters_select_auth" ON public.document_counters;
CREATE POLICY "counters_select_auth" ON public.document_counters
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.document_counters(scope, last_number)
VALUES ('orders', COALESCE((SELECT max(number) FROM public.orders), 0))
ON CONFLICT (scope) DO UPDATE
  SET last_number = GREATEST(public.document_counters.last_number, EXCLUDED.last_number);

INSERT INTO public.document_counters(scope, last_number)
VALUES ('quotes', COALESCE((SELECT max(number) FROM public.quotes), 0))
ON CONFLICT (scope) DO UPDATE
  SET last_number = GREATEST(public.document_counters.last_number, EXCLUDED.last_number);

CREATE OR REPLACE FUNCTION public.sales_next_number(p_scope text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  INSERT INTO public.document_counters(scope, last_number, updated_at)
  VALUES (p_scope, 1, now())
  ON CONFLICT (scope) DO UPDATE
    SET last_number = public.document_counters.last_number + 1, updated_at = now()
  RETURNING last_number INTO n;
  RETURN n;
END $$;

-- 3. Helpers ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sales_can_manage(_user_id uuid, _seller_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL AND (
    _user_id = _seller_id
    OR public.is_admin(_user_id)
    OR public.has_role(_user_id, 'gestor')
    OR public.has_role(_user_id, 'financeiro')
  )
$$;

-- Aplica reserva/baixa/estorno de estoque de um documento
CREATE OR REPLACE FUNCTION public.sales_apply_stock(
  p_order_id uuid,
  p_action text,        -- 'reservar' | 'baixar' | 'baixar_reservado' | 'liberar' | 'estornar'
  p_user_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r record;
  inv record;
  ord record;
BEGIN
  SELECT * INTO ord FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Documento não encontrado.'; END IF;

  FOR r IN SELECT item_id, quantity FROM public.order_items
           WHERE order_id = p_order_id AND item_id IS NOT NULL LOOP
    SELECT * INTO inv FROM public.inventory_items WHERE id = r.item_id FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;

    IF p_action = 'reservar' THEN
      IF (inv.quantity - inv.reserved) < r.quantity THEN
        RAISE EXCEPTION 'Estoque insuficiente para %: % disponível.', inv.name, (inv.quantity - inv.reserved);
      END IF;
      UPDATE public.inventory_items SET reserved = reserved + r.quantity WHERE id = inv.id;
      INSERT INTO public.inventory_movements(item_id, user_id, movement_type, quantity, reason, document_type, document_id, document_number)
      VALUES (inv.id, p_user_id, 'reserva', r.quantity, 'Reserva do pré-pedido', ord.kind, ord.id, ord.number);

    ELSIF p_action = 'baixar' THEN
      IF (inv.quantity - inv.reserved) < r.quantity THEN
        RAISE EXCEPTION 'Estoque insuficiente para %: % disponível.', inv.name, (inv.quantity - inv.reserved);
      END IF;
      UPDATE public.inventory_items SET quantity = quantity - r.quantity WHERE id = inv.id;
      INSERT INTO public.inventory_movements(item_id, user_id, movement_type, quantity, reason, document_type, document_id, document_number)
      VALUES (inv.id, p_user_id, 'saida', r.quantity, 'Saída por venda', ord.kind, ord.id, ord.number);

    ELSIF p_action = 'baixar_reservado' THEN
      UPDATE public.inventory_items
        SET reserved = GREATEST(0, reserved - r.quantity),
            quantity = quantity - r.quantity
        WHERE id = inv.id;
      INSERT INTO public.inventory_movements(item_id, user_id, movement_type, quantity, reason, document_type, document_id, document_number)
      VALUES (inv.id, p_user_id, 'saida', r.quantity, 'Faturamento do pré-pedido', ord.kind, ord.id, ord.number);

    ELSIF p_action = 'liberar' THEN
      UPDATE public.inventory_items SET reserved = GREATEST(0, reserved - r.quantity) WHERE id = inv.id;
      INSERT INTO public.inventory_movements(item_id, user_id, movement_type, quantity, reason, document_type, document_id, document_number)
      VALUES (inv.id, p_user_id, 'liberacao', r.quantity, 'Reserva liberada', ord.kind, ord.id, ord.number);

    ELSIF p_action = 'estornar' THEN
      UPDATE public.inventory_items SET quantity = quantity + r.quantity WHERE id = inv.id;
      INSERT INTO public.inventory_movements(item_id, user_id, movement_type, quantity, reason, document_type, document_id, document_number)
      VALUES (inv.id, p_user_id, 'entrada', r.quantity, 'Estorno de cancelamento', ord.kind, ord.id, ord.number);
    END IF;
  END LOOP;
END $$;

-- 4. Criação de documento --------------------------------------------------
CREATE OR REPLACE FUNCTION public.sales_create_document(
  p_kind text,
  p_customer_id uuid,
  p_product_id uuid,
  p_currency currency_code,
  p_discount numeric,
  p_notes text,
  p_payment_method text,
  p_payment_installments text,
  p_valid_until date,
  p_whatsapp text,
  p_origin text,
  p_items jsonb,
  p_payments jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  gross numeric := 0;
  total numeric := 0;
  paid numeric := 0;
  n integer;
  new_id uuid;
  it jsonb;
  pay jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF p_kind NOT IN ('venda','orcamento','pre_pedido') THEN
    RAISE EXCEPTION 'Tipo de documento inválido.';
  END IF;
  IF p_product_id IS NOT NULL AND NOT public.has_product_access(uid, p_product_id) THEN
    RAISE EXCEPTION 'Sem permissão para esta categoria.';
  END IF;
  IF p_kind <> 'venda' AND p_customer_id IS NULL THEN
    RAISE EXCEPTION 'Cliente é obrigatório para orçamento e pré-pedido.';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Inclua pelo menos um item.';
  END IF;

  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF COALESCE((it->>'quantity')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'Quantidade inválida em um dos itens.';
    END IF;
    gross := gross + GREATEST(0, round(
      (it->>'quantity')::numeric * COALESCE((it->>'unit_price')::numeric,0)
      - COALESCE((it->>'discount')::numeric,0), 2));
  END LOOP;
  total := GREATEST(0, round(gross - COALESCE(p_discount,0), 2));

  IF p_kind = 'orcamento' THEN
    n := public.sales_next_number('quotes');
    INSERT INTO public.quotes(number, customer_id, product_id, seller_id, currency, discount,
      total, valid_until, status, notes, payment_method, payment_installments, whatsapp, origin)
    VALUES (n, p_customer_id, p_product_id, uid, p_currency, COALESCE(p_discount,0),
      total, p_valid_until, 'rascunho', p_notes, p_payment_method, p_payment_installments,
      p_whatsapp, COALESCE(p_origin,'pdv'))
    RETURNING id INTO new_id;

    INSERT INTO public.quote_items(quote_id, item_id, description, sku, barcode, unit, quantity, unit_price, discount, total)
    SELECT new_id, NULLIF(it->>'item_id','')::uuid, it->>'description', it->>'sku', it->>'barcode',
           it->>'unit', (it->>'quantity')::numeric, COALESCE((it->>'unit_price')::numeric,0),
           COALESCE((it->>'discount')::numeric,0),
           GREATEST(0, round((it->>'quantity')::numeric * COALESCE((it->>'unit_price')::numeric,0)
             - COALESCE((it->>'discount')::numeric,0), 2))
    FROM jsonb_array_elements(p_items) it;

    RETURN jsonb_build_object('id', new_id, 'number', n, 'kind', p_kind, 'total', total);
  END IF;

  n := public.sales_next_number('orders');
  INSERT INTO public.orders(number, customer_id, product_id, seller_id, currency, discount, total,
    status, kind, stock_state, notes, payment_method, payment_installments, whatsapp, origin, order_date)
  VALUES (n, p_customer_id, p_product_id, uid, p_currency, COALESCE(p_discount,0), total,
    CASE WHEN p_kind = 'venda' THEN 'faturado' ELSE 'pre_pedido' END,
    p_kind,
    CASE WHEN p_kind = 'venda' THEN 'baixado' ELSE 'reservado' END,
    p_notes, p_payment_method, p_payment_installments, p_whatsapp, COALESCE(p_origin,'pdv'), CURRENT_DATE)
  RETURNING id INTO new_id;

  INSERT INTO public.order_items(order_id, item_id, description, sku, barcode, unit, quantity, unit_price, discount, total)
  SELECT new_id, NULLIF(it->>'item_id','')::uuid, it->>'description', it->>'sku', it->>'barcode',
         it->>'unit', (it->>'quantity')::numeric, COALESCE((it->>'unit_price')::numeric,0),
         COALESCE((it->>'discount')::numeric,0),
         GREATEST(0, round((it->>'quantity')::numeric * COALESCE((it->>'unit_price')::numeric,0)
           - COALESCE((it->>'discount')::numeric,0), 2))
  FROM jsonb_array_elements(p_items) it;

  IF p_kind = 'venda' THEN
    PERFORM public.sales_apply_stock(new_id, 'baixar', uid);
    IF p_payments IS NULL OR jsonb_array_length(p_payments) = 0 THEN
      RAISE EXCEPTION 'Informe os pagamentos da venda.';
    END IF;
    SELECT COALESCE(round(sum(COALESCE((x->>'amount')::numeric,0)),2),0)
      INTO paid FROM jsonb_array_elements(p_payments) x;
    IF paid <> total THEN
      RAISE EXCEPTION 'A soma dos pagamentos (%) precisa ser igual ao total (%).', paid, total;
    END IF;
    FOR pay IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
      INSERT INTO public.payments(order_id, amount, currency, method, paid_at, installment, status)
      VALUES (new_id, round((pay->>'amount')::numeric,2), p_currency, pay->>'method',
              CURRENT_DATE, NULLIF(pay->>'installment','')::integer, 'pago');
    END LOOP;
  ELSE
    PERFORM public.sales_apply_stock(new_id, 'reservar', uid);
  END IF;

  RETURN jsonb_build_object('id', new_id, 'number', n, 'kind', p_kind, 'total', total);
END $$;

-- 5. Conversão de orçamento ------------------------------------------------
CREATE OR REPLACE FUNCTION public.sales_convert_quote(
  p_quote_id uuid,
  p_kind text,          -- 'venda' | 'pre_pedido'
  p_payments jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  q record;
  items jsonb;
  res jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  SELECT * INTO q FROM public.quotes WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orçamento não encontrado.'; END IF;
  IF NOT public.sales_can_manage(uid, q.seller_id) THEN
    RAISE EXCEPTION 'Sem permissão para converter este orçamento.';
  END IF;
  IF q.converted_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este orçamento já foi convertido.';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'item_id', item_id, 'description', description, 'sku', sku, 'barcode', barcode,
    'unit', unit, 'quantity', quantity, 'unit_price', unit_price, 'discount', discount)), '[]'::jsonb)
  INTO items FROM public.quote_items WHERE quote_id = p_quote_id;

  res := public.sales_create_document(p_kind, q.customer_id, q.product_id, q.currency,
    q.discount, q.notes, q.payment_method, q.payment_installments, NULL, q.whatsapp,
    'orcamento', items, p_payments);

  UPDATE public.quotes
    SET status = 'aprovado', converted_order_id = (res->>'id')::uuid, converted_at = now()
    WHERE id = p_quote_id;

  RETURN res;
END $$;

-- 6. Faturar pré-pedido ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.sales_invoice_preorder(
  p_order_id uuid,
  p_payments jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  o record;
  paid numeric := 0;
  pay jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pré-pedido não encontrado.'; END IF;
  IF NOT public.sales_can_manage(uid, o.seller_id) THEN
    RAISE EXCEPTION 'Sem permissão para faturar este pré-pedido.';
  END IF;
  IF o.stock_state <> 'reservado' THEN
    RAISE EXCEPTION 'Este documento não está com estoque reservado.';
  END IF;

  IF p_payments IS NULL OR jsonb_array_length(p_payments) = 0 THEN
    RAISE EXCEPTION 'Informe os pagamentos da venda.';
  END IF;
  SELECT COALESCE(round(sum(COALESCE((x->>'amount')::numeric,0)),2),0)
    INTO paid FROM jsonb_array_elements(p_payments) x;
  IF paid <> round(o.total,2) THEN
    RAISE EXCEPTION 'A soma dos pagamentos (%) precisa ser igual ao total (%).', paid, o.total;
  END IF;

  PERFORM public.sales_apply_stock(p_order_id, 'baixar_reservado', uid);

  FOR pay IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
    INSERT INTO public.payments(order_id, amount, currency, method, paid_at, installment, status)
    VALUES (p_order_id, round((pay->>'amount')::numeric,2), o.currency, pay->>'method',
            CURRENT_DATE, NULLIF(pay->>'installment','')::integer, 'pago');
  END LOOP;

  UPDATE public.orders
    SET kind = 'venda', status = 'faturado', stock_state = 'baixado'
    WHERE id = p_order_id;

  RETURN jsonb_build_object('id', p_order_id, 'number', o.number, 'kind', 'venda');
END $$;

-- 7. Cancelamento ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sales_cancel_order(
  p_order_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  o record;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'Descreva o motivo do cancelamento (mínimo 5 caracteres).';
  END IF;
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Documento não encontrado.'; END IF;
  IF NOT public.sales_can_manage(uid, o.seller_id) THEN
    RAISE EXCEPTION 'Sem permissão para cancelar este documento.';
  END IF;
  IF o.status = 'cancelado' THEN
    RAISE EXCEPTION 'Este documento já está cancelado.';
  END IF;

  IF o.stock_state = 'reservado' THEN
    PERFORM public.sales_apply_stock(p_order_id, 'liberar', uid);
  ELSIF o.stock_state = 'baixado' THEN
    PERFORM public.sales_apply_stock(p_order_id, 'estornar', uid);
  END IF;

  UPDATE public.payments SET status = 'cancelado' WHERE order_id = p_order_id;
  UPDATE public.accounts_receivable SET status = 'cancelado' WHERE order_id = p_order_id;

  UPDATE public.orders
    SET status = 'cancelado', stock_state = 'nenhum', cancel_reason = p_reason,
        cancelled_at = now(), cancelled_by = uid
    WHERE id = p_order_id;

  RETURN jsonb_build_object('id', p_order_id, 'status', 'cancelado');
END $$;

-- 8. Cancelar orçamento ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.sales_cancel_quote(p_quote_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE uid uuid := auth.uid(); q record;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  SELECT * INTO q FROM public.quotes WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orçamento não encontrado.'; END IF;
  IF NOT public.sales_can_manage(uid, q.seller_id) THEN
    RAISE EXCEPTION 'Sem permissão para recusar este orçamento.';
  END IF;
  UPDATE public.quotes
    SET status = 'recusado',
        notes = COALESCE(notes || E'\n', '') || 'Recusado: ' || COALESCE(p_reason,'')
    WHERE id = p_quote_id;
  RETURN jsonb_build_object('id', p_quote_id, 'status', 'recusado');
END $$;

-- 9. Privilégios mínimos ---------------------------------------------------
REVOKE ALL ON FUNCTION public.sales_next_number(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sales_apply_stock(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sales_can_manage(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sales_create_document(text, uuid, uuid, currency_code, numeric, text, text, text, date, text, text, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sales_convert_quote(uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sales_invoice_preorder(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sales_cancel_order(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sales_cancel_quote(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.sales_create_document(text, uuid, uuid, currency_code, numeric, text, text, text, date, text, text, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_convert_quote(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_invoice_preorder(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_cancel_order(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_cancel_quote(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_can_manage(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_next_number(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_apply_stock(uuid, text, uuid) TO service_role;