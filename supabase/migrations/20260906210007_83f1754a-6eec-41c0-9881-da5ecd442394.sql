CREATE OR REPLACE FUNCTION public.sales_can_manage(_user_id uuid, _seller_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT _user_id IS NOT NULL AND _user_id = auth.uid() AND (
    _user_id = _seller_id
    OR public.is_admin(_user_id)
    OR public.has_role(_user_id, 'gestor')
    OR public.has_role(_user_id, 'financeiro')
  )
$$;

CREATE OR REPLACE FUNCTION public.sales_sees_all(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT _user_id IS NOT NULL AND _user_id = auth.uid() AND (
    public.is_admin(_user_id)
    OR public.has_role(_user_id, 'gestor')
    OR public.has_role(_user_id, 'financeiro')
  )
$$;

CREATE OR REPLACE FUNCTION public.sales_apply_stock(p_order_id uuid, p_action text, p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r record; inv record; ord record;
BEGIN
  SELECT * INTO ord FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Documento não encontrado.'; END IF;

  FOR r IN SELECT item_id, quantity FROM public.order_items
           WHERE order_id = p_order_id AND item_id IS NOT NULL LOOP
    SELECT * INTO inv FROM public.inventory_items WHERE id = r.item_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Item de estoque não encontrado.'; END IF;

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
      IF inv.reserved < r.quantity OR inv.quantity < r.quantity THEN
        RAISE EXCEPTION 'Reserva inconsistente para %. Verifique o estoque antes de faturar.', inv.name;
      END IF;
      UPDATE public.inventory_items
        SET reserved = reserved - r.quantity, quantity = quantity - r.quantity WHERE id = inv.id;
      INSERT INTO public.inventory_movements(item_id, user_id, movement_type, quantity, reason, document_type, document_id, document_number)
      VALUES (inv.id, p_user_id, 'saida', r.quantity, 'Faturamento do pré-pedido', ord.kind, ord.id, ord.number);

    ELSIF p_action = 'liberar' THEN
      IF inv.reserved < r.quantity THEN
        RAISE EXCEPTION 'Reserva inconsistente para %.', inv.name;
      END IF;
      UPDATE public.inventory_items SET reserved = reserved - r.quantity WHERE id = inv.id;
      INSERT INTO public.inventory_movements(item_id, user_id, movement_type, quantity, reason, document_type, document_id, document_number)
      VALUES (inv.id, p_user_id, 'liberacao', r.quantity, 'Reserva liberada', ord.kind, ord.id, ord.number);

    ELSIF p_action = 'estornar' THEN
      UPDATE public.inventory_items SET quantity = quantity + r.quantity WHERE id = inv.id;
      INSERT INTO public.inventory_movements(item_id, user_id, movement_type, quantity, reason, document_type, document_id, document_number)
      VALUES (inv.id, p_user_id, 'entrada', r.quantity, 'Estorno de cancelamento', ord.kind, ord.id, ord.number);
    ELSE
      RAISE EXCEPTION 'Ação de estoque inválida.';
    END IF;
  END LOOP;
END $$;

-- Validação de itens contra a categoria/escopo
CREATE OR REPLACE FUNCTION public.sales_validate_items(p_user_id uuid, p_product_id uuid, p_items jsonb)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE li jsonb; inv record; iid uuid;
BEGIN
  FOR li IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF coalesce((li->>'quantity')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'Quantidade inválida em um dos itens.';
    END IF;
    IF coalesce((li->>'unit_price')::numeric, 0) < 0 OR coalesce((li->>'discount')::numeric, 0) < 0 THEN
      RAISE EXCEPTION 'Preço ou desconto inválido em um dos itens.';
    END IF;
    IF coalesce((li->>'discount')::numeric,0) >
       coalesce((li->>'quantity')::numeric,0) * coalesce((li->>'unit_price')::numeric,0) THEN
      RAISE EXCEPTION 'Desconto maior que o valor do item.';
    END IF;
    iid := nullif(li->>'item_id','')::uuid;
    IF iid IS NOT NULL THEN
      SELECT * INTO inv FROM public.inventory_items WHERE id = iid AND is_active;
      IF NOT FOUND THEN RAISE EXCEPTION 'Item indisponível.'; END IF;
      IF p_product_id IS NOT NULL AND inv.product_id IS DISTINCT FROM p_product_id THEN
        RAISE EXCEPTION 'O item % não pertence à categoria selecionada.', inv.name;
      END IF;
      IF inv.product_id IS NOT NULL AND NOT public.has_product_access(p_user_id, inv.product_id) THEN
        RAISE EXCEPTION 'Sem permissão para vender o item %.', inv.name;
      END IF;
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.sales_create_document(p_kind text, p_customer_id uuid, p_product_id uuid,
  p_currency public.currency_code, p_discount numeric, p_notes text, p_payment_method text,
  p_payment_installments text, p_valid_until date, p_whatsapp text, p_origin text, p_items jsonb, p_payments jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid uuid := auth.uid();
  gross numeric := 0; total numeric := 0; paid numeric := 0;
  n integer; new_id uuid; li jsonb; pay jsonb; amount numeric;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF p_kind NOT IN ('venda','orcamento','pre_pedido') THEN RAISE EXCEPTION 'Tipo de documento inválido.'; END IF;
  IF coalesce(p_discount,0) < 0 THEN RAISE EXCEPTION 'Desconto inválido.'; END IF;
  IF p_product_id IS NULL AND NOT public.is_admin(uid) AND NOT public.has_role(uid,'gestor') THEN
    RAISE EXCEPTION 'Selecione a categoria do documento.';
  END IF;
  IF p_product_id IS NOT NULL AND NOT public.has_product_access(uid, p_product_id) THEN
    RAISE EXCEPTION 'Sem permissão para esta categoria.';
  END IF;
  IF p_kind <> 'venda' AND p_customer_id IS NULL THEN
    RAISE EXCEPTION 'Cliente é obrigatório para orçamento e pré-pedido.';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'Inclua pelo menos um item.'; END IF;

  PERFORM public.sales_validate_items(uid, p_product_id, p_items);

  FOR li IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    gross := gross + greatest(0, round((li->>'quantity')::numeric * coalesce((li->>'unit_price')::numeric,0)
      - coalesce((li->>'discount')::numeric,0), 2));
  END LOOP;
  IF coalesce(p_discount,0) > gross THEN RAISE EXCEPTION 'Desconto maior que o total do documento.'; END IF;
  total := greatest(0, round(gross - coalesce(p_discount,0), 2));

  IF p_kind = 'orcamento' THEN
    n := public.sales_next_number('quotes');
    INSERT INTO public.quotes(number, customer_id, product_id, seller_id, currency, discount, total,
      valid_until, status, notes, payment_method, payment_installments, whatsapp, origin)
    VALUES (n, p_customer_id, p_product_id, uid, p_currency, coalesce(p_discount,0), total, p_valid_until,
      'rascunho', p_notes, p_payment_method, p_payment_installments, p_whatsapp, coalesce(p_origin,'pdv'))
    RETURNING id INTO new_id;

    INSERT INTO public.quote_items(quote_id, item_id, description, sku, barcode, unit, quantity, unit_price, discount, total)
    SELECT new_id, nullif(e.value->>'item_id','')::uuid, e.value->>'description', e.value->>'sku',
      e.value->>'barcode', e.value->>'unit', (e.value->>'quantity')::numeric,
      coalesce((e.value->>'unit_price')::numeric,0), coalesce((e.value->>'discount')::numeric,0),
      greatest(0, round((e.value->>'quantity')::numeric * coalesce((e.value->>'unit_price')::numeric,0)
        - coalesce((e.value->>'discount')::numeric,0), 2))
    FROM jsonb_array_elements(p_items) AS e(value);

    RETURN jsonb_build_object('id', new_id, 'number', n, 'kind', p_kind, 'total', total);
  END IF;

  n := public.sales_next_number('orders');
  INSERT INTO public.orders(number, customer_id, product_id, seller_id, currency, discount, total,
    status, kind, stock_state, notes, payment_method, payment_installments, whatsapp, origin, order_date)
  VALUES (n, p_customer_id, p_product_id, uid, p_currency, coalesce(p_discount,0), total,
    CASE WHEN p_kind = 'venda' THEN 'faturado' ELSE 'pre_pedido' END, p_kind,
    CASE WHEN p_kind = 'venda' THEN 'baixado' ELSE 'reservado' END,
    p_notes, p_payment_method, p_payment_installments, p_whatsapp, coalesce(p_origin,'pdv'), CURRENT_DATE)
  RETURNING id INTO new_id;

  INSERT INTO public.order_items(order_id, item_id, description, sku, barcode, unit, quantity, unit_price, discount, total)
  SELECT new_id, nullif(e.value->>'item_id','')::uuid, e.value->>'description', e.value->>'sku',
    e.value->>'barcode', e.value->>'unit', (e.value->>'quantity')::numeric,
    coalesce((e.value->>'unit_price')::numeric,0), coalesce((e.value->>'discount')::numeric,0),
    greatest(0, round((e.value->>'quantity')::numeric * coalesce((e.value->>'unit_price')::numeric,0)
      - coalesce((e.value->>'discount')::numeric,0), 2))
  FROM jsonb_array_elements(p_items) AS e(value);

  IF p_kind = 'venda' THEN
    PERFORM public.sales_apply_stock(new_id, 'baixar', uid);
    IF p_payments IS NULL OR jsonb_array_length(p_payments) = 0 THEN
      RAISE EXCEPTION 'Informe os pagamentos da venda.';
    END IF;
    FOR pay IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
      amount := coalesce((pay->>'amount')::numeric, 0);
      IF amount <= 0 THEN RAISE EXCEPTION 'Valor de pagamento inválido.'; END IF;
      IF coalesce(btrim(pay->>'method'),'') = '' THEN RAISE EXCEPTION 'Informe a forma de pagamento.'; END IF;
      paid := paid + round(amount, 2);
    END LOOP;
    IF round(paid,2) <> total THEN
      RAISE EXCEPTION 'A soma dos pagamentos (%) precisa ser igual ao total (%).', paid, total;
    END IF;
    FOR pay IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
      INSERT INTO public.payments(order_id, amount, currency, method, paid_at, installment, status)
      VALUES (new_id, round((pay->>'amount')::numeric,2), p_currency, pay->>'method',
              CURRENT_DATE, nullif(pay->>'installment','')::integer, 'pago');
    END LOOP;
  ELSE
    PERFORM public.sales_apply_stock(new_id, 'reservar', uid);
  END IF;

  RETURN jsonb_build_object('id', new_id, 'number', n, 'kind', p_kind, 'total', total);
END $$;

CREATE OR REPLACE FUNCTION public.sales_invoice_preorder(p_order_id uuid, p_payments jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := auth.uid(); o record; paid numeric := 0; pay jsonb; amount numeric;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pré-pedido não encontrado.'; END IF;
  IF NOT public.sales_can_manage(uid, o.seller_id) THEN
    RAISE EXCEPTION 'Sem permissão para faturar este pré-pedido.';
  END IF;
  IF o.status = 'faturado' AND o.stock_state = 'baixado' THEN
    RETURN jsonb_build_object('id', p_order_id, 'number', o.number, 'kind', 'venda', 'duplicated', true);
  END IF;
  IF o.status = 'cancelado' THEN RAISE EXCEPTION 'Documento cancelado não pode ser faturado.'; END IF;
  IF o.kind <> 'pre_pedido' OR o.stock_state <> 'reservado' THEN
    RAISE EXCEPTION 'Este documento não está com estoque reservado.';
  END IF;
  IF p_payments IS NULL OR jsonb_array_length(p_payments) = 0 THEN
    RAISE EXCEPTION 'Informe os pagamentos da venda.';
  END IF;
  FOR pay IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
    amount := coalesce((pay->>'amount')::numeric, 0);
    IF amount <= 0 THEN RAISE EXCEPTION 'Valor de pagamento inválido.'; END IF;
    IF coalesce(btrim(pay->>'method'),'') = '' THEN RAISE EXCEPTION 'Informe a forma de pagamento.'; END IF;
    paid := paid + round(amount, 2);
  END LOOP;
  IF paid <> round(o.total,2) THEN
    RAISE EXCEPTION 'A soma dos pagamentos (%) precisa ser igual ao total (%).', paid, o.total;
  END IF;

  PERFORM public.sales_apply_stock(p_order_id, 'baixar_reservado', uid);

  FOR pay IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
    INSERT INTO public.payments(order_id, amount, currency, method, paid_at, installment, status)
    VALUES (p_order_id, round((pay->>'amount')::numeric,2), o.currency, pay->>'method',
            CURRENT_DATE, nullif(pay->>'installment','')::integer, 'pago');
  END LOOP;

  UPDATE public.orders SET kind = 'venda', status = 'faturado', stock_state = 'baixado'
    WHERE id = p_order_id;
  RETURN jsonb_build_object('id', p_order_id, 'number', o.number, 'kind', 'venda');
END $$;

CREATE OR REPLACE FUNCTION public.sales_cancel_order(p_order_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := auth.uid(); o record;
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
    RETURN jsonb_build_object('id', p_order_id, 'status', 'cancelado', 'duplicated', true);
  END IF;

  IF o.stock_state = 'reservado' THEN
    PERFORM public.sales_apply_stock(p_order_id, 'liberar', uid);
  ELSIF o.stock_state = 'baixado' THEN
    PERFORM public.sales_apply_stock(p_order_id, 'estornar', uid);
  END IF;

  UPDATE public.payments SET status = 'cancelado' WHERE order_id = p_order_id;
  UPDATE public.accounts_receivable SET status = 'cancelado' WHERE order_id = p_order_id;
  UPDATE public.orders SET status = 'cancelado', stock_state = 'nenhum', cancel_reason = p_reason,
    cancelled_at = now(), cancelled_by = uid WHERE id = p_order_id;

  RETURN jsonb_build_object('id', p_order_id, 'status', 'cancelado');
END $$;

CREATE OR REPLACE FUNCTION public.sales_cancel_quote(p_quote_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := auth.uid(); q record;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  SELECT * INTO q FROM public.quotes WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orçamento não encontrado.'; END IF;
  IF NOT public.sales_can_manage(uid, q.seller_id) THEN
    RAISE EXCEPTION 'Sem permissão para recusar este orçamento.';
  END IF;
  IF q.status IN ('recusado','convertido') THEN
    RETURN jsonb_build_object('id', p_quote_id, 'status', q.status, 'duplicated', true);
  END IF;
  UPDATE public.quotes SET status = 'recusado',
    notes = coalesce(notes || E'\n', '') || 'Recusado: ' || coalesce(p_reason,'')
    WHERE id = p_quote_id;
  RETURN jsonb_build_object('id', p_quote_id, 'status', 'recusado');
END $$;

CREATE OR REPLACE FUNCTION public.sales_convert_quote(p_quote_id uuid, p_kind text, p_payments jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := auth.uid(); q record; items jsonb; res jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  SELECT * INTO q FROM public.quotes WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orçamento não encontrado.'; END IF;
  IF NOT public.sales_can_manage(uid, q.seller_id) THEN
    RAISE EXCEPTION 'Sem permissão para converter este orçamento.';
  END IF;
  IF q.converted_order_id IS NOT NULL THEN RAISE EXCEPTION 'Este orçamento já foi convertido.'; END IF;
  IF q.status = 'recusado' THEN RAISE EXCEPTION 'Orçamento recusado não pode ser convertido.'; END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'item_id', item_id, 'description', description, 'sku', sku, 'barcode', barcode,
    'unit', unit, 'quantity', quantity, 'unit_price', unit_price, 'discount', discount)), '[]'::jsonb)
  INTO items FROM public.quote_items WHERE quote_id = p_quote_id;

  res := public.sales_create_document(p_kind, q.customer_id, q.product_id, q.currency, q.discount,
    q.notes, q.payment_method, q.payment_installments, NULL, q.whatsapp, 'orcamento', items, p_payments);

  UPDATE public.quotes SET status = 'convertido', converted_order_id = (res->>'id')::uuid,
    converted_at = now() WHERE id = p_quote_id;
  RETURN res;
END $$;

-- Substituição transacional de itens (editar/reabrir)
CREATE OR REPLACE FUNCTION public.sales_replace_items(p_doc_type text, p_doc_id uuid, p_items jsonb, p_discount numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid uuid := auth.uid(); o record; q record; gross numeric := 0; total numeric := 0; li jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'Inclua pelo menos um item.'; END IF;

  IF p_doc_type = 'orcamento' THEN
    SELECT * INTO q FROM public.quotes WHERE id = p_doc_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Orçamento não encontrado.'; END IF;
    IF NOT public.sales_can_manage(uid, q.seller_id) THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
    IF q.status IN ('convertido','recusado') THEN RAISE EXCEPTION 'Este orçamento não pode mais ser editado.'; END IF;
    PERFORM public.sales_validate_items(uid, q.product_id, p_items);
    FOR li IN SELECT * FROM jsonb_array_elements(p_items) LOOP
      gross := gross + greatest(0, round((li->>'quantity')::numeric * coalesce((li->>'unit_price')::numeric,0)
        - coalesce((li->>'discount')::numeric,0), 2));
    END LOOP;
    IF coalesce(p_discount,0) > gross THEN RAISE EXCEPTION 'Desconto maior que o total.'; END IF;
    total := greatest(0, round(gross - coalesce(p_discount,0), 2));
    DELETE FROM public.quote_items WHERE quote_id = p_doc_id;
    INSERT INTO public.quote_items(quote_id, item_id, description, sku, barcode, unit, quantity, unit_price, discount, total)
    SELECT p_doc_id, nullif(e.value->>'item_id','')::uuid, e.value->>'description', e.value->>'sku',
      e.value->>'barcode', e.value->>'unit', (e.value->>'quantity')::numeric,
      coalesce((e.value->>'unit_price')::numeric,0), coalesce((e.value->>'discount')::numeric,0),
      greatest(0, round((e.value->>'quantity')::numeric * coalesce((e.value->>'unit_price')::numeric,0)
        - coalesce((e.value->>'discount')::numeric,0), 2))
    FROM jsonb_array_elements(p_items) AS e(value);
    UPDATE public.quotes SET discount = coalesce(p_discount,0), total = total WHERE id = p_doc_id;
    RETURN jsonb_build_object('id', p_doc_id, 'total', total);
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = p_doc_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Documento não encontrado.'; END IF;
  IF NOT public.sales_can_manage(uid, o.seller_id) THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
  IF o.kind <> 'pre_pedido' OR o.status <> 'pre_pedido' OR o.stock_state <> 'reservado' THEN
    RAISE EXCEPTION 'Somente pré-pedidos reservados podem ser editados.';
  END IF;

  PERFORM public.sales_validate_items(uid, o.product_id, p_items);
  -- devolve a reserva antiga e aplica a nova na mesma transação
  PERFORM public.sales_apply_stock(p_doc_id, 'liberar', uid);
  DELETE FROM public.order_items WHERE order_id = p_doc_id;

  FOR li IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    gross := gross + greatest(0, round((li->>'quantity')::numeric * coalesce((li->>'unit_price')::numeric,0)
      - coalesce((li->>'discount')::numeric,0), 2));
  END LOOP;
  IF coalesce(p_discount,0) > gross THEN RAISE EXCEPTION 'Desconto maior que o total.'; END IF;
  total := greatest(0, round(gross - coalesce(p_discount,0), 2));

  INSERT INTO public.order_items(order_id, item_id, description, sku, barcode, unit, quantity, unit_price, discount, total)
  SELECT p_doc_id, nullif(e.value->>'item_id','')::uuid, e.value->>'description', e.value->>'sku',
    e.value->>'barcode', e.value->>'unit', (e.value->>'quantity')::numeric,
    coalesce((e.value->>'unit_price')::numeric,0), coalesce((e.value->>'discount')::numeric,0),
    greatest(0, round((e.value->>'quantity')::numeric * coalesce((e.value->>'unit_price')::numeric,0)
      - coalesce((e.value->>'discount')::numeric,0), 2))
  FROM jsonb_array_elements(p_items) AS e(value);

  UPDATE public.orders SET discount = coalesce(p_discount,0), total = total WHERE id = p_doc_id;
  PERFORM public.sales_apply_stock(p_doc_id, 'reservar', uid);
  RETURN jsonb_build_object('id', p_doc_id, 'total', total);
END $$;

REVOKE ALL ON FUNCTION public.sales_validate_items(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sales_replace_items(text, uuid, jsonb, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_replace_items(text, uuid, jsonb, numeric) TO authenticated;