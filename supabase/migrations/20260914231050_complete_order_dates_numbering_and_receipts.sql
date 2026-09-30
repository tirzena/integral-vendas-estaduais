-- Datas editáveis, pedidos flexíveis, recibos históricos e sequência estável.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shipping_country text;

CREATE OR REPLACE FUNCTION public.sales_next_number(p_scope text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE next_number integer;
BEGIN
  IF p_scope = 'orders' THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('sales_next_number:' || p_scope));
    SELECT coalesce(max(number), 0) + 1 INTO next_number
    FROM public.orders
    WHERE deleted_at IS NULL AND superseded_at IS NULL AND status <> 'cancelado';
    INSERT INTO public.document_counters(scope,last_number,updated_at)
    VALUES (p_scope,next_number,now())
    ON CONFLICT (scope) DO UPDATE
      SET last_number=excluded.last_number,updated_at=now();
    RETURN next_number;
  END IF;

  INSERT INTO public.document_counters(scope,last_number,updated_at)
  VALUES (p_scope,1,now())
  ON CONFLICT (scope) DO UPDATE
    SET last_number=public.document_counters.last_number+1,updated_at=now()
  RETURNING last_number INTO next_number;
  RETURN next_number;
END $$;
REVOKE ALL ON FUNCTION public.sales_next_number(text) FROM PUBLIC,anon,authenticated;

-- Mantém recibos emitidos acessíveis mesmo quando o pedido foi revisado e o
-- pagamento original passou a fazer parte do histórico da versão anterior.
CREATE OR REPLACE FUNCTION public.public_payment_receipt(p_token uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object(
    'payment_id',p.id,'amount',p.amount,'currency',p.currency,'method',p.method,
    'paid_at',p.paid_at,'created_at',p.created_at,'order_number',o.number,
    'order_revision',o.revision_no,'customer_name',c.name,
    'recipient_name',o.delivery_recipient_name,'seller_name',seller.full_name
  )
  FROM public.payments p
  JOIN public.orders o ON o.id=p.order_id
  LEFT JOIN public.customers c ON c.id=o.customer_id
  LEFT JOIN public.profiles seller ON seller.id=o.seller_id
  WHERE p.receipt_token=p_token
    AND EXISTS (
      SELECT 1 FROM public.order_payment_proofs proof
      WHERE proof.payment_id=p.id AND proof.proof_type='recibo_sistema'
    )
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.public_payment_receipt(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_payment_receipt(uuid) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.sales_update_order_dates(
  p_order_id uuid,p_order_date date,p_delivery_deadline date,p_delivered_at date,
  p_shipping_country text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid(); o public.orders%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF o.id IS NULL OR o.deleted_at IS NOT NULL OR NOT public.sales_can_manage(uid,o.seller_id) THEN
    RAISE EXCEPTION 'Sem permissão para editar as datas deste pedido.';
  END IF;
  UPDATE public.orders SET
    order_date=coalesce(p_order_date,order_date),
    delivery_deadline=p_delivery_deadline,
    delivered_at=p_delivered_at,
    shipping_country=nullif(btrim(p_shipping_country),'')
  WHERE id=o.id;
  RETURN jsonb_build_object('id',o.id,'order_date',coalesce(p_order_date,o.order_date),
    'delivery_deadline',p_delivery_deadline,'delivered_at',p_delivered_at);
END $$;
REVOKE ALL ON FUNCTION public.sales_update_order_dates(uuid,date,date,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_update_order_dates(uuid,date,date,date,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.sales_update_payment_date(
  p_order_id uuid,p_payment_id uuid,p_paid_at date
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid(); o public.orders%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF o.id IS NULL OR o.deleted_at IS NOT NULL OR NOT public.sales_can_manage(uid,o.seller_id) THEN
    RAISE EXCEPTION 'Sem permissão para editar este pagamento.';
  END IF;
  UPDATE public.payments SET paid_at=coalesce(p_paid_at,current_date)
  WHERE id=p_payment_id AND order_id=o.id AND status='pago';
  IF NOT FOUND THEN RAISE EXCEPTION 'Pagamento não encontrado.'; END IF;
  RETURN jsonb_build_object('id',p_payment_id,'paid_at',coalesce(p_paid_at,current_date));
END $$;
REVOKE ALL ON FUNCTION public.sales_update_payment_date(uuid,uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_update_payment_date(uuid,uuid,date) TO authenticated;

-- A nova versão conserva o número visível do pedido original. A revisão é
-- exibida como #01.1, #01.2 etc.
CREATE OR REPLACE FUNCTION public.sales_preserve_revision_number(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid(); current_order public.orders%ROWTYPE; previous_number integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  SELECT * INTO current_order FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF current_order.id IS NULL OR current_order.previous_order_id IS NULL
    OR NOT public.sales_can_manage(uid,current_order.seller_id) THEN
    RAISE EXCEPTION 'Versão do pedido não encontrada.';
  END IF;
  SELECT number INTO previous_number FROM public.orders WHERE id=current_order.previous_order_id;
  UPDATE public.orders SET number=previous_number WHERE id=current_order.id;
  UPDATE public.document_counters SET
    last_number=(SELECT coalesce(max(number),0) FROM public.orders
      WHERE deleted_at IS NULL AND superseded_at IS NULL AND status<>'cancelado'),
    updated_at=now()
  WHERE scope='orders';
  RETURN jsonb_build_object('id',current_order.id,'number',previous_number,
    'revision_no',current_order.revision_no);
END $$;
REVOKE ALL ON FUNCTION public.sales_preserve_revision_number(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_preserve_revision_number(uuid) TO authenticated;

-- A função base passa a aceitar pedido sem cliente e sem itens. O vendedor e
-- o estoque continuam validados pela tela e pelas funções de autorização.
CREATE OR REPLACE FUNCTION public.sales_create_document_v2_without_cash_receipt(
  p_kind text,p_customer_id uuid,p_product_id uuid,
  p_currency public.currency_code,p_discount numeric,p_shipping_cost numeric,p_shipping_percentage numeric,p_notes text,
  p_payment_method text,p_payment_installments text,p_valid_until date,p_whatsapp text,p_origin text,p_items jsonb,p_payments jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid(); gross numeric:=0; total numeric:=0; paid numeric:=0;
  n integer; new_id uuid; li jsonb; pay jsonb; amount numeric; safe_items jsonb:=coalesce(p_items,'[]'::jsonb);
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF p_kind NOT IN ('venda','pre_pedido') THEN RAISE EXCEPTION 'Tipo de pedido inválido.'; END IF;
  IF jsonb_typeof(safe_items)<>'array' THEN RAISE EXCEPTION 'Itens inválidos.'; END IF;
  IF coalesce(p_discount,0)<0 OR coalesce(p_shipping_cost,0)<0 THEN RAISE EXCEPTION 'Desconto ou frete inválido.'; END IF;
  IF jsonb_array_length(safe_items)>0 THEN
    PERFORM public.sales_validate_items(uid,p_product_id,safe_items);
  END IF;
  FOR li IN SELECT * FROM jsonb_array_elements(safe_items) LOOP
    gross:=gross+greatest(0,round((li->>'quantity')::numeric*coalesce((li->>'unit_price')::numeric,0)-coalesce((li->>'discount')::numeric,0),2));
  END LOOP;
  IF coalesce(p_discount,0)>gross THEN RAISE EXCEPTION 'Desconto maior que o total.'; END IF;
  total:=greatest(0,round(gross-coalesce(p_discount,0)+coalesce(p_shipping_cost,0),2));
  n:=public.sales_next_number('orders');
  INSERT INTO public.orders(number,customer_id,product_id,seller_id,currency,discount,shipping_cost,shipping_percentage,total,
    status,kind,stock_state,notes,payment_method,payment_installments,whatsapp,origin,order_date)
  VALUES(n,p_customer_id,p_product_id,uid,p_currency,coalesce(p_discount,0),coalesce(p_shipping_cost,0),p_shipping_percentage,total,
    CASE WHEN p_kind='venda' THEN 'faturado' ELSE 'pre_pedido' END,p_kind,
    CASE WHEN p_kind='venda' THEN 'baixado' WHEN jsonb_array_length(safe_items)>0 THEN 'reservado' ELSE 'nenhum' END,
    p_notes,p_payment_method,p_payment_installments,p_whatsapp,coalesce(p_origin,'pdv'),current_date)
  RETURNING id INTO new_id;
  UPDATE public.orders SET root_order_id=new_id WHERE id=new_id;
  INSERT INTO public.order_items(order_id,item_id,description,sku,barcode,unit,quantity,unit_price,discount,total)
  SELECT new_id,nullif(e.value->>'item_id','')::uuid,e.value->>'description',e.value->>'sku',e.value->>'barcode',e.value->>'unit',
    (e.value->>'quantity')::numeric,coalesce((e.value->>'unit_price')::numeric,0),coalesce((e.value->>'discount')::numeric,0),
    greatest(0,round((e.value->>'quantity')::numeric*coalesce((e.value->>'unit_price')::numeric,0)-coalesce((e.value->>'discount')::numeric,0),2))
  FROM jsonb_array_elements(safe_items) e(value);
  IF p_kind='venda' THEN
    IF jsonb_array_length(safe_items)>0 THEN PERFORM public.sales_apply_stock(new_id,'baixar',uid); END IF;
    IF p_payments IS NULL OR jsonb_array_length(p_payments)=0 THEN RAISE EXCEPTION 'Informe os pagamentos da venda.'; END IF;
    FOR pay IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
      amount:=coalesce((pay->>'amount')::numeric,0);
      IF amount<=0 THEN RAISE EXCEPTION 'Pagamento inválido.'; END IF;
      paid:=paid+round(amount,2);
    END LOOP;
    IF round(paid,2)<>total THEN RAISE EXCEPTION 'A soma dos pagamentos precisa ser igual ao total com frete.'; END IF;
    FOR pay IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
      INSERT INTO public.payments(order_id,amount,currency,method,paid_at,installment,status)
      VALUES(new_id,round((pay->>'amount')::numeric,2),p_currency,pay->>'method',
        coalesce(nullif(pay->>'paid_at','')::date,current_date),nullif(pay->>'installment','')::integer,'pago');
    END LOOP;
  ELSIF jsonb_array_length(safe_items)>0 THEN
    PERFORM public.sales_apply_stock(new_id,'reservar',uid);
  END IF;
  RETURN jsonb_build_object('id',new_id,'number',n,'kind',p_kind,'total',total);
END $$;
REVOKE ALL ON FUNCTION public.sales_create_document_v2_without_cash_receipt(
  text,uuid,uuid,public.currency_code,numeric,numeric,numeric,text,text,text,date,text,text,jsonb,jsonb
) FROM PUBLIC,anon;

-- Pedidos já cancelados deixam de participar das telas e dos totais.
UPDATE public.payments p SET status='cancelado'
FROM public.orders o
WHERE p.order_id=o.id AND o.status='cancelado' AND p.status<>'cancelado';
UPDATE public.accounts_receivable ar SET status='cancelado'
FROM public.orders o
WHERE ar.order_id=o.id AND o.status='cancelado' AND ar.status<>'cancelado';
UPDATE public.orders SET deleted_at=coalesce(deleted_at,cancelled_at,now()),stock_state='nenhum'
WHERE status='cancelado' AND deleted_at IS NULL;

DROP INDEX IF EXISTS public.orders_active_number_uq;
WITH ordered AS (
  SELECT id,row_number() OVER (ORDER BY created_at,id)::integer AS seq
  FROM public.orders
  WHERE deleted_at IS NULL AND superseded_at IS NULL AND status<>'cancelado'
)
UPDATE public.orders o SET number=-ordered.seq FROM ordered WHERE o.id=ordered.id;
UPDATE public.orders SET number=-number
WHERE deleted_at IS NULL AND superseded_at IS NULL AND status<>'cancelado';
CREATE UNIQUE INDEX orders_active_number_uq ON public.orders(number)
  WHERE deleted_at IS NULL AND superseded_at IS NULL;
INSERT INTO public.document_counters(scope,last_number,updated_at)
VALUES ('orders',(SELECT coalesce(max(number),0) FROM public.orders
  WHERE deleted_at IS NULL AND superseded_at IS NULL AND status<>'cancelado'),now())
ON CONFLICT (scope) DO UPDATE SET last_number=excluded.last_number,updated_at=now();

-- A rotina interna usada ao editar também aceita pedido sem cliente. A versão
-- pública continua preservando o número original e incrementando a revisão.
CREATE OR REPLACE FUNCTION public.sales_replace_order_version_internal(
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
REVOKE ALL ON FUNCTION public.sales_replace_order_version_internal(uuid,uuid,uuid,public.currency_code,numeric,numeric,numeric,text,text,jsonb,uuid,text,text,text,date,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_replace_order_version_internal(uuid,uuid,uuid,public.currency_code,numeric,numeric,numeric,text,text,jsonb,uuid,text,text,text,date,text,text,text) TO authenticated;

-- O entregador recebe o número da revisão e o número separado do endereço,
-- mantendo a visualização operacional sem dados financeiros.
DROP FUNCTION IF EXISTS public.my_deliveries();
CREATE FUNCTION public.my_deliveries()
RETURNS TABLE(
  order_id uuid, number integer, revision_no integer, status text, tracking_status text,
  workflow_stage text, fulfillment_status text, tracking_enabled boolean,
  delivery_token uuid, recipient text, recipient_document text, address text,
  address_number text, cep text, city text, state text, phone text, deadline date,
  delivered_at date, instructions text, warehouse_name text, warehouse_address text,
  warehouse_city text, warehouse_state text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT o.id,o.number,o.revision_no,o.status,o.tracking_status,o.workflow_stage,o.fulfillment_status,
    o.tracking_enabled,o.delivery_token,
    coalesce(nullif(btrim(o.delivery_recipient_name),''),o.delivery->>'name','Não informado'),
    o.delivery_recipient_document,coalesce(o.shipping_address,o.delivery->>'address'),
    o.shipping_address_number,o.shipping_cep,o.shipping_city,o.shipping_state,
    coalesce(o.whatsapp,o.delivery->>'phone'),o.delivery_deadline,o.delivered_at,
    coalesce(nullif(btrim(o.notes),''),o.delivery->>'notes'),w.name,w.address,w.city,w.state
  FROM public.orders o
  JOIN public.delivery_assignments d ON d.order_id=o.id AND d.driver_id=auth.uid()
  LEFT JOIN public.warehouses w ON w.id=o.warehouse_id
  WHERE auth.uid() IS NOT NULL AND o.deleted_at IS NULL AND o.superseded_at IS NULL
  ORDER BY o.number,o.revision_no
  LIMIT 300
$$;
REVOKE EXECUTE ON FUNCTION public.my_deliveries() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.my_deliveries() TO authenticated;
