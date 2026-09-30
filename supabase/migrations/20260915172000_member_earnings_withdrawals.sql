-- Retirada acumulada de comissões e bonificações; grava somente uma saída na folha.
CREATE OR REPLACE FUNCTION public.finance_withdraw_member_earnings(
 p_user_id uuid,p_product_id uuid,p_amount numeric,p_currency public.currency_code,
 p_paid_at date,p_notes text,p_request_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE released numeric:=0; bonus numeric:=0; taken numeric:=0; rate numeric; request_amount numeric; existing public.payroll_entries%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Apenas administradores podem registrar retiradas.'; END IF;
 IF p_amount IS NULL OR p_amount<=0 OR p_amount::text IN ('NaN','Infinity','-Infinity') OR p_currency IS NULL OR p_paid_at IS NULL OR p_paid_at>CURRENT_DATE OR p_request_id IS NULL THEN RAISE EXCEPTION 'Informe valor positivo, moeda e data válida.'; END IF;
 IF p_product_id IS NOT NULL THEN RAISE EXCEPTION 'Retiradas são consolidadas em todas as categorias.'; END IF;
 -- Serializa retiradas do mesmo membro inclusive entre categorias.
 PERFORM 1 FROM public.profiles WHERE id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Membro não encontrado.'; END IF;
 SELECT * INTO existing FROM public.payroll_entries WHERE id=p_request_id;
 IF FOUND THEN
   IF existing.user_id=p_user_id AND existing.amount=p_amount AND existing.currency=p_currency AND existing.product_id IS NOT DISTINCT FROM p_product_id AND existing.paid_at=p_paid_at THEN RETURN existing.id; END IF;
   RAISE EXCEPTION 'Identificador de retirada já utilizado.';
 END IF;
 SELECT r.rate INTO rate FROM public.financial_rate_at(p_currency,'USD',p_paid_at::timestamptz) r LIMIT 1;
 IF rate IS NULL OR rate<=0 THEN RAISE EXCEPTION 'Cotação indisponível para a data da retirada.'; END IF;
 request_amount:=p_amount*rate;
 SELECT coalesce(sum(greatest(0,o.commission_total)*coalesce((o.exchange_rates_snapshot->>'USD')::numeric,fr.rate)*
 CASE WHEN o.total>0 THEN least(1,greatest(0,coalesce(pay.amount,0)/o.total)) ELSE 0 END),0) INTO released
 FROM public.orders o
 LEFT JOIN LATERAL public.financial_rate_at(o.currency,'USD',now()) fr ON true
 LEFT JOIN LATERAL (
  SELECT sum(CASE o.currency WHEN 'USD' THEN coalesce(p.settled_amount_usd,p.amount*pr.rate) WHEN 'BRL' THEN coalesce(p.settled_amount_brl,p.amount*pr.rate) ELSE coalesce(p.settled_amount_pyg,p.amount*pr.rate) END) amount
  FROM public.payments p LEFT JOIN LATERAL public.financial_rate_at(p.currency,o.currency,now()) pr ON true
  WHERE p.order_id=o.id AND p.status='pago' AND coalesce(p.paid_at::timestamptz,p.created_at)<=now()
 ) pay ON true
 WHERE o.seller_id=p_user_id AND o.kind='venda' AND o.deleted_at IS NULL AND o.superseded_at IS NULL
 AND o.status<>'cancelado' AND coalesce(o.workflow_stage,'') NOT IN ('cancelado','rascunho','solicitacao_catalogo') AND (p_product_id IS NULL OR o.product_id=p_product_id);
 SELECT coalesce(sum(b.amount*fr.rate),0),coalesce(sum(CASE WHEN b.status='pago' THEN b.amount*fr.rate ELSE 0 END),0) INTO bonus,taken
 FROM public.bonus_awards b LEFT JOIN LATERAL public.financial_rate_at(b.currency,'USD',now()) fr ON true
 WHERE b.user_id=p_user_id AND b.status<>'cancelado' AND (p_product_id IS NULL OR b.product_id=p_product_id);
 SELECT taken+coalesce(sum(coalesce(p.settled_amount_usd,p.amount*fr.rate)),0) INTO taken
 FROM public.payroll_entries p LEFT JOIN LATERAL public.financial_rate_at(p.currency,'USD',now()) fr ON true
 WHERE p.user_id=p_user_id AND p.status='pago' AND p.entry_type IN ('commission','comissao','bonus','bonificacao') AND (p_product_id IS NULL OR p.product_id=p_product_id);
 IF request_amount>greatest(0,released+bonus-taken)+0.0001 THEN RAISE EXCEPTION 'Retirada excede o saldo liberado. Atualize a tela e confira os pagamentos.'; END IF;
 INSERT INTO public.payroll_entries(id,user_id,product_id,entry_type,description,amount,currency,status,paid_at)
 VALUES(p_request_id,p_user_id,p_product_id,'commission','Retirada de comissões / bonificações' || CASE WHEN nullif(trim(p_notes),'') IS NULL THEN '' ELSE ' · '||left(trim(p_notes),1000) END,p_amount,p_currency,'pago',p_paid_at);
 RETURN p_request_id;
END $$;
REVOKE ALL ON FUNCTION public.finance_withdraw_member_earnings(uuid,uuid,numeric,public.currency_code,date,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_withdraw_member_earnings(uuid,uuid,numeric,public.currency_code,date,text,uuid) TO authenticated;
