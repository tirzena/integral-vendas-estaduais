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
  li jsonb;
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

  FOR li IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF COALESCE((li->>'quantity')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'Quantidade inválida em um dos itens.';
    END IF;
    gross := gross + GREATEST(0, round(
      (li->>'quantity')::numeric * COALESCE((li->>'unit_price')::numeric,0)
      - COALESCE((li->>'discount')::numeric,0), 2));
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
    SELECT new_id, NULLIF(e.value->>'item_id','')::uuid, e.value->>'description', e.value->>'sku',
           e.value->>'barcode', e.value->>'unit', (e.value->>'quantity')::numeric,
           COALESCE((e.value->>'unit_price')::numeric,0), COALESCE((e.value->>'discount')::numeric,0),
           GREATEST(0, round((e.value->>'quantity')::numeric * COALESCE((e.value->>'unit_price')::numeric,0)
             - COALESCE((e.value->>'discount')::numeric,0), 2))
    FROM jsonb_array_elements(p_items) AS e(value);

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
  SELECT new_id, NULLIF(e.value->>'item_id','')::uuid, e.value->>'description', e.value->>'sku',
         e.value->>'barcode', e.value->>'unit', (e.value->>'quantity')::numeric,
         COALESCE((e.value->>'unit_price')::numeric,0), COALESCE((e.value->>'discount')::numeric,0),
         GREATEST(0, round((e.value->>'quantity')::numeric * COALESCE((e.value->>'unit_price')::numeric,0)
           - COALESCE((e.value->>'discount')::numeric,0), 2))
  FROM jsonb_array_elements(p_items) AS e(value);

  IF p_kind = 'venda' THEN
    PERFORM public.sales_apply_stock(new_id, 'baixar', uid);
    IF p_payments IS NULL OR jsonb_array_length(p_payments) = 0 THEN
      RAISE EXCEPTION 'Informe os pagamentos da venda.';
    END IF;
    SELECT COALESCE(round(sum(COALESCE((x.value->>'amount')::numeric,0)),2),0)
      INTO paid FROM jsonb_array_elements(p_payments) AS x(value);
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
  SELECT COALESCE(round(sum(COALESCE((x.value->>'amount')::numeric,0)),2),0)
    INTO paid FROM jsonb_array_elements(p_payments) AS x(value);
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

REVOKE EXECUTE ON FUNCTION public.sales_create_document(text, uuid, uuid, currency_code, numeric, text, text, text, date, text, text, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sales_invoice_preorder(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_create_document(text, uuid, uuid, currency_code, numeric, text, text, text, date, text, text, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_invoice_preorder(uuid, jsonb) TO authenticated;