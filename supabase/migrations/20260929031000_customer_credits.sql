-- Customer credit is a liability, held separately for each currency. The ledger
-- is append-only; all writes go through the functions below under row locks.
CREATE TABLE IF NOT EXISTS public.customer_credit_accounts (
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  currency public.currency_code NOT NULL,
  balance numeric(18,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id,currency)
);
CREATE TABLE IF NOT EXISTS public.customer_credit_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  currency public.currency_code NOT NULL,
  amount numeric(18,2) NOT NULL CHECK (amount <> 0),
  kind text NOT NULL CHECK (kind IN ('overpayment','deposit','short_delivery','applied','reversal')),
  order_id uuid REFERENCES public.orders(id),
  payment_id uuid REFERENCES public.payments(id),
  order_item_id uuid REFERENCES public.order_items(id),
  short_quantity numeric,
  reverses_entry_id uuid UNIQUE REFERENCES public.customer_credit_entries(id),
  note text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (customer_id,currency) REFERENCES public.customer_credit_accounts(customer_id,currency)
);
CREATE INDEX IF NOT EXISTS customer_credit_entries_customer_created_idx
  ON public.customer_credit_entries(customer_id,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS customer_credit_entries_overpayment_once
  ON public.customer_credit_entries(payment_id) WHERE kind='overpayment' AND payment_id IS NOT NULL;

ALTER TABLE public.customer_credit_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_credit_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_credit_accounts,public.customer_credit_entries FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.customer_credit_accounts,public.customer_credit_entries TO authenticated;
CREATE POLICY customer_credit_accounts_read ON public.customer_credit_accounts
  FOR SELECT TO authenticated USING (
    public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'financeiro') OR
    EXISTS (SELECT 1 FROM public.customers c WHERE c.id=customer_id
      AND public.sales_can_view_customer(c.id,c.created_by)));
CREATE POLICY customer_credit_entries_read ON public.customer_credit_entries
  FOR SELECT TO authenticated USING (
    public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'financeiro') OR
    EXISTS (SELECT 1 FROM public.customers c WHERE c.id=customer_id
      AND public.sales_can_view_customer(c.id,c.created_by)));

-- A single customer/currency row serializes concurrent deposits and uses.
CREATE OR REPLACE FUNCTION public.customer_credit_post(
  p_customer_id uuid,p_currency public.currency_code,p_amount numeric,p_kind text,
  p_note text,p_order_id uuid DEFAULT NULL,p_payment_id uuid DEFAULT NULL,
  p_order_item_id uuid DEFAULT NULL,p_short_quantity numeric DEFAULT NULL,
  p_reverses_entry_id uuid DEFAULT NULL)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_balance numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF p_customer_id IS NULL OR p_currency IS NULL OR p_amount IS NULL
    OR p_amount=0 OR p_amount::text IN ('NaN','Infinity','-Infinity')
    OR round(p_amount,2)<>p_amount THEN RAISE EXCEPTION 'Movimento de crédito inválido.'; END IF;
  IF p_kind NOT IN ('overpayment','deposit','short_delivery','applied','reversal')
    OR length(btrim(coalesce(p_note,'')))<5 THEN RAISE EXCEPTION 'Informe a origem e o motivo do crédito.'; END IF;
  -- This helper is callable only from the authenticated, checked workflows below.
  INSERT INTO public.customer_credit_accounts(customer_id,currency) VALUES(p_customer_id,p_currency)
    ON CONFLICT (customer_id,currency) DO NOTHING;
  SELECT balance INTO v_balance FROM public.customer_credit_accounts
    WHERE customer_id=p_customer_id AND currency=p_currency FOR UPDATE;
  IF v_balance+p_amount<0 THEN RAISE EXCEPTION 'Crédito insuficiente para este cliente e moeda.'; END IF;
  UPDATE public.customer_credit_accounts SET balance=balance+p_amount,updated_at=now()
    WHERE customer_id=p_customer_id AND currency=p_currency RETURNING balance INTO v_balance;
  INSERT INTO public.customer_credit_entries(customer_id,currency,amount,kind,note,order_id,payment_id,order_item_id,short_quantity,reverses_entry_id,created_by)
    VALUES(p_customer_id,p_currency,p_amount,p_kind,btrim(p_note),p_order_id,p_payment_id,p_order_item_id,p_short_quantity,p_reverses_entry_id,auth.uid());
  RETURN v_balance;
END $$;
REVOKE ALL ON FUNCTION public.customer_credit_post(uuid,public.currency_code,numeric,text,text,uuid,uuid,uuid,numeric,uuid)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.customer_credit_balance(p_customer_id uuid)
RETURNS TABLE(currency public.currency_code,balance numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_admin(auth.uid()) OR
    public.has_role(auth.uid(),'financeiro') OR EXISTS
      (SELECT 1 FROM public.customers c WHERE c.id=p_customer_id
        AND public.sales_can_view_customer(c.id,c.created_by))) THEN
    RAISE EXCEPTION 'Sem acesso ao crédito deste cliente.';
  END IF;
  RETURN QUERY SELECT a.currency,a.balance FROM public.customer_credit_accounts a
    WHERE a.customer_id=p_customer_id;
END $$;
REVOKE ALL ON FUNCTION public.customer_credit_balance(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.customer_credit_balance(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.customer_credit_issue(
  p_customer_id uuid,p_currency public.currency_code,p_amount numeric,p_kind text,
  p_note text,p_order_item_id uuid DEFAULT NULL,p_short_quantity numeric DEFAULT NULL)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_item record; v_order public.orders%ROWTYPE; v_prior numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'financeiro'))
    THEN RAISE EXCEPTION 'Apenas administração ou financeiro podem criar créditos.'; END IF;
  IF p_amount IS NULL OR p_amount<=0 OR round(p_amount,2)<>p_amount THEN RAISE EXCEPTION 'Valor inválido.'; END IF;
  IF p_kind='short_delivery' THEN
    SELECT i.*,o.customer_id,o.currency AS order_currency,o.id AS source_order_id
      INTO v_item FROM public.order_items i JOIN public.orders o ON o.id=i.order_id
      WHERE i.id=p_order_item_id AND o.deleted_at IS NULL AND o.superseded_at IS NULL
        AND o.status<>'cancelado' FOR UPDATE OF i;
    IF v_item.id IS NULL OR v_item.customer_id IS DISTINCT FROM p_customer_id
      OR v_item.order_currency IS DISTINCT FROM p_currency
      OR p_short_quantity IS NULL OR p_short_quantity<=0 OR p_short_quantity>v_item.quantity
      THEN RAISE EXCEPTION 'Item ou quantidade faltante inválida.'; END IF;
    SELECT coalesce(sum(short_quantity),0) INTO v_prior FROM public.customer_credit_entries
      WHERE order_item_id=p_order_item_id AND kind='short_delivery';
    IF v_prior+p_short_quantity>v_item.quantity OR
      p_amount>round(v_item.total*p_short_quantity/nullif(v_item.quantity,0),2)
      THEN RAISE EXCEPTION 'O crédito ultrapassa a diferença de produtos deste item.'; END IF;
    RETURN public.customer_credit_post(p_customer_id,p_currency,p_amount,'short_delivery',p_note,
      v_item.source_order_id,NULL,p_order_item_id,p_short_quantity);
  ELSIF p_kind='deposit' THEN
    IF p_order_item_id IS NOT NULL THEN RAISE EXCEPTION 'Depósito não usa item de pedido.'; END IF;
    RETURN public.customer_credit_post(p_customer_id,p_currency,p_amount,'deposit',p_note);
  END IF;
  RAISE EXCEPTION 'Origem de crédito inválida.';
END $$;
REVOKE ALL ON FUNCTION public.customer_credit_issue(uuid,public.currency_code,numeric,text,text,uuid,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.customer_credit_issue(uuid,public.currency_code,numeric,text,text,uuid,numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.customer_credit_apply(p_order_id uuid,p_amount numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_order public.orders%ROWTYPE; v_proof_id uuid; v_result jsonb; v_balance numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF v_order.id IS NULL OR v_order.customer_id IS NULL OR v_order.deleted_at IS NOT NULL
    OR v_order.status='cancelado' OR v_order.superseded_at IS NOT NULL
    OR NOT public.sales_can_manage(auth.uid(),v_order.seller_id)
    THEN RAISE EXCEPTION 'Sem permissão para aplicar crédito neste pedido.'; END IF;
  IF p_amount IS NULL OR p_amount<=0 OR round(p_amount,2)<>p_amount
    OR p_amount>coalesce(v_order.amount_receivable,v_order.total)
    THEN RAISE EXCEPTION 'O crédito supera o saldo a pagar.'; END IF;
  -- Hold the credit row while the existing payment routine updates the order.
  SELECT balance INTO v_balance FROM public.customer_credit_accounts
    WHERE customer_id=v_order.customer_id AND currency=v_order.currency FOR UPDATE;
  IF coalesce(v_balance,0)<p_amount THEN RAISE EXCEPTION 'Crédito insuficiente.'; END IF;
  INSERT INTO public.order_payment_proofs(order_id,proof_type,file_path,file_name,uploaded_by)
    VALUES(v_order.id,'credito_cliente','credito-cliente:'||gen_random_uuid()::text,
      'Crédito do cliente',auth.uid()) RETURNING id INTO v_proof_id;
  v_result:=public.sales_register_payment(v_order.id,p_amount,'Crédito do cliente',v_proof_id);
  -- Payment settlement must not claim the parcel was delivered.
  UPDATE public.orders SET delivered_at=v_order.delivered_at,
    status=CASE WHEN v_order.status='entregue' THEN 'entregue' ELSE 'faturado' END,
    fulfillment_status=v_order.fulfillment_status
    WHERE id=v_order.id;
  PERFORM public.customer_credit_post(v_order.customer_id,v_order.currency,-p_amount,'applied',
    'Crédito aplicado ao pedido '||coalesce(v_order.number::text,v_order.id::text),v_order.id,(v_result->>'payment_id')::uuid);
  RETURN v_result || jsonb_build_object('credit_remaining',v_balance-p_amount);
END $$;
REVOKE ALL ON FUNCTION public.customer_credit_apply(uuid,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.customer_credit_apply(uuid,numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.customer_credit_receive_overpayment(
  p_order_id uuid,p_received_amount numeric,p_method text,p_proof_id uuid,p_exchange jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_order public.orders%ROWTYPE; v_rate numeric; v_order_amount numeric;
  v_applied numeric; v_received_applied numeric; v_result jsonb; v_credit numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF v_order.id IS NULL OR v_order.customer_id IS NULL OR v_order.deleted_at IS NOT NULL
    OR v_order.status='cancelado' OR v_order.superseded_at IS NOT NULL
    OR NOT public.sales_can_manage(auth.uid(),v_order.seller_id)
    THEN RAISE EXCEPTION 'Este pedido precisa de cliente e permissão para registrar o excedente.'; END IF;
  IF p_received_amount IS NULL OR p_received_amount<=0 OR round(p_received_amount,2)<>p_received_amount
    THEN RAISE EXCEPTION 'Valor recebido inválido.'; END IF;
  v_rate:=1;
  IF lower(btrim(p_method))='pix' THEN
    IF p_exchange IS NOT NULL AND (p_exchange->>'base' IS DISTINCT FROM v_order.currency::text
      OR p_exchange->>'mode' IS DISTINCT FROM 'manual')
      THEN RAISE EXCEPTION 'Cotação manual incompatível com o pedido.'; END IF;
    v_rate:=coalesce((p_exchange->>'BRL')::numeric,(v_order.exchange_rates_snapshot->>'BRL')::numeric);
    IF v_rate IS NULL THEN SELECT r.rate INTO v_rate FROM public.financial_rate_at(v_order.currency,'BRL',now()) r LIMIT 1; END IF;
    IF v_rate IS NULL OR v_rate<=0 THEN RAISE EXCEPTION 'Cotação Pix indisponível.'; END IF;
  END IF;
  v_order_amount:=round(p_received_amount/v_rate,2);
  v_applied:=least(v_order_amount,round(greatest(v_order.total-
    (SELECT coalesce(sum(amount),0) FROM public.payments WHERE order_id=v_order.id AND status='pago'),0),2));
  v_credit:=v_order_amount-v_applied;
  IF v_credit>0 AND NOT (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'financeiro'))
    THEN RAISE EXCEPTION 'O excedente precisa ser conferido pela administração ou financeiro antes de virar crédito.'; END IF;
  IF v_applied>0 THEN
    v_received_applied:=CASE WHEN v_credit>0 THEN round(v_applied*v_rate,2) ELSE p_received_amount END;
    IF p_exchange IS NOT NULL THEN
      v_result:=public.sales_payment_received_manual(jsonb_build_object('order_id',v_order.id,'amount',v_received_applied,
        'method',p_method,'proof_id',p_proof_id),p_exchange);
    ELSE
      v_result:=public.sales_payment_received(jsonb_build_object('order_id',v_order.id,'amount',v_received_applied,
        'method',p_method,'proof_id',p_proof_id),false);
    END IF;
  ELSE
    RAISE EXCEPTION 'Pedido quitado: registre o valor como depósito de crédito com o comprovante.';
  END IF;
  IF v_credit>0 THEN
    PERFORM public.customer_credit_post(v_order.customer_id,v_order.currency,v_credit,'overpayment',
      'Excedente de '||p_received_amount||' '||CASE WHEN lower(btrim(p_method))='pix' THEN 'BRL' ELSE v_order.currency::text END||
      ' no pedido '||coalesce(v_order.number::text,v_order.id::text),v_order.id,(v_result->>'payment_id')::uuid);
  END IF;
  RETURN v_result || jsonb_build_object('credit_created',v_credit);
END $$;
REVOKE ALL ON FUNCTION public.customer_credit_receive_overpayment(uuid,numeric,text,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.customer_credit_receive_overpayment(uuid,numeric,text,uuid,jsonb) TO authenticated;

-- Create and consume credit in one transaction. A failed debit rolls back the
-- order itself, so there is no order that claims a credit was used when it was not.
CREATE OR REPLACE FUNCTION public.customer_credit_create_order(p_args jsonb,p_credit_amount numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_created jsonb; v_applied jsonb; v_customer uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  v_customer:=(p_args->>'p_customer_id')::uuid;
  IF v_customer IS NULL OR NOT (public.is_admin(auth.uid()) OR
    public.has_role(auth.uid(),'financeiro') OR EXISTS
      (SELECT 1 FROM public.customers c WHERE c.id=v_customer
        AND public.sales_can_view_customer(c.id,c.created_by)))
    OR p_credit_amount IS NULL OR p_credit_amount<=0 OR round(p_credit_amount,2)<>p_credit_amount
    OR jsonb_array_length(coalesce(p_args->'p_payments','[]'::jsonb))<>0
    THEN RAISE EXCEPTION 'Selecione um cliente e informe um crédito válido sem outros pagamentos iniciais.'; END IF;
  v_created:=public.sales_create_document_v2(
    'pre_pedido',v_customer,(p_args->>'p_product_id')::uuid,
    (p_args->>'p_currency')::public.currency_code,(p_args->>'p_discount')::numeric,
    (p_args->>'p_shipping_cost')::numeric,(p_args->>'p_shipping_percentage')::numeric,
    p_args->>'p_notes','Crédito do cliente',p_args->>'p_payment_installments',
    NULL,p_args->>'p_whatsapp','pdv',p_args->'p_items','[]'::jsonb);
  PERFORM public.sales_update_order_logistics((v_created->>'id')::uuid,
    (p_args->>'p_warehouse_id')::uuid,p_args->>'p_shipping_address',
    p_args->>'p_shipping_city',p_args->>'p_shipping_state');
  v_applied:=public.customer_credit_apply((v_created->>'id')::uuid,p_credit_amount);
  RETURN v_created || jsonb_build_object('credit_applied',p_credit_amount,
    'credit_remaining',v_applied->'credit_remaining','stage',v_applied->'stage');
END $$;
REVOKE ALL ON FUNCTION public.customer_credit_create_order(jsonb,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.customer_credit_create_order(jsonb,numeric) TO authenticated;

-- A payment that generated or used credit cannot be changed independently of
-- the ledger. This prevents a correction from leaving a fictitious balance.
CREATE OR REPLACE FUNCTION public.customer_credit_guard_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.customer_credit_entries e WHERE e.payment_id=OLD.id)
    AND (TG_OP='DELETE' OR NEW.amount IS DISTINCT FROM OLD.amount
      OR NEW.status IS DISTINCT FROM OLD.status OR NEW.order_id IS DISTINCT FROM OLD.order_id)
    AND (SELECT coalesce(sum(e.amount),0) FROM public.customer_credit_entries e WHERE e.payment_id=OLD.id)<>0
    THEN RAISE EXCEPTION 'Pagamento vinculado a crédito do cliente. Estorne o crédito antes de alterar ou cancelar.'; END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
REVOKE ALL ON FUNCTION public.customer_credit_guard_payment() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER customer_credit_guard_payment BEFORE UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.customer_credit_guard_payment();

CREATE OR REPLACE FUNCTION public.customer_credit_reverse(p_entry_id uuid,p_reason text)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_entry public.customer_credit_entries%ROWTYPE; v_balance numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'financeiro'))
    THEN RAISE EXCEPTION 'Apenas administração ou financeiro podem estornar créditos.'; END IF;
  IF length(btrim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'Informe o motivo do estorno.'; END IF;
  SELECT * INTO v_entry FROM public.customer_credit_entries WHERE id=p_entry_id FOR UPDATE;
  IF v_entry.id IS NULL OR v_entry.kind='reversal' OR EXISTS
    (SELECT 1 FROM public.customer_credit_entries WHERE reverses_entry_id=p_entry_id)
    THEN RAISE EXCEPTION 'Movimento inexistente ou já estornado.'; END IF;
  v_balance:=public.customer_credit_post(v_entry.customer_id,v_entry.currency,-v_entry.amount,'reversal',
    'Estorno: '||btrim(p_reason),v_entry.order_id,v_entry.payment_id,NULL,NULL,p_entry_id);
  IF v_entry.kind='applied' THEN
    PERFORM public.sales_cancel_order_payment(v_entry.order_id,v_entry.payment_id,
      'Estorno do crédito do cliente: '||btrim(p_reason));
  END IF;
  RETURN v_balance;
END $$;
REVOKE ALL ON FUNCTION public.customer_credit_reverse(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.customer_credit_reverse(uuid,text) TO authenticated;
