-- Registra cotação própria de cada pagamento sem modificar a cotação histórica do pedido.
CREATE OR REPLACE FUNCTION public.sales_payment_received_manual(p_args jsonb, p_exchange jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_amount numeric;
  v_credited numeric;
  v_rate numeric;
  v_currency text;
  v_result jsonb;
  v_payment_id uuid;
BEGIN
  IF auth.uid() IS NULL OR private.seller_is_restricted(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para registrar este pagamento.';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = (p_args->>'order_id')::uuid
  FOR UPDATE;
  IF v_order.id IS NULL
     OR v_order.status = 'cancelado'
     OR v_order.deleted_at IS NOT NULL
     OR NOT public.sales_can_manage(auth.uid(), v_order.seller_id) THEN
    RAISE EXCEPTION 'Sem permissão para registrar pagamento neste pedido.';
  END IF;

  IF p_exchange->>'mode' IS DISTINCT FROM 'manual'
     OR p_exchange->>'base' IS DISTINCT FROM v_order.currency::text THEN
    RAISE EXCEPTION 'Cotação manual inválida para a moeda do pedido.';
  END IF;
  FOREACH v_currency IN ARRAY ARRAY['BRL', 'USD', 'PYG'] LOOP
    v_rate := (p_exchange->>v_currency)::numeric;
    IF v_rate IS NULL OR v_rate <= 0 OR v_rate::text IN ('NaN', 'Infinity', '-Infinity') THEN
      RAISE EXCEPTION 'Informe cotações maiores que zero.';
    END IF;
  END LOOP;
  IF abs((p_exchange->>v_order.currency::text)::numeric - 1) > 0.00000001 THEN
    RAISE EXCEPTION 'Cotação inválida para a moeda base.';
  END IF;

  v_amount := round((p_args->>'amount')::numeric, 2);
  IF v_amount IS NULL OR v_amount <= 0 OR v_amount::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'Informe um valor recebido maior que zero.';
  END IF;
  IF coalesce(btrim(p_args->>'method'), '') = '' THEN
    RAISE EXCEPTION 'Escolha a forma de pagamento.';
  END IF;

  IF lower(btrim(p_args->>'method')) = 'pix' THEN
    v_credited := round(v_amount / (p_exchange->>'BRL')::numeric, 2);
  ELSE
    v_credited := v_amount;
  END IF;
  IF v_credited <= 0 THEN
    RAISE EXCEPTION 'O valor convertido precisa ser maior que zero.';
  END IF;

  -- A função existente mantém as validações, o comprovante, o saldo e o histórico.
  v_result := public.sales_register_payment(
    v_order.id, v_credited, p_args->>'method', (p_args->>'proof_id')::uuid
  );
  v_payment_id := (v_result->>'payment_id')::uuid;
  IF v_payment_id IS NULL THEN
    RAISE EXCEPTION 'O registro do pagamento não retornou um identificador.';
  END IF;

  -- Os gatilhos de criação usam a cotação do pedido; a atualização abaixo
  -- substitui somente os dados de câmbio deste pagamento na mesma transação.
  UPDATE public.payments
  SET received_amount = CASE WHEN lower(btrim(p_args->>'method')) = 'pix'
                             THEN v_amount ELSE v_credited END,
      received_currency = CASE WHEN lower(btrim(p_args->>'method')) = 'pix'
                               THEN 'BRL'::public.currency_code ELSE v_order.currency END,
      exchange_rates_snapshot = p_exchange,
      exchange_rate_source = 'Cotação manual do pagamento',
      exchange_rate_locked_at = now(),
      settled_amount_brl = CASE WHEN lower(btrim(p_args->>'method')) = 'pix'
                                THEN v_amount ELSE round(v_credited * (p_exchange->>'BRL')::numeric, 4) END,
      settled_amount_usd = round(v_credited * (p_exchange->>'USD')::numeric, 4),
      settled_amount_pyg = round(v_credited * (p_exchange->>'PYG')::numeric, 4)
  WHERE id = v_payment_id AND order_id = v_order.id AND status = 'pago';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Não foi possível registrar a cotação manual do pagamento.';
  END IF;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.sales_payment_received_manual(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_payment_received_manual(jsonb, jsonb) TO authenticated;
