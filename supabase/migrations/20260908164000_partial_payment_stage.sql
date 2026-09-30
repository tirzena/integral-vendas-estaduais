-- Mantém pagamento parcial separado de pedidos sem pagamento e de pedidos quitados.
ALTER TABLE public.order_payment_proofs
  ADD COLUMN IF NOT EXISTS proof_type text NOT NULL DEFAULT 'arquivo';

CREATE OR REPLACE FUNCTION public.sales_set_stage(p_order_id uuid,p_stage text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid(); o public.orders%ROWTYPE; paid_total numeric:=0; before_snapshot jsonb; root_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF p_stage NOT IN ('pedido_feito','em_caminho','vendido','pagamento_parcial','esperando_pagamento') THEN
    RAISE EXCEPTION 'Estágio inválido.';
  END IF;
  SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF o.id IS NULL OR NOT public.sales_can_manage(uid,o.seller_id) THEN RAISE EXCEPTION 'Sem permissão para alterar o pedido.'; END IF;
  IF o.status='cancelado' OR o.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Pedido cancelado ou excluído não pode mudar.'; END IF;

  SELECT coalesce(sum(amount),0) INTO paid_total FROM public.payments WHERE order_id=o.id AND status='pago';
  paid_total:=round(paid_total,2);
  IF p_stage='vendido' AND NOT EXISTS (SELECT 1 FROM public.order_payment_proofs WHERE order_id=o.id) THEN
    RAISE EXCEPTION 'Envie um comprovante antes de marcar o pedido como pago.';
  END IF;
  IF p_stage='vendido' AND paid_total<>round(o.total,2) THEN
    RAISE EXCEPTION 'O pedido ainda possui saldo. Registre o pagamento recebido antes de marcar como pago.';
  END IF;
  IF p_stage='pagamento_parcial' AND NOT (paid_total>0 AND paid_total<round(o.total,2)) THEN
    RAISE EXCEPTION 'Pagamento parcial exige um valor recebido maior que zero e menor que o total.';
  END IF;
  IF p_stage='esperando_pagamento' AND paid_total>0 THEN
    RAISE EXCEPTION 'Este pedido já possui pagamento. Use Pagamento parcial.';
  END IF;

  before_snapshot:=public.sales_order_snapshot(o.id); root_id:=coalesce(o.root_order_id,o.id);
  IF p_stage IN ('em_caminho','vendido','pagamento_parcial','esperando_pagamento') AND o.stock_state='reservado' THEN
    PERFORM public.sales_apply_stock(o.id,'baixar_reservado',uid);
  END IF;
  IF p_stage='vendido' THEN
    UPDATE public.accounts_receivable SET status='pago',paid_at=coalesce(paid_at,current_date),updated_at=now()
      WHERE order_id=o.id AND status<>'cancelado';
  ELSIF p_stage IN ('esperando_pagamento','pagamento_parcial') THEN
    IF EXISTS(SELECT 1 FROM public.accounts_receivable WHERE order_id=o.id AND status<>'cancelado') THEN
      UPDATE public.accounts_receivable SET amount=greatest(0,o.total-paid_total),currency=o.currency,status='pendente',paid_at=NULL,updated_at=now()
        WHERE order_id=o.id AND status<>'cancelado';
    ELSE
      INSERT INTO public.accounts_receivable(description,customer_id,product_id,order_id,amount,currency,due_date,status)
      VALUES('Saldo do pedido '||coalesce(o.number::text,o.id::text),o.customer_id,o.product_id,o.id,
        greatest(0,o.total-paid_total),o.currency,current_date,'pendente');
    END IF;
  END IF;

  UPDATE public.orders SET workflow_stage=p_stage,
    kind=CASE WHEN p_stage IN ('em_caminho','vendido','pagamento_parcial','esperando_pagamento') THEN 'venda' ELSE kind END,
    stock_state=CASE WHEN p_stage IN ('em_caminho','vendido','pagamento_parcial','esperando_pagamento') THEN 'baixado' ELSE stock_state END,
    payment_status=CASE WHEN p_stage='vendido' THEN 'pago' WHEN p_stage='pagamento_parcial' THEN 'parcial'
      WHEN p_stage='esperando_pagamento' THEN 'a_pagar' ELSE payment_status END,
    amount_paid=CASE WHEN p_stage IN ('vendido','pagamento_parcial') THEN paid_total
      WHEN p_stage='esperando_pagamento' THEN 0 ELSE amount_paid END,
    amount_receivable=CASE WHEN p_stage IN ('vendido','pagamento_parcial') THEN greatest(0,total-paid_total)
      WHEN p_stage='esperando_pagamento' THEN total ELSE amount_receivable END,
    fulfillment_status=CASE WHEN p_stage='em_caminho' THEN 'a_caminho' WHEN p_stage='vendido' THEN 'entregue' ELSE fulfillment_status END,
    status=CASE WHEN p_stage='vendido' THEN 'entregue' WHEN p_stage IN ('pagamento_parcial','esperando_pagamento') THEN 'faturado' ELSE status END,
    delivered_at=CASE WHEN p_stage='vendido' THEN coalesce(delivered_at,current_date) ELSE delivered_at END,
    tracking_status=CASE WHEN p_stage='em_caminho' THEN 'Em caminho' WHEN p_stage='vendido' THEN 'Entregue' ELSE tracking_status END
    WHERE id=o.id;
  INSERT INTO public.order_audit_log(order_id,root_order_id,revision_no,action,changed_by,note,previous_snapshot,new_snapshot)
  VALUES(o.id,root_id,o.revision_no,'status_alterado',uid,'Situação alterada para '||p_stage,before_snapshot,public.sales_order_snapshot(o.id));
  RETURN jsonb_build_object('id',o.id,'stage',p_stage);
END $$;
REVOKE ALL ON FUNCTION public.sales_set_stage(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_set_stage(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.sales_register_payment(
  p_order_id uuid,p_amount numeric,p_method text,p_proof_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid(); o public.orders%ROWTYPE; proof public.order_payment_proofs%ROWTYPE;
  paid_total numeric:=0; remaining numeric:=0; new_payment_id uuid; root_id uuid; before_snapshot jsonb; next_stage text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF o.id IS NULL OR o.status='cancelado' OR o.deleted_at IS NOT NULL OR NOT public.sales_can_manage(uid,o.seller_id) THEN
    RAISE EXCEPTION 'Sem permissão para registrar pagamento neste pedido.';
  END IF;
  SELECT * INTO proof FROM public.order_payment_proofs WHERE id=p_proof_id AND order_id=o.id AND payment_id IS NULL FOR UPDATE;
  IF proof.id IS NULL THEN RAISE EXCEPTION 'Selecione um comprovante ainda não utilizado.'; END IF;
  IF coalesce(p_amount,0)<=0 OR coalesce(btrim(p_method),'')='' THEN RAISE EXCEPTION 'Informe valor e forma de pagamento.'; END IF;
  SELECT coalesce(sum(amount),0) INTO paid_total FROM public.payments WHERE order_id=o.id AND status='pago';
  remaining:=round(o.total-paid_total,2);
  IF round(p_amount,2)>remaining THEN RAISE EXCEPTION 'O pagamento é maior que o saldo restante.'; END IF;
  before_snapshot:=public.sales_order_snapshot(o.id); root_id:=coalesce(o.root_order_id,o.id);
  IF o.stock_state='reservado' THEN PERFORM public.sales_apply_stock(o.id,'baixar_reservado',uid); END IF;
  INSERT INTO public.payments(order_id,amount,currency,method,paid_at,installment,status)
    VALUES(o.id,round(p_amount,2),o.currency,btrim(p_method),current_date,1,'pago') RETURNING id INTO new_payment_id;
  UPDATE public.order_payment_proofs SET payment_id=new_payment_id WHERE id=proof.id;
  paid_total:=round(paid_total+p_amount,2); remaining:=greatest(0,round(o.total-paid_total,2));
  next_stage:=CASE WHEN remaining=0 THEN 'vendido' ELSE 'pagamento_parcial' END;
  UPDATE public.orders SET kind='venda',stock_state='baixado',amount_paid=paid_total,amount_receivable=remaining,
    payment_status=CASE WHEN remaining=0 THEN 'pago' ELSE 'parcial' END,
    workflow_stage=next_stage,status=CASE WHEN remaining=0 THEN 'entregue' ELSE 'faturado' END,
    delivered_at=CASE WHEN remaining=0 THEN coalesce(delivered_at,current_date) ELSE delivered_at END WHERE id=o.id;
  IF EXISTS(SELECT 1 FROM public.accounts_receivable WHERE order_id=o.id AND status<>'cancelado') THEN
    UPDATE public.accounts_receivable SET amount=remaining,status=CASE WHEN remaining=0 THEN 'pago' ELSE 'pendente' END,
      paid_at=CASE WHEN remaining=0 THEN current_date ELSE NULL END,updated_at=now() WHERE order_id=o.id AND status<>'cancelado';
  ELSIF remaining>0 THEN
    INSERT INTO public.accounts_receivable(description,customer_id,product_id,order_id,amount,currency,due_date,status)
      VALUES('Saldo do pedido '||coalesce(o.number::text,o.id::text),o.customer_id,o.product_id,o.id,remaining,o.currency,current_date,'pendente');
  END IF;
  INSERT INTO public.order_audit_log(order_id,root_order_id,revision_no,action,changed_by,note,previous_snapshot,new_snapshot)
    VALUES(o.id,root_id,o.revision_no,'pagamento_registrado',uid,
      'Pagamento registrado: '||round(p_amount,2)||' '||o.currency||'. Saldo: '||remaining||' '||o.currency,
      before_snapshot,public.sales_order_snapshot(o.id));
  RETURN jsonb_build_object('id',o.id,'payment_id',new_payment_id,'paid',paid_total,'remaining',remaining,'stage',next_stage);
END $$;
REVOKE ALL ON FUNCTION public.sales_register_payment(uuid,numeric,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_register_payment(uuid,numeric,text,uuid) TO authenticated;

-- Ao editar um pedido, preserva todos os pagamentos e comprovantes na nova versão.
CREATE OR REPLACE FUNCTION public.sales_replace_order_version(
  p_previous_order_id uuid,p_customer_id uuid,p_product_id uuid,p_currency public.currency_code,
  p_discount numeric,p_shipping_cost numeric,p_shipping_percentage numeric,p_notes text,p_whatsapp text,
  p_items jsonb,p_warehouse_id uuid,p_shipping_address text,p_shipping_city text,p_shipping_state text,
  p_delivery_deadline date,p_carrier text,p_tracking_code text,p_revision_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  uid uuid:=auth.uid(); old public.orders%ROWTYPE; created jsonb; new_id uuid; root_id uuid;
  old_snapshot jsonb; new_snapshot jsonb; next_revision integer; old_stage text; old_kind text;
  paid_ids uuid[]; paid_total numeric:=0; remaining numeric:=0; next_stage text; pay record; new_payment_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF p_customer_id IS NULL THEN RAISE EXCEPTION 'Cliente é obrigatório no pedido.'; END IF;
  IF length(btrim(coalesce(p_revision_note,'')))<5 THEN
    RAISE EXCEPTION 'Descreva a alteração realizada (mínimo 5 caracteres).';
  END IF;
  SELECT * INTO old FROM public.orders WHERE id=p_previous_order_id FOR UPDATE;
  IF old.id IS NULL OR old.deleted_at IS NOT NULL OR old.superseded_at IS NOT NULL THEN
    RAISE EXCEPTION 'Pedido não encontrado ou já substituído.';
  END IF;
  IF old.status='cancelado' OR NOT public.sales_can_manage(uid,old.seller_id) THEN
    RAISE EXCEPTION 'Sem permissão para editar este pedido.';
  END IF;

  old_snapshot:=public.sales_order_snapshot(old.id);
  root_id:=coalesce(old.root_order_id,old.id);
  next_revision:=coalesce(old.revision_no,1)+1;
  old_stage:=coalesce(old.workflow_stage,'pedido_feito');
  old_kind:=old.kind;
  SELECT coalesce(array_agg(id),'{}'::uuid[]),coalesce(sum(amount),0)
    INTO paid_ids,paid_total FROM public.payments WHERE order_id=old.id AND status='pago';

  PERFORM public.sales_cancel_order(old.id,'Substituído pela revisão '||next_revision||': '||btrim(p_revision_note));
  created:=public.sales_create_document_v2('pre_pedido',p_customer_id,p_product_id,p_currency,p_discount,
    p_shipping_cost,p_shipping_percentage,p_notes,NULL,NULL,NULL,p_whatsapp,'edicao',p_items,'[]'::jsonb);
  new_id:=(created->>'id')::uuid;
  IF round(paid_total,2)>round((SELECT total FROM public.orders WHERE id=new_id),2) THEN
    RAISE EXCEPTION 'O novo total não pode ser menor que o valor já pago. Registre o ajuste financeiro antes de editar.';
  END IF;

  PERFORM public.sales_update_order_logistics(new_id,p_warehouse_id,p_shipping_address,p_shipping_city,p_shipping_state);
  UPDATE public.orders SET seller_id=old.seller_id,root_order_id=root_id,previous_order_id=old.id,
    revision_no=next_revision,delivery_deadline=p_delivery_deadline,
    carrier=nullif(btrim(p_carrier),''),tracking_code=nullif(btrim(p_tracking_code),'') WHERE id=new_id;

  FOR pay IN SELECT * FROM public.payments WHERE id=ANY(paid_ids) ORDER BY created_at LOOP
    INSERT INTO public.payments(order_id,amount,currency,method,paid_at,due_date,installment,status,created_at,
      settled_amount_brl,settled_amount_usd,settled_amount_pyg,exchange_rates_snapshot,exchange_rate_source,exchange_rate_locked_at)
    VALUES(new_id,pay.amount,pay.currency,pay.method,pay.paid_at,pay.due_date,pay.installment,'pago',pay.created_at,
      pay.settled_amount_brl,pay.settled_amount_usd,pay.settled_amount_pyg,pay.exchange_rates_snapshot,pay.exchange_rate_source,pay.exchange_rate_locked_at)
    RETURNING id INTO new_payment_id;
    INSERT INTO public.order_payment_proofs(order_id,payment_id,proof_type,file_path,external_url,file_name,mime_type,uploaded_by,created_at)
      SELECT new_id,new_payment_id,proof_type,file_path,external_url,file_name,mime_type,uploaded_by,created_at
      FROM public.order_payment_proofs WHERE order_id=old.id AND payment_id=pay.id;
  END LOOP;
  INSERT INTO public.order_payment_proofs(order_id,payment_id,proof_type,file_path,external_url,file_name,mime_type,uploaded_by,created_at)
    SELECT new_id,NULL,proof_type,file_path,external_url,file_name,mime_type,uploaded_by,created_at
    FROM public.order_payment_proofs WHERE order_id=old.id AND payment_id IS NULL;

  remaining:=greatest(0,round((SELECT total FROM public.orders WHERE id=new_id)-paid_total,2));
  next_stage:=CASE WHEN remaining=0 AND paid_total>0 THEN 'vendido'
    WHEN paid_total>0 THEN 'pagamento_parcial' ELSE old_stage END;
  IF next_stage IN ('esperando_pagamento','em_caminho','vendido','pagamento_parcial') THEN
    PERFORM public.sales_apply_stock(new_id,'baixar_reservado',uid);
    UPDATE public.orders SET kind='venda',stock_state='baixado',workflow_stage=next_stage,
      status=CASE WHEN next_stage='vendido' THEN 'entregue' ELSE 'faturado' END,
      payment_status=CASE WHEN next_stage='vendido' THEN 'pago' WHEN next_stage='pagamento_parcial' THEN 'parcial'
        WHEN next_stage='esperando_pagamento' THEN 'a_pagar' ELSE old.payment_status END,
      amount_paid=paid_total,amount_receivable=remaining,
      fulfillment_status=CASE WHEN next_stage='em_caminho' THEN 'a_caminho' WHEN next_stage='vendido' THEN 'entregue' ELSE old.fulfillment_status END,
      delivered_at=CASE WHEN next_stage='vendido' THEN coalesce(old.delivered_at,current_date) ELSE old.delivered_at END,
      tracking_status=CASE WHEN next_stage='em_caminho' THEN 'Em caminho' WHEN next_stage='vendido' THEN 'Entregue' ELSE old.tracking_status END
      WHERE id=new_id;
  ELSE
    UPDATE public.orders SET kind=old_kind,workflow_stage='pedido_feito',amount_paid=paid_total,amount_receivable=remaining WHERE id=new_id;
  END IF;
  IF remaining>0 AND next_stage IN ('esperando_pagamento','pagamento_parcial') THEN
    INSERT INTO public.accounts_receivable(description,customer_id,product_id,order_id,amount,currency,due_date,status)
      SELECT 'Saldo do pedido '||number,customer_id,product_id,id,remaining,currency,current_date,'pendente'
      FROM public.orders WHERE id=new_id;
  END IF;

  UPDATE public.orders SET superseded_at=now(),superseded_by=uid,superseded_by_order_id=new_id WHERE id=old.id;
  new_snapshot:=public.sales_order_snapshot(new_id);
  INSERT INTO public.order_audit_log(order_id,root_order_id,revision_no,action,changed_by,note,previous_snapshot,new_snapshot)
    VALUES(new_id,root_id,next_revision,'versao_criada',uid,btrim(p_revision_note),old_snapshot,new_snapshot);
  RETURN jsonb_build_object('id',new_id,'number',created->'number','revision_no',next_revision,'root_order_id',root_id);
END $$;
REVOKE ALL ON FUNCTION public.sales_replace_order_version(uuid,uuid,uuid,public.currency_code,numeric,numeric,numeric,text,text,jsonb,uuid,text,text,text,date,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_replace_order_version(uuid,uuid,uuid,public.currency_code,numeric,numeric,numeric,text,text,jsonb,uuid,text,text,text,date,text,text,text) TO authenticated;
