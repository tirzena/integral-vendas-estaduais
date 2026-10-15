CREATE TABLE private.integral_payment_requests(actor uuid NOT NULL,request_id uuid NOT NULL,order_id uuid NOT NULL,payload jsonb NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(actor,request_id));
REVOKE ALL ON private.integral_payment_requests FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.integral_register_payment(p_order_id uuid,p_request_id uuid,p_payment jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE actor uuid:=auth.uid(); o public.orders%ROWTYPE; previous private.integral_payment_requests%ROWTYPE; result jsonb; proof uuid; payment uuid; received numeric; credited numeric; method text; paid_date date;
BEGIN
 IF actor IS NULL OR p_request_id IS NULL OR NOT private.integral_operation_allowed(actor,'payments.create') THEN RAISE EXCEPTION 'Sem autorização para lançar pagamentos.' USING ERRCODE='42501'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=p_order_id AND deleted_at IS NULL AND superseded_at IS NULL AND status<>'cancelado' FOR UPDATE;
 IF NOT FOUND OR NOT(o.seller_id=actor OR (NOT private.seller_is_restricted(actor) AND private.seller_legacy_sales_can_manage(actor,o.seller_id))) THEN RAISE EXCEPTION 'Pedido não autorizado.' USING ERRCODE='42501'; END IF;
 SELECT * INTO previous FROM private.integral_payment_requests r WHERE r.actor=actor AND r.request_id=p_request_id;
 IF FOUND THEN
  IF previous.order_id<>p_order_id OR previous.payload IS DISTINCT FROM p_payment THEN RAISE EXCEPTION 'Identificador de pagamento reutilizado com dados diferentes.'; END IF;
  RETURN previous.result;
 END IF;
 received:=(p_payment->>'received_amount')::numeric;method:=lower(btrim(p_payment->>'method'));paid_date:=(p_payment->>'paid_at')::date;
 IF received IS NULL OR received<=0 OR received::text IN('NaN','Infinity','-Infinity') OR received<>round(received,2) OR paid_date IS NULL OR paid_date>current_date THEN RAISE EXCEPTION 'Valor ou data do pagamento inválidos.'; END IF;
 IF method NOT IN('dinheiro','pix','transferencia','transferência','cartao','cartão','boleto') THEN RAISE EXCEPTION 'Forma de pagamento inválida.'; END IF;
 IF method<>'dinheiro' AND (coalesce(p_payment->>'proof_url','') !~ '^https://[^[:space:]]+$' OR length(p_payment->>'proof_url')>2000) THEN RAISE EXCEPTION 'Informe o link HTTPS do comprovante.'; END IF;
 IF private.seller_is_restricted(actor) THEN
  result:=public.seller_portal_register_payment(o.id,p_request_id,jsonb_build_object('received_amount',received,'method',method,'proof_url',p_payment->>'proof_url'));
  INSERT INTO private.seller_creation_context VALUES(pg_backend_pid(),txid_current(),actor,o.id,'register_payment');
 ELSE
  IF method<>'dinheiro' THEN
   INSERT INTO public.order_payment_proofs(order_id,proof_type,external_url,file_name,uploaded_by) VALUES(o.id,'link',p_payment->>'proof_url','Comprovante do pagamento',actor) RETURNING id INTO proof;
  END IF;
  IF EXISTS(SELECT 1 FROM private.seller_stock_settlements WHERE order_id=o.id) THEN
   credited:=CASE WHEN method='pix' THEN round(received/(o.exchange_rates_snapshot->>'BRL')::numeric,2) ELSE received END;
   INSERT INTO public.payments(order_id,amount,currency,method,status,received_amount,received_currency,exchange_rates_snapshot,exchange_rate_source,exchange_rate_locked_at,settled_amount_brl,settled_amount_usd,settled_amount_pyg)
   VALUES(o.id,credited,o.currency,method,'pendente',received,CASE WHEN method='pix' THEN 'BRL'::public.currency_code ELSE o.currency END,o.exchange_rates_snapshot,o.exchange_rate_source,o.exchange_rate_locked_at,
   credited*(o.exchange_rates_snapshot->>'BRL')::numeric,credited*(o.exchange_rates_snapshot->>'USD')::numeric,credited*(o.exchange_rates_snapshot->>'PYG')::numeric) RETURNING id INTO payment;
   IF method='dinheiro' THEN
    INSERT INTO public.order_payment_proofs(order_id,payment_id,proof_type,file_path,file_name,uploaded_by)
    SELECT o.id,payment,'recibo_sistema',receipt_token::text,'Recibo de pagamento',actor FROM public.payments WHERE id=payment;
   ELSE UPDATE public.order_payment_proofs SET payment_id=payment WHERE id=proof; END IF;
   INSERT INTO private.seller_pending_receipts VALUES(payment,actor,o.id,NULL,NULL);
   result:=public.finance_confirm_seller_payment(payment);
  ELSE
   result:=private.seller_legacy_sales_payment_received(jsonb_build_object('order_id',o.id,'amount',received,'method',method,'proof_id',proof),false);
  END IF;
 END IF;
 payment:=(result->>'payment_id')::uuid;
 IF payment IS NULL THEN RAISE EXCEPTION 'O pagamento não retornou confirmação de gravação.'; END IF;
 UPDATE public.payments SET paid_at=paid_date WHERE id=payment AND order_id=o.id;
 INSERT INTO public.order_audit_log(order_id,root_order_id,revision_no,action,changed_by,note)
 VALUES(o.id,coalesce(o.root_order_id,o.id),o.revision_no,'pagamento_registrado',actor,'Pagamento: '||received||' · '||method||' · '||coalesce(p_payment->>'notes',''));
 DELETE FROM private.seller_creation_context c WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.actor=actor;
 INSERT INTO private.integral_payment_requests(actor,request_id,order_id,payload,result) VALUES(actor,p_request_id,o.id,p_payment,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.integral_register_payment(uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.integral_register_payment(uuid,uuid,jsonb) TO authenticated;
