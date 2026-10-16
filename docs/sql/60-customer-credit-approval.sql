CREATE TABLE private.customer_credit_requests(
 payment_id uuid PRIMARY KEY REFERENCES public.payments(id),customer_id uuid NOT NULL REFERENCES public.customers(id),
 currency public.currency_code NOT NULL,amount numeric NOT NULL CHECK(amount>0 AND amount=round(amount,2)),
 created_by uuid NOT NULL REFERENCES public.profiles(id),created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE private.customer_credit_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.customer_credit_requests FROM PUBLIC,anon,authenticated;
CREATE INDEX customer_credit_requests_customer_currency ON private.customer_credit_requests(customer_id,currency);
CREATE OR REPLACE FUNCTION public.integral_order_credit_context(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $body$
DECLARE ctx jsonb; o public.orders; balances jsonb; available numeric:=0; balance numeric:=0; reserved numeric:=0; pending numeric:=0;
BEGIN
 ctx:=public.integral_order_context(p_order_id);
 SELECT * INTO o FROM public.orders WHERE id=p_order_id;
 SELECT coalesce(sum(amount),0) INTO pending FROM public.payments WHERE order_id=o.id AND status='pendente';
 IF o.customer_id IS NULL THEN RETURN jsonb_build_object('has_customer',false,'currency',o.currency,'balance',0,'reserved',0,'available',0,'pending_amount',pending,'balances','[]'::jsonb); END IF;
 SELECT coalesce(a.balance,0),coalesce((SELECT sum(r.amount) FROM private.customer_credit_requests r JOIN public.payments p ON p.id=r.payment_id WHERE r.customer_id=o.customer_id AND r.currency=o.currency AND p.status='pendente'),0)
 INTO balance,reserved FROM public.customer_credit_accounts a WHERE a.customer_id=o.customer_id AND a.currency=o.currency;
 SELECT coalesce(jsonb_agg(jsonb_build_object('currency',a.currency,'balance',a.balance)),'[]'::jsonb) INTO balances FROM public.customer_credit_accounts a WHERE a.customer_id=o.customer_id;
 RETURN jsonb_build_object('has_customer',true,'currency',o.currency,'balance',coalesce(balance,0),'reserved',coalesce(reserved,0),'available',greatest(0,coalesce(balance,0)-coalesce(reserved,0)),'pending_amount',pending,'balances',balances);
END $body$;
REVOKE ALL ON FUNCTION public.integral_order_credit_context(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.integral_order_credit_context(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.integral_request_customer_credit(p_order_id uuid,p_amount numeric,p_request_id uuid,p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$
#variable_conflict use_variable
DECLARE actor uuid:=auth.uid(); o public.orders; old private.integral_payment_requests; payload jsonb; result jsonb;
 balance numeric; reserved numeric; pending numeric; payment uuid; made_context boolean:=false;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('integral:remuneration-ledger',0));
 IF NOT private.integral_operation_allowed(actor,'payments.create') OR p_request_id IS NULL THEN RAISE EXCEPTION 'Sem autorização para usar crédito.' USING ERRCODE='42501'; END IF;
 payload:=jsonb_build_object('kind','customer_credit','amount',p_amount,'note',p_note);
 SELECT * INTO old FROM private.integral_payment_requests r WHERE r.actor=actor AND r.request_id=p_request_id;
 IF FOUND THEN IF old.order_id<>p_order_id OR old.payload IS DISTINCT FROM payload THEN RAISE EXCEPTION 'Identificador já usado em outro lançamento.'; END IF; RETURN old.result; END IF;
 PERFORM public.integral_order_context(p_order_id);
 SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF o.approval_status IS DISTINCT FROM 'approved' OR o.customer_id IS NULL OR o.financial_closed_at IS NOT NULL OR private.remuneration_cancel_pending(o.id) OR o.status='cancelado' OR o.workflow_stage='perdido' THEN RAISE EXCEPTION 'Aguarde a aprovação e vincule um cliente antes de usar crédito.'; END IF;
 IF p_amount IS NULL OR p_amount<=0 OR p_amount<>round(p_amount,2) OR p_amount::text IN('NaN','Infinity','-Infinity') OR length(coalesce(p_note,''))>1000 THEN RAISE EXCEPTION 'Informe um valor de crédito válido.'; END IF;
 SELECT a.balance INTO balance FROM public.customer_credit_accounts a WHERE a.customer_id=o.customer_id AND a.currency=o.currency FOR UPDATE;
 SELECT coalesce(sum(r.amount),0) INTO reserved FROM private.customer_credit_requests r JOIN public.payments p ON p.id=r.payment_id WHERE r.customer_id=o.customer_id AND r.currency=o.currency AND p.status='pendente';
 SELECT coalesce(sum(p.amount),0) INTO pending FROM public.payments p WHERE p.order_id=o.id AND p.status='pendente';
 IF p_amount>greatest(0,coalesce(balance,0)-reserved) OR p_amount>greatest(0,o.amount_receivable-pending) THEN RAISE EXCEPTION 'O valor supera o crédito disponível ou o saldo livre do pedido.'; END IF;
 INSERT INTO private.seller_creation_context VALUES(pg_backend_pid(),txid_current(),actor,o.id,'register_payment') ON CONFLICT DO NOTHING RETURNING true INTO made_context;
 INSERT INTO public.payments(order_id,amount,currency,method,status,paid_at,received_amount,received_currency,exchange_rates_snapshot,exchange_rate_source,exchange_rate_locked_at,settled_amount_brl,settled_amount_usd,settled_amount_pyg)
 VALUES(o.id,p_amount,o.currency,'Crédito do cliente','pendente',current_date,p_amount,o.currency,o.exchange_rates_snapshot,o.exchange_rate_source,o.exchange_rate_locked_at,p_amount*(o.exchange_rates_snapshot->>'BRL')::numeric,p_amount*(o.exchange_rates_snapshot->>'USD')::numeric,p_amount*(o.exchange_rates_snapshot->>'PYG')::numeric)
 RETURNING id INTO payment;
 INSERT INTO private.customer_credit_requests(payment_id,customer_id,currency,amount,created_by) VALUES(payment,o.customer_id,o.currency,p_amount,actor);
 INSERT INTO private.seller_pending_receipts VALUES(payment,actor,o.id,NULL,NULL);
 INSERT INTO public.order_payment_proofs(order_id,payment_id,proof_type,file_path,file_name,uploaded_by)
 VALUES(o.id,payment,'credito_cliente','credit-request:'||payment::text,'Uso de crédito do cliente: '||p_amount||' '||o.currency,actor);
 INSERT INTO public.order_audit_log(order_id,root_order_id,revision_no,action,changed_by,note,new_snapshot)
 VALUES(o.id,coalesce(o.root_order_id,o.id),o.revision_no,'pagamento_registrado',actor,'Uso de crédito solicitado; aguardando conferência financeira. '||coalesce(p_note,''),jsonb_build_object('payment_id',payment,'amount',p_amount,'currency',o.currency,'status','pendente'));
 result:=jsonb_build_object('payment_id',payment,'status','pendente','credit_requested',p_amount);
 INSERT INTO private.integral_payment_requests(actor,request_id,order_id,payload,result) VALUES(actor,p_request_id,o.id,payload,result);
 IF coalesce(made_context,false) THEN DELETE FROM private.seller_creation_context c WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.actor=auth.uid(); END IF;
 PERFORM private.remuneration_notify(o.id,'Uso de crédito aguardando conferência','Pedido #'||o.number||': conferir crédito de '||p_amount||' '||o.currency||'.','payment_pending');
 RETURN result;
END $body$;
REVOKE ALL ON FUNCTION public.integral_request_customer_credit(uuid,numeric,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.integral_request_customer_credit(uuid,numeric,uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.customer_credit_apply(p_order_id uuid, p_amount numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  IF coalesce((SELECT workflow_enabled FROM private.remuneration_settings),false) THEN RAISE EXCEPTION 'Use Lançar pagamento para solicitar crédito e aguardar a aprovação financeira.'; END IF;
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
END $function$;

CREATE OR REPLACE FUNCTION public.finance_confirm_seller_payment(p_payment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_actor uuid:=auth.uid(); o public.orders%ROWTYPE; p public.payments%ROWTYPE; proof uuid; result jsonb; order_id uuid; paid numeric; context_created boolean:=false; credit_request private.customer_credit_requests; is_credit boolean:=false; credit_balance numeric; other_reserved numeric;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('integral:remuneration-ledger',0));
 IF v_actor IS NULL OR NOT private.integral_operation_allowed(v_actor,'payments.create') OR NOT (
 private.integral_can_review_financial(v_actor)) THEN
 RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Finance or administrator required.'; END IF;
 SELECT so.order_id INTO order_id FROM private.seller_pending_receipts so WHERE so.payment_id=p_payment_id;
 IF order_id IS NULL THEN RAISE EXCEPTION 'Seller receipt not found.'; END IF;
 SELECT * INTO o FROM public.orders so WHERE so.id=order_id FOR UPDATE;
 SELECT * INTO p FROM public.payments sp WHERE sp.id=p_payment_id AND sp.order_id=o.id FOR UPDATE;
 IF o.approval_status IS NOT NULL AND o.approval_status<>'approved' THEN RAISE EXCEPTION 'Aguarde a aprovação do pedido.'; END IF;
 SELECT * INTO credit_request FROM private.customer_credit_requests WHERE payment_id=p.id FOR UPDATE;
 is_credit:=FOUND;
 IF o.approval_status IS NOT NULL AND NOT is_credit AND NOT EXISTS(SELECT 1 FROM public.order_payment_proofs pr JOIN storage.objects f ON f.bucket_id='payment-proofs' AND f.name=pr.file_path WHERE pr.order_id=o.id AND pr.payment_id=p.id AND pr.proof_type='arquivo') THEN RAISE EXCEPTION 'Confira o arquivo do comprovante ou do recibo assinado.'; END IF;
 IF o.deleted_at IS NOT NULL OR o.superseded_at IS NOT NULL OR o.status='cancelado'
 OR o.workflow_stage IN ('cancelado','rascunho','solicitacao_catalogo') OR (o.workflow_stage='perdido' AND NOT EXISTS(SELECT 1 FROM public.order_loss_resolutions lr WHERE lr.order_id=o.id AND lr.resolution='replacement')) THEN RAISE EXCEPTION 'Inactive order.'; END IF;
 IF o.approval_status IS NOT NULL AND EXISTS(SELECT 1 FROM public.order_payment_proofs pr WHERE pr.payment_id=p.id AND pr.uploaded_by=v_actor) THEN RAISE EXCEPTION 'Outro responsável deve conferir o recebimento que você lançou.'; END IF;
 IF p.status='pago' THEN RETURN jsonb_build_object('payment_id',p.id,'status','pago','replayed',true); END IF;
 IF p.status IS DISTINCT FROM 'pendente' THEN RAISE EXCEPTION 'Receipt is not pending.'; END IF;
 IF p.currency IS DISTINCT FROM o.currency OR p.exchange_rates_snapshot IS DISTINCT FROM o.exchange_rates_snapshot
 OR (lower(btrim(p.method))='pix' AND (p.received_currency<>'BRL' OR
 abs(round(p.received_amount/(o.exchange_rates_snapshot->>'BRL')::numeric,2)-p.amount)>0.01))
 THEN RAISE EXCEPTION 'Receipt exchange is inconsistent.'; END IF;
 IF is_credit THEN
  IF credit_request.customer_id IS DISTINCT FROM o.customer_id OR credit_request.currency IS DISTINCT FROM o.currency OR credit_request.amount IS DISTINCT FROM p.amount OR p.method<>'Crédito do cliente' THEN RAISE EXCEPTION 'Solicitação de crédito inconsistente.'; END IF;
  SELECT balance INTO credit_balance FROM public.customer_credit_accounts WHERE customer_id=o.customer_id AND currency=o.currency FOR UPDATE;
  SELECT coalesce(sum(r.amount),0) INTO other_reserved FROM private.customer_credit_requests r JOIN public.payments pay ON pay.id=r.payment_id WHERE r.customer_id=o.customer_id AND r.currency=o.currency AND r.payment_id<>p.id AND pay.status='pendente';
  IF p.amount>coalesce(credit_balance,0)-other_reserved THEN RAISE EXCEPTION 'Crédito insuficiente para confirmar este abatimento.'; END IF;
 END IF;
 SELECT coalesce(sum(sp.amount),0) INTO paid FROM public.payments sp WHERE sp.order_id=o.id AND sp.status='pago';
 IF p.amount<=0 OR p.amount>greatest(0,round(o.total-paid,2)) THEN RAISE EXCEPTION 'Receipt exceeds current balance.'; END IF;
 SELECT sp.id INTO proof FROM public.order_payment_proofs sp WHERE sp.payment_id=p.id AND sp.order_id=o.id ORDER BY sp.created_at LIMIT 1 FOR UPDATE;
 IF proof IS NULL THEN RAISE EXCEPTION 'Receipt proof required.'; END IF;
 INSERT INTO private.seller_creation_context(backend_pid,transaction_id,actor,new_order_id,operation)
 VALUES(pg_backend_pid(),txid_current(),v_actor,o.id,'register_payment')
 ON CONFLICT DO NOTHING RETURNING true INTO context_created;
 -- Canonical non-cash payment expects an unattached proof; it reattaches to SAME payment.
 IF lower(btrim(p.method))<>'dinheiro' THEN UPDATE public.order_payment_proofs sp SET payment_id=NULL WHERE sp.id=proof; END IF;
 PERFORM 1 FROM public.inventory_items i WHERE i.id IN(SELECT l.item_id FROM public.order_items l WHERE l.order_id=o.id) ORDER BY i.id FOR UPDATE;
 PERFORM 1 FROM public.warehouse_inventory w WHERE w.warehouse_id=o.warehouse_id AND w.item_id IN(SELECT l.item_id FROM public.order_items l WHERE l.order_id=o.id) ORDER BY w.item_id FOR UPDATE;
 result:=private.seller_confirm_canonical(o.id,p.amount,p.method,proof,p.id);
 IF is_credit THEN PERFORM public.customer_credit_post(o.customer_id,o.currency,-p.amount,'applied','Crédito aprovado para o pedido #'||o.number,o.id,p.id); END IF;
 IF EXISTS(SELECT 1 FROM public.orders so WHERE so.id=o.id AND (
 so.seller_id IS DISTINCT FROM o.seller_id OR so.currency IS DISTINCT FROM o.currency OR so.total IS DISTINCT FROM o.total
 OR so.discount IS DISTINCT FROM o.discount OR so.shipping_cost IS DISTINCT FROM o.shipping_cost
 OR so.commission_total IS DISTINCT FROM o.commission_total OR so.exchange_rates_snapshot IS DISTINCT FROM o.exchange_rates_snapshot))
 THEN RAISE EXCEPTION 'Approval unexpectedly changed commercial terms.'; END IF;
 UPDATE private.seller_pending_receipts sp SET confirmed_by=v_actor,confirmed_at=now() WHERE sp.payment_id=p.id;
 IF o.approval_status IS NOT NULL THEN
  PERFORM private.integral_apply_order_compensation(o.id);
  PERFORM private.remuneration_refresh_periods();
  PERFORM private.remuneration_notify(o.id,CASE WHEN (result->>'remaining')::numeric=0 THEN 'Quitação aguardando baixa financeira' ELSE 'Pagamento confirmado' END,'Pedido #'||o.number||': recebimento confirmado de '||p.amount||' '||o.currency||'. Saldo restante: '||(result->>'remaining')||' '||o.currency||'.','payment_confirmed');
 END IF;
 IF coalesce(context_created,false) THEN
 DELETE FROM private.seller_creation_context c WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.actor=v_actor AND c.new_order_id=o.id AND c.operation='register_payment';
 END IF;
 INSERT INTO private.integral_payment_reviews(payment_id,order_id,decision,reviewed_by,note,previous_snapshot,new_snapshot)
 VALUES(p.id,o.id,'confirmed',v_actor,CASE WHEN is_credit THEN 'Uso de crédito do cliente conferido e aprovado' ELSE 'Comprovante conferido e recebimento confirmado' END,to_jsonb(p),(SELECT to_jsonb(pay) FROM public.payments pay WHERE pay.id=p.id));
 RETURN jsonb_build_object('id',o.id,'payment_id',p.id,'status','pago','paid',result->'paid','remaining',result->'remaining','stage',result->'stage','replayed',false);
END $function$;

CREATE OR REPLACE FUNCTION public.integral_register_payment(p_order_id uuid, p_request_id uuid, p_payment jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_variable
DECLARE actor uuid:=auth.uid(); o public.orders%ROWTYPE; previous private.integral_payment_requests%ROWTYPE; result jsonb; proof uuid; payment uuid; received numeric; credited numeric; method text; paid_date date; proof_path text; pending_amount numeric;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('integral:remuneration-ledger',0));
 IF actor IS NULL OR p_request_id IS NULL OR NOT private.integral_operation_allowed(actor,'payments.create') THEN RAISE EXCEPTION 'Sem autorização para lançar pagamentos.' USING ERRCODE='42501'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=p_order_id AND deleted_at IS NULL AND superseded_at IS NULL AND status<>'cancelado' FOR UPDATE;
 IF NOT FOUND OR NOT(o.seller_id=actor OR (NOT private.seller_is_restricted(actor) AND private.seller_legacy_sales_can_manage(actor,o.seller_id))) THEN RAISE EXCEPTION 'Pedido não autorizado.' USING ERRCODE='42501'; END IF;
 IF coalesce((SELECT workflow_enabled FROM private.remuneration_settings),false) AND o.approval_status IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION 'Aguarde a aprovação do pedido.'; END IF;
 IF o.approval_status IS NOT NULL AND (o.workflow_stage='perdido' OR o.fulfillment_status='perdido') AND NOT EXISTS(SELECT 1 FROM public.order_loss_resolutions lr WHERE lr.order_id=o.id AND lr.resolution='replacement') THEN RAISE EXCEPTION 'Defina com o financeiro a reposição ou o crédito antes de novos recebimentos.'; END IF;
 IF private.remuneration_cancel_pending(o.id) THEN RAISE EXCEPTION 'Aguarde a revisão do cancelamento antes de lançar novos pagamentos.'; END IF;
 proof_path:=nullif(p_payment->>'proof_path','');
 IF o.approval_status IS NOT NULL AND proof_path IS NULL THEN RAISE EXCEPTION 'Anexe o comprovante; para dinheiro, anexe o recibo assinado.'; END IF;
 IF proof_path IS NOT NULL AND (split_part(proof_path,'/',1)<>o.id::text OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='payment-proofs' AND name=proof_path)) THEN RAISE EXCEPTION 'Comprovante não pertence ao pedido ou não foi enviado.'; END IF;
 IF proof_path IS NOT NULL THEN
  p_payment:=jsonb_set(p_payment,'{proof_url}',to_jsonb('https://wyutdvttldxkaqqysiuv.supabase.co/storage/v1/object/authenticated/payment-proofs/'||proof_path));
 END IF;
 SELECT * INTO previous FROM private.integral_payment_requests r WHERE r.actor=actor AND r.request_id=p_request_id;
 IF FOUND THEN
  IF previous.order_id<>p_order_id OR previous.payload IS DISTINCT FROM p_payment THEN RAISE EXCEPTION 'Identificador de pagamento reutilizado com dados diferentes.'; END IF;
  RETURN previous.result;
 END IF;
 IF proof_path IS NOT NULL AND EXISTS(SELECT 1 FROM public.order_payment_proofs pr JOIN public.payments pp ON pp.id=pr.payment_id WHERE pr.file_path=proof_path AND pp.status<>'cancelado') THEN RAISE EXCEPTION 'Este arquivo já foi usado em outro lançamento. Confira o histórico do pedido.'; END IF;
 received:=(p_payment->>'received_amount')::numeric;method:=lower(btrim(p_payment->>'method'));paid_date:=(p_payment->>'paid_at')::date;
 IF received IS NULL OR received<=0 OR received::text IN('NaN','Infinity','-Infinity') OR received<>round(received,2) OR paid_date IS NULL OR paid_date>current_date THEN RAISE EXCEPTION 'Valor ou data do pagamento inválidos.'; END IF;
 IF method='dinheiro' AND o.approval_status IS NOT NULL AND coalesce((p_payment->>'cash_receipt_signed')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'Confirme as assinaturas do vendedor e do financeiro no recibo.'; END IF;
 IF method NOT IN('dinheiro','pix','transferencia','transferência','cartao','cartão','boleto') THEN RAISE EXCEPTION 'Forma de pagamento inválida.'; END IF;
 IF method<>'dinheiro' AND (coalesce(p_payment->>'proof_url','') !~ '^https://[^[:space:]]+$' OR length(p_payment->>'proof_url')>2000) THEN RAISE EXCEPTION 'Informe o link HTTPS do comprovante.'; END IF;
 IF o.approval_status IS NOT NULL THEN
  credited:=CASE WHEN method='pix' THEN round(received/(o.exchange_rates_snapshot->>'BRL')::numeric,2) ELSE received END;
  SELECT coalesce(sum(p.amount),0) INTO pending_amount FROM public.payments p WHERE p.order_id=o.id AND p.status='pendente';
  IF credited IS NULL OR credited<=0 OR credited>greatest(0,o.amount_receivable-pending_amount) THEN RAISE EXCEPTION 'O valor supera o saldo livre, considerando os lançamentos em análise.'; END IF;
 END IF;
 IF private.seller_is_restricted(actor) THEN
  result:=public.seller_portal_register_payment(o.id,p_request_id,jsonb_build_object('received_amount',received,'method',method,'proof_url',p_payment->>'proof_url'));
  INSERT INTO private.seller_creation_context VALUES(pg_backend_pid(),txid_current(),actor,o.id,'register_payment');
 ELSE
  IF method<>'dinheiro' THEN
   INSERT INTO public.order_payment_proofs(order_id,proof_type,external_url,file_name,uploaded_by,file_path) VALUES(o.id,CASE WHEN proof_path IS NULL THEN 'link' ELSE 'arquivo' END,p_payment->>'proof_url','Comprovante do pagamento',actor,proof_path) RETURNING id INTO proof;
  END IF;
  IF o.approval_status IS NOT NULL OR EXISTS(SELECT 1 FROM private.seller_stock_settlements WHERE order_id=o.id) THEN
   credited:=CASE WHEN method='pix' THEN round(received/(o.exchange_rates_snapshot->>'BRL')::numeric,2) ELSE received END;
   INSERT INTO public.payments(order_id,amount,currency,method,status,received_amount,received_currency,exchange_rates_snapshot,exchange_rate_source,exchange_rate_locked_at,settled_amount_brl,settled_amount_usd,settled_amount_pyg)
   VALUES(o.id,credited,o.currency,method,'pendente',received,CASE WHEN method='pix' THEN 'BRL'::public.currency_code ELSE o.currency END,o.exchange_rates_snapshot,o.exchange_rate_source,o.exchange_rate_locked_at,
   credited*(o.exchange_rates_snapshot->>'BRL')::numeric,credited*(o.exchange_rates_snapshot->>'USD')::numeric,credited*(o.exchange_rates_snapshot->>'PYG')::numeric) RETURNING id INTO payment;
   IF method='dinheiro' THEN
    INSERT INTO public.order_payment_proofs(order_id,payment_id,proof_type,file_path,file_name,uploaded_by)
    SELECT o.id,payment,CASE WHEN proof_path IS NULL THEN 'recibo_sistema' ELSE 'arquivo' END,coalesce(proof_path,receipt_token::text),CASE WHEN proof_path IS NULL THEN 'Recibo de pagamento' ELSE 'Recibo assinado de recebimento em dinheiro' END,actor FROM public.payments WHERE id=payment;
   ELSE UPDATE public.order_payment_proofs SET payment_id=payment WHERE id=proof; END IF;
   INSERT INTO private.seller_pending_receipts VALUES(payment,actor,o.id,NULL,NULL);
   result:=CASE WHEN o.approval_status IS NOT NULL THEN jsonb_build_object('payment_id',payment,'status','pendente') ELSE public.finance_confirm_seller_payment(payment) END;
  ELSE
   result:=private.seller_legacy_sales_payment_received(jsonb_build_object('order_id',o.id,'amount',received,'method',method,'proof_id',proof),false);
  END IF;
 END IF;
 payment:=(result->>'payment_id')::uuid;
 IF payment IS NULL THEN RAISE EXCEPTION 'O pagamento não retornou confirmação de gravação.'; END IF;
 IF proof_path IS NOT NULL THEN
  UPDATE public.order_payment_proofs SET file_path=proof_path,proof_type='arquivo',file_name=CASE WHEN method='dinheiro' THEN 'Recibo assinado de recebimento em dinheiro' ELSE 'Comprovante do pagamento' END WHERE payment_id=payment AND order_id=o.id;
 END IF;
 UPDATE public.payments SET paid_at=paid_date WHERE id=payment AND order_id=o.id;
 INSERT INTO public.order_audit_log(order_id,root_order_id,revision_no,action,changed_by,note)
 VALUES(o.id,coalesce(o.root_order_id,o.id),o.revision_no,'pagamento_registrado',actor,'Pagamento: '||received||' · '||method||' · '||coalesce(p_payment->>'notes',''));
 DELETE FROM private.seller_creation_context c WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.actor=actor;
 IF o.approval_status IS NOT NULL THEN PERFORM private.remuneration_notify(o.id,'Recebimento aguardando conferência','Pagamento informado no pedido #'||o.number||'. Confira o comprovante antes de confirmar.','payment_pending'); END IF;
 INSERT INTO private.integral_payment_requests(actor,request_id,order_id,payload,result) VALUES(actor,p_request_id,o.id,p_payment,result);
 RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION public.integral_review_payment(p_payment uuid, p_decision text, p_reason text, p_amount numeric DEFAULT NULL::numeric, p_paid_at date DEFAULT NULL::date, p_method text DEFAULT NULL::text, p_expected_amount numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_variable
DECLARE actor uuid:=auth.uid(); o public.orders; pay public.payments; receipt private.seller_pending_receipts; entered boolean:=false; ctx boolean:=false; paid numeric; cr private.customer_credit_requests; credit_balance numeric; other_reserved numeric;
BEGIN
 IF NOT private.integral_can_review_financial(actor) OR NOT private.integral_operation_allowed(actor,'payments.create') THEN RAISE EXCEPTION 'Conferência restrita à administração e ao financeiro.' USING ERRCODE='42501'; END IF;
 IF p_decision IS NULL OR p_decision NOT IN ('reject','request_changes','adjust') OR length(btrim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'Informe a decisão e sua justificativa.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('integral:remuneration-ledger',0));
 SELECT * INTO receipt FROM private.seller_pending_receipts WHERE payment_id=p_payment;
 IF NOT FOUND OR receipt.confirmed_at IS NOT NULL THEN RAISE EXCEPTION 'Pagamento indisponível para revisão.'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=receipt.order_id AND deleted_at IS NULL AND superseded_at IS NULL AND status<>'cancelado' FOR UPDATE;
 IF NOT FOUND OR (o.approval_status IS NOT NULL AND o.approval_status<>'approved') OR private.remuneration_cancel_pending(o.id) THEN RAISE EXCEPTION 'Pedido indisponível para conferência.'; END IF;
 SELECT * INTO pay FROM public.payments WHERE id=p_payment AND order_id=o.id FOR UPDATE;
 IF NOT FOUND OR pay.status<>'pendente' THEN RAISE EXCEPTION 'Pagamento não está pendente.'; END IF;
 IF receipt.actor=actor OR EXISTS(SELECT 1 FROM public.order_payment_proofs pr WHERE pr.payment_id=pay.id AND pr.uploaded_by=actor) THEN RAISE EXCEPTION 'Outra pessoa deve revisar o pagamento que você registrou.'; END IF;
 IF p_expected_amount IS NOT NULL AND p_expected_amount IS DISTINCT FROM pay.amount THEN RAISE EXCEPTION 'Pagamento alterado. Atualize a fila.'; END IF;
 SELECT * INTO cr FROM private.customer_credit_requests WHERE payment_id=pay.id;
 IF p_decision='adjust' AND FOUND THEN
  IF p_method IS DISTINCT FROM pay.method THEN RAISE EXCEPTION 'Mantenha a forma de uso do crédito; reprove para substituir o lançamento.'; END IF;
  SELECT balance INTO credit_balance FROM public.customer_credit_accounts WHERE customer_id=cr.customer_id AND currency=cr.currency FOR UPDATE;
  SELECT coalesce(sum(r.amount),0) INTO other_reserved FROM private.customer_credit_requests r JOIN public.payments p ON p.id=r.payment_id WHERE r.customer_id=cr.customer_id AND r.currency=cr.currency AND r.payment_id<>pay.id AND p.status='pendente';
  IF p_amount IS NULL OR p_amount>coalesce(credit_balance,0)-other_reserved THEN RAISE EXCEPTION 'Crédito disponível insuficiente para o ajuste.'; END IF;
 ELSIF p_decision='adjust' AND lower(btrim(coalesce(p_method,''))) NOT IN('dinheiro','pix','transferencia','transferência','cartao','cartão','boleto') THEN RAISE EXCEPTION 'Use a solicitação de crédito para abater o saldo do cliente.'; END IF;
 IF p_decision='adjust' THEN
  SELECT coalesce(sum(amount),0) INTO paid FROM public.payments WHERE order_id=o.id AND status='pago';
  IF p_amount IS NULL OR p_amount<=0 OR p_amount::text IN ('NaN','Infinity','-Infinity') OR p_amount>greatest(0,o.total-paid) OR p_paid_at IS NULL OR btrim(coalesce(p_method,''))='' THEN RAISE EXCEPTION 'Valor, data ou forma de pagamento inválidos.'; END IF;
 END IF;
 entered:=private.remuneration_enter_review_context(o.id);
 INSERT INTO private.remuneration_action_context VALUES(pg_backend_pid(),txid_current(),actor,'payment') ON CONFLICT DO NOTHING RETURNING true INTO ctx;
 IF p_decision='adjust' THEN
  UPDATE public.payments SET amount=round(p_amount,2),paid_at=p_paid_at,method=btrim(p_method),review_decision='adjusted',review_note=p_reason,reviewed_by=actor,reviewed_at=now() WHERE id=pay.id;
  UPDATE private.customer_credit_requests SET amount=round(p_amount,2) WHERE payment_id=pay.id;
  IF cr.payment_id IS NOT NULL THEN
   UPDATE public.payments SET received_amount=round(p_amount,2),received_currency=o.currency,
   settled_amount_brl=p_amount*(o.exchange_rates_snapshot->>'BRL')::numeric,
   settled_amount_usd=p_amount*(o.exchange_rates_snapshot->>'USD')::numeric,
   settled_amount_pyg=p_amount*(o.exchange_rates_snapshot->>'PYG')::numeric WHERE id=pay.id;
  END IF;
 ELSE
  -- Keep the original proof and values; only confirmed receipts ever count as paid.
  UPDATE public.payments SET status='cancelado',review_decision=CASE p_decision WHEN 'reject' THEN 'rejected' ELSE 'changes_requested' END,review_note=p_reason,reviewed_by=actor,reviewed_at=now() WHERE id=pay.id;
 END IF;
 INSERT INTO public.order_audit_log(order_id,root_order_id,revision_no,action,changed_by,note,previous_snapshot,new_snapshot)
 VALUES(o.id,coalesce(o.root_order_id,o.id),o.revision_no,'pagamento_registrado',actor,p_reason,jsonb_build_object('payment',to_jsonb(pay)),jsonb_build_object('decision',p_decision,'payment',(SELECT to_jsonb(p) FROM public.payments p WHERE p.id=pay.id)));
 INSERT INTO private.integral_payment_reviews(payment_id,order_id,decision,reviewed_by,note,previous_snapshot,new_snapshot)
 VALUES(pay.id,o.id,CASE p_decision WHEN 'reject' THEN 'rejected' WHEN 'request_changes' THEN 'changes_requested' ELSE 'adjusted' END,actor,p_reason,to_jsonb(pay),(SELECT to_jsonb(p) FROM public.payments p WHERE p.id=pay.id));
 PERFORM private.remuneration_notify(o.id,CASE p_decision WHEN 'reject' THEN 'Pagamento reprovado' WHEN 'request_changes' THEN 'Correção solicitada no pagamento' ELSE 'Pagamento ajustado para conferência' END,'Pedido #'||o.number||': '||p_reason||CASE WHEN p_decision='adjust' THEN '. Ainda aguarda confirmação financeira.' WHEN p_decision='request_changes' THEN '. Registre novamente o pagamento corrigido com o comprovante.' ELSE '. Este lançamento não foi contabilizado como recebido.' END,'payment_review');
 IF coalesce(ctx,false) THEN DELETE FROM private.remuneration_action_context c WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.actor=actor; END IF;
 IF entered THEN DELETE FROM private.seller_creation_context c WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.actor=actor; END IF;
 RETURN jsonb_build_object('payment_id',pay.id,'decision',p_decision,'confirmed',false);
END $function$;