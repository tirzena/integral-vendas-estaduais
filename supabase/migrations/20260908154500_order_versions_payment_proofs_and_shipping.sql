-- Versões de pedidos, comprovantes obrigatórios e regras editáveis de frete.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS revision_no integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS root_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS previous_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS superseded_by_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz,
  ADD COLUMN IF NOT EXISTS superseded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delete_reason text,
  ADD COLUMN IF NOT EXISTS shipping_cost numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_percentage numeric(7,4),
  ADD COLUMN IF NOT EXISTS exchange_rates_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS exchange_rate_source text,
  ADD COLUMN IF NOT EXISTS exchange_rate_locked_at timestamptz;

CREATE OR REPLACE FUNCTION public.lock_order_exchange_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  lock_at timestamptz:=coalesce(NEW.created_at,now());
  brl_rate numeric; usd_rate numeric; pyg_rate numeric; rate_source text; rate_time timestamptz;
BEGIN
  IF NEW.exchange_rate_locked_at IS NOT NULL THEN RETURN NEW; END IF;
  SELECT r.rate,r.source,r.captured_at INTO brl_rate,rate_source,rate_time
    FROM public.financial_rate_at(NEW.currency,'BRL',lock_at) r LIMIT 1;
  SELECT r.rate INTO usd_rate FROM public.financial_rate_at(NEW.currency,'USD',lock_at) r LIMIT 1;
  SELECT r.rate INTO pyg_rate FROM public.financial_rate_at(NEW.currency,'PYG',lock_at) r LIMIT 1;
  IF brl_rate IS NULL OR usd_rate IS NULL OR pyg_rate IS NULL THEN RETURN NEW; END IF;
  NEW.exchange_rates_snapshot:=jsonb_build_object('base',NEW.currency,'BRL',brl_rate,'USD',usd_rate,'PYG',pyg_rate);
  NEW.exchange_rate_source:=coalesce(rate_source,'Histórico de câmbio');
  NEW.exchange_rate_locked_at:=coalesce(rate_time,lock_at);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS lock_order_exchange_snapshot ON public.orders;
CREATE TRIGGER lock_order_exchange_snapshot BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.lock_order_exchange_snapshot();

-- Recupera a cotação histórica mais próxima para pedidos já existentes.
DO $$
DECLARE rec record; brl_rate numeric; usd_rate numeric; pyg_rate numeric; rate_source text; rate_time timestamptz;
BEGIN
  FOR rec IN SELECT id,currency,created_at FROM public.orders WHERE exchange_rate_locked_at IS NULL LOOP
    SELECT r.rate,r.source,r.captured_at INTO brl_rate,rate_source,rate_time
      FROM public.financial_rate_at(rec.currency,'BRL',rec.created_at) r LIMIT 1;
    SELECT r.rate INTO usd_rate FROM public.financial_rate_at(rec.currency,'USD',rec.created_at) r LIMIT 1;
    SELECT r.rate INTO pyg_rate FROM public.financial_rate_at(rec.currency,'PYG',rec.created_at) r LIMIT 1;
    IF brl_rate IS NOT NULL AND usd_rate IS NOT NULL AND pyg_rate IS NOT NULL THEN
      UPDATE public.orders SET
        exchange_rates_snapshot=jsonb_build_object('base',rec.currency,'BRL',brl_rate,'USD',usd_rate,'PYG',pyg_rate),
        exchange_rate_source=coalesce(rate_source,'Histórico de câmbio'),
        exchange_rate_locked_at=coalesce(rate_time,rec.created_at)
      WHERE id=rec.id;
    END IF;
  END LOOP;

  -- Aciona o mecanismo já existente para recuperar a cotação de pagamentos antigos.
  UPDATE public.payments SET status=status
  WHERE status='pago' AND exchange_rate_locked_at IS NULL;
END $$;

UPDATE public.orders SET root_order_id=id WHERE root_order_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_active_revision ON public.orders(root_order_id,revision_no DESC)
  WHERE deleted_at IS NULL AND superseded_at IS NULL;

CREATE TABLE IF NOT EXISTS public.shipping_rate_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  state_code text,
  percentage numeric(7,4) NOT NULL CHECK (percentage>=0 AND percentage<=100),
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS shipping_rate_state_uq ON public.shipping_rate_rules(upper(state_code)) WHERE state_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS shipping_rate_default_uq ON public.shipping_rate_rules(is_default) WHERE is_default;
INSERT INTO public.shipping_rate_rules(name,state_code,percentage,is_default)
VALUES ('São Paulo','SP',20,false),('Demais regiões',NULL,25,true)
ON CONFLICT DO NOTHING;
ALTER TABLE public.shipping_rate_rules ENABLE ROW LEVEL SECURITY;
GRANT SELECT,UPDATE ON public.shipping_rate_rules TO authenticated;
GRANT ALL ON public.shipping_rate_rules TO service_role;
DROP POLICY IF EXISTS shipping_rate_rules_read ON public.shipping_rate_rules;
CREATE POLICY shipping_rate_rules_read ON public.shipping_rate_rules FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS shipping_rate_rules_update ON public.shipping_rate_rules;
CREATE POLICY shipping_rate_rules_update ON public.shipping_rate_rules FOR UPDATE TO authenticated
USING (public.is_admin((SELECT auth.uid())) OR public.app_has_cap((SELECT auth.uid()),'deliveries_manage'))
WITH CHECK (public.is_admin((SELECT auth.uid())) OR public.app_has_cap((SELECT auth.uid()),'deliveries_manage'));

CREATE TABLE IF NOT EXISTS public.order_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  root_order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  new_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  revision_no integer NOT NULL DEFAULT 1,
  action text NOT NULL CHECK (action IN ('versao_criada','status_alterado','comprovante_adicionado','excluido')),
  changed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  note text,
  previous_snapshot jsonb,
  new_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_audit_root ON public.order_audit_log(root_order_id,created_at DESC);
ALTER TABLE public.order_audit_log ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.order_audit_log TO authenticated;
GRANT ALL ON public.order_audit_log TO service_role;
DROP POLICY IF EXISTS order_audit_log_read ON public.order_audit_log;
CREATE POLICY order_audit_log_read ON public.order_audit_log FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id=order_id AND public.sales_can_manage((SELECT auth.uid()),o.seller_id)));

CREATE TABLE IF NOT EXISTS public.order_payment_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  file_path text,
  external_url text,
  file_name text,
  mime_type text,
  uploaded_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (file_path IS NOT NULL OR external_url IS NOT NULL)
);
ALTER TABLE public.order_payment_proofs ADD COLUMN IF NOT EXISTS payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_order_payment_proofs_order ON public.order_payment_proofs(order_id,created_at DESC);
ALTER TABLE public.order_payment_proofs ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT ON public.order_payment_proofs TO authenticated;
GRANT ALL ON public.order_payment_proofs TO service_role;
DROP POLICY IF EXISTS order_payment_proofs_read ON public.order_payment_proofs;
CREATE POLICY order_payment_proofs_read ON public.order_payment_proofs FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id=order_id AND public.sales_can_manage((SELECT auth.uid()),o.seller_id)));
DROP POLICY IF EXISTS order_payment_proofs_insert ON public.order_payment_proofs;
CREATE POLICY order_payment_proofs_insert ON public.order_payment_proofs FOR INSERT TO authenticated
WITH CHECK (uploaded_by=(SELECT auth.uid()) AND EXISTS (
  SELECT 1 FROM public.orders o WHERE o.id=order_id AND public.sales_can_manage((SELECT auth.uid()),o.seller_id)
));

INSERT INTO storage.buckets(id,name,public) VALUES ('payment-proofs','payment-proofs',false)
ON CONFLICT (id) DO UPDATE SET public=false;
DROP POLICY IF EXISTS payment_proofs_read ON storage.objects;
CREATE POLICY payment_proofs_read ON storage.objects FOR SELECT TO authenticated
USING (bucket_id='payment-proofs' AND EXISTS (
  SELECT 1 FROM public.orders o WHERE o.id=(storage.foldername(name))[1]::uuid
    AND public.sales_can_manage((SELECT auth.uid()),o.seller_id)
));
DROP POLICY IF EXISTS payment_proofs_insert ON storage.objects;
CREATE POLICY payment_proofs_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id='payment-proofs' AND EXISTS (
  SELECT 1 FROM public.orders o WHERE o.id=(storage.foldername(name))[1]::uuid
    AND public.sales_can_manage((SELECT auth.uid()),o.seller_id)
));

CREATE OR REPLACE FUNCTION public.sales_order_snapshot(p_order_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object(
    'id',o.id,'number',o.number,'revision_no',o.revision_no,'customer_id',o.customer_id,'customer_name',c.name,
    'currency',o.currency,'discount',o.discount,'shipping_cost',o.shipping_cost,'shipping_percentage',o.shipping_percentage,
    'total',o.total,'status',o.status,'workflow_stage',o.workflow_stage,'notes',o.notes,'whatsapp',o.whatsapp,
    'warehouse_id',o.warehouse_id,'shipping_address',o.shipping_address,'shipping_city',o.shipping_city,
    'shipping_state',o.shipping_state,'delivery_deadline',o.delivery_deadline,'carrier',o.carrier,'tracking_code',o.tracking_code,
    'items',coalesce((SELECT jsonb_agg(jsonb_build_object('item_id',i.item_id,'description',i.description,'sku',i.sku,
      'quantity',i.quantity,'unit_price',i.unit_price,'discount',i.discount,'total',i.total) ORDER BY i.created_at)
      FROM public.order_items i WHERE i.order_id=o.id),'[]'::jsonb)
  ) FROM public.orders o LEFT JOIN public.customers c ON c.id=o.customer_id WHERE o.id=p_order_id
$$;
REVOKE ALL ON FUNCTION public.sales_order_snapshot(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.sales_calculate_shipping(p_items jsonb,p_state text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid(); li jsonb; item public.inventory_items%ROWTYPE; base_cost numeric:=0; rate numeric:=0;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  FOR li IN SELECT * FROM jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) LOOP
    IF nullif(li->>'item_id','') IS NOT NULL THEN
      SELECT * INTO item FROM public.inventory_items WHERE id=(li->>'item_id')::uuid AND is_active;
      IF item.id IS NULL OR (item.product_id IS NOT NULL AND NOT public.has_product_access(uid,item.product_id)) THEN
        RAISE EXCEPTION 'Item inválido ou sem permissão.';
      END IF;
      base_cost:=base_cost+(coalesce(item.cost,0)*greatest(coalesce((li->>'quantity')::numeric,0),0));
    END IF;
  END LOOP;
  SELECT percentage INTO rate FROM public.shipping_rate_rules
    WHERE is_active AND (upper(state_code)=upper(btrim(p_state)) OR (state_code IS NULL AND is_default))
    ORDER BY (state_code IS NOT NULL) DESC LIMIT 1;
  rate:=coalesce(rate,0);
  RETURN jsonb_build_object('percentage',rate,'shipping_cost',round(base_cost*rate/100,2));
END $$;
REVOKE ALL ON FUNCTION public.sales_calculate_shipping(jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_calculate_shipping(jsonb,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.sales_create_document_v2(p_kind text,p_customer_id uuid,p_product_id uuid,
  p_currency public.currency_code,p_discount numeric,p_shipping_cost numeric,p_shipping_percentage numeric,p_notes text,
  p_payment_method text,p_payment_installments text,p_valid_until date,p_whatsapp text,p_origin text,p_items jsonb,p_payments jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid(); gross numeric:=0; total numeric:=0; paid numeric:=0; n integer; new_id uuid; li jsonb; pay jsonb; amount numeric;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF p_kind NOT IN ('venda','pre_pedido') THEN RAISE EXCEPTION 'Tipo de pedido inválido.'; END IF;
  IF p_customer_id IS NULL AND p_kind<>'venda' THEN RAISE EXCEPTION 'Cliente é obrigatório.'; END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items)=0 THEN RAISE EXCEPTION 'Inclua pelo menos um item.'; END IF;
  IF coalesce(p_discount,0)<0 OR coalesce(p_shipping_cost,0)<0 THEN RAISE EXCEPTION 'Desconto ou frete inválido.'; END IF;
  PERFORM public.sales_validate_items(uid,p_product_id,p_items);
  FOR li IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    gross:=gross+greatest(0,round((li->>'quantity')::numeric*coalesce((li->>'unit_price')::numeric,0)-coalesce((li->>'discount')::numeric,0),2));
  END LOOP;
  IF coalesce(p_discount,0)>gross THEN RAISE EXCEPTION 'Desconto maior que o total.'; END IF;
  total:=greatest(0,round(gross-coalesce(p_discount,0)+coalesce(p_shipping_cost,0),2));
  n:=public.sales_next_number('orders');
  INSERT INTO public.orders(number,customer_id,product_id,seller_id,currency,discount,shipping_cost,shipping_percentage,total,
    status,kind,stock_state,notes,payment_method,payment_installments,whatsapp,origin,order_date)
  VALUES(n,p_customer_id,p_product_id,uid,p_currency,coalesce(p_discount,0),coalesce(p_shipping_cost,0),p_shipping_percentage,total,
    CASE WHEN p_kind='venda' THEN 'faturado' ELSE 'pre_pedido' END,p_kind,
    CASE WHEN p_kind='venda' THEN 'baixado' ELSE 'reservado' END,p_notes,p_payment_method,p_payment_installments,p_whatsapp,coalesce(p_origin,'pdv'),current_date)
  RETURNING id INTO new_id;
  UPDATE public.orders SET root_order_id=new_id WHERE id=new_id;
  INSERT INTO public.order_items(order_id,item_id,description,sku,barcode,unit,quantity,unit_price,discount,total)
  SELECT new_id,nullif(e.value->>'item_id','')::uuid,e.value->>'description',e.value->>'sku',e.value->>'barcode',e.value->>'unit',
    (e.value->>'quantity')::numeric,coalesce((e.value->>'unit_price')::numeric,0),coalesce((e.value->>'discount')::numeric,0),
    greatest(0,round((e.value->>'quantity')::numeric*coalesce((e.value->>'unit_price')::numeric,0)-coalesce((e.value->>'discount')::numeric,0),2))
  FROM jsonb_array_elements(p_items) e(value);
  IF p_kind='venda' THEN
    PERFORM public.sales_apply_stock(new_id,'baixar',uid);
    IF p_payments IS NULL OR jsonb_array_length(p_payments)=0 THEN RAISE EXCEPTION 'Informe os pagamentos da venda.'; END IF;
    FOR pay IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
      amount:=coalesce((pay->>'amount')::numeric,0); IF amount<=0 THEN RAISE EXCEPTION 'Pagamento inválido.'; END IF; paid:=paid+round(amount,2);
    END LOOP;
    IF round(paid,2)<>total THEN RAISE EXCEPTION 'A soma dos pagamentos precisa ser igual ao total com frete.'; END IF;
    FOR pay IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
      INSERT INTO public.payments(order_id,amount,currency,method,paid_at,installment,status)
      VALUES(new_id,round((pay->>'amount')::numeric,2),p_currency,pay->>'method',current_date,nullif(pay->>'installment','')::integer,'pago');
    END LOOP;
  ELSE PERFORM public.sales_apply_stock(new_id,'reservar',uid); END IF;
  RETURN jsonb_build_object('id',new_id,'number',n,'kind',p_kind,'total',total);
END $$;
REVOKE ALL ON FUNCTION public.sales_create_document_v2(text,uuid,uuid,public.currency_code,numeric,numeric,numeric,text,text,text,date,text,text,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_create_document_v2(text,uuid,uuid,public.currency_code,numeric,numeric,numeric,text,text,text,date,text,text,jsonb,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.sales_register_revision(p_previous_order_id uuid,p_new_order_id uuid,p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid(); old_o public.orders%ROWTYPE; new_o public.orders%ROWTYPE; root_id uuid; next_revision integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  SELECT * INTO old_o FROM public.orders WHERE id=p_previous_order_id FOR UPDATE;
  SELECT * INTO new_o FROM public.orders WHERE id=p_new_order_id FOR UPDATE;
  IF old_o.id IS NULL OR new_o.id IS NULL OR NOT public.sales_can_manage(uid,old_o.seller_id) OR new_o.seller_id<>uid THEN RAISE EXCEPTION 'Sem permissão para versionar.'; END IF;
  IF old_o.superseded_at IS NOT NULL THEN RAISE EXCEPTION 'Este pedido já possui versão mais recente.'; END IF;
  root_id:=coalesce(old_o.root_order_id,old_o.id); next_revision:=coalesce(old_o.revision_no,1)+1;
  UPDATE public.orders SET root_order_id=root_id,previous_order_id=old_o.id,revision_no=next_revision WHERE id=new_o.id;
  UPDATE public.orders SET superseded_by_order_id=new_o.id,superseded_at=now() WHERE id=old_o.id;
  INSERT INTO public.order_audit_log(order_id,root_order_id,new_order_id,revision_no,action,changed_by,note,previous_snapshot,new_snapshot)
  VALUES(old_o.id,root_id,new_o.id,next_revision,'versao_criada',uid,nullif(btrim(p_note),''),public.sales_order_snapshot(old_o.id),public.sales_order_snapshot(new_o.id));
  RETURN jsonb_build_object('id',new_o.id,'revision_no',next_revision);
END $$;
REVOKE ALL ON FUNCTION public.sales_register_revision(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_register_revision(uuid,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.sales_order_history(p_order_id uuid)
RETURNS TABLE(id uuid,action text,revision_no integer,note text,created_at timestamptz,changed_by uuid,changed_by_name text,
  order_id uuid,new_order_id uuid,previous_snapshot jsonb,new_snapshot jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  WITH target AS (SELECT coalesce(root_order_id,id) root_id,seller_id FROM public.orders WHERE id=p_order_id)
  SELECT h.id,h.action,h.revision_no,h.note,h.created_at,h.changed_by,p.full_name,h.order_id,h.new_order_id,h.previous_snapshot,h.new_snapshot
  FROM public.order_audit_log h JOIN target t ON t.root_id=h.root_order_id LEFT JOIN public.profiles p ON p.id=h.changed_by
  WHERE public.sales_can_manage((SELECT auth.uid()),t.seller_id) ORDER BY h.created_at DESC
$$;
REVOKE ALL ON FUNCTION public.sales_order_history(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_order_history(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.order_payment_proof_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE root_id uuid; rev integer;
BEGIN
  SELECT coalesce(root_order_id,id),revision_no INTO root_id,rev FROM public.orders WHERE id=NEW.order_id;
  INSERT INTO public.order_audit_log(order_id,root_order_id,revision_no,action,changed_by,note,new_snapshot)
  VALUES(NEW.order_id,root_id,rev,'comprovante_adicionado',NEW.uploaded_by,coalesce(NEW.file_name,NEW.external_url),
    jsonb_build_object('proof_id',NEW.id,'file_name',NEW.file_name,'external_url',NEW.external_url));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_order_payment_proof_audit ON public.order_payment_proofs;
CREATE TRIGGER trg_order_payment_proof_audit AFTER INSERT ON public.order_payment_proofs FOR EACH ROW EXECUTE FUNCTION public.order_payment_proof_audit();

CREATE OR REPLACE FUNCTION public.sales_delete_order(p_order_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid(); o public.orders%ROWTYPE; root_id uuid; snap jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason))<5 THEN RAISE EXCEPTION 'Informe o motivo da exclusão.'; END IF;
  SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF o.id IS NULL OR NOT public.sales_can_manage(uid,o.seller_id) THEN RAISE EXCEPTION 'Sem permissão para excluir.'; END IF;
  IF o.deleted_at IS NOT NULL THEN RETURN jsonb_build_object('id',o.id,'deleted',true); END IF;
  snap:=public.sales_order_snapshot(o.id); root_id:=coalesce(o.root_order_id,o.id);
  IF o.stock_state='reservado' THEN PERFORM public.sales_apply_stock(o.id,'liberar',uid);
  ELSIF o.stock_state='baixado' THEN PERFORM public.sales_apply_stock(o.id,'estornar',uid); END IF;
  UPDATE public.payments SET status='cancelado' WHERE order_id=o.id;
  UPDATE public.accounts_receivable SET status='cancelado' WHERE order_id=o.id;
  UPDATE public.orders SET status='cancelado',workflow_stage='cancelado',payment_status='cancelado',fulfillment_status='cancelado',
    stock_state='nenhum',deleted_at=now(),deleted_by=uid,delete_reason=btrim(p_reason),cancel_reason=coalesce(cancel_reason,btrim(p_reason)),
    cancelled_at=coalesce(cancelled_at,now()),cancelled_by=coalesce(cancelled_by,uid) WHERE id=o.id;
  INSERT INTO public.order_audit_log(order_id,root_order_id,revision_no,action,changed_by,note,previous_snapshot)
  VALUES(o.id,root_id,o.revision_no,'excluido',uid,btrim(p_reason),snap);
  RETURN jsonb_build_object('id',o.id,'deleted',true);
END $$;
REVOKE ALL ON FUNCTION public.sales_delete_order(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_delete_order(uuid,text) TO authenticated;

-- Pago exige comprovante. O registro da troca entra no histórico.
CREATE OR REPLACE FUNCTION public.sales_set_stage(p_order_id uuid,p_stage text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid(); o public.orders%ROWTYPE; paid_total numeric:=0; before_snapshot jsonb; root_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF p_stage NOT IN ('pedido_feito','em_caminho','vendido','esperando_pagamento') THEN RAISE EXCEPTION 'Estágio inválido.'; END IF;
  SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF o.id IS NULL OR NOT public.sales_can_manage(uid,o.seller_id) THEN RAISE EXCEPTION 'Sem permissão para alterar o pedido.'; END IF;
  IF o.status='cancelado' OR o.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Pedido cancelado ou excluído não pode mudar.'; END IF;
  IF p_stage='vendido' AND NOT EXISTS (SELECT 1 FROM public.order_payment_proofs WHERE order_id=o.id) THEN
    RAISE EXCEPTION 'Envie um comprovante antes de marcar o pedido como pago.';
  END IF;
  IF p_stage='vendido' THEN
    SELECT coalesce(sum(amount),0) INTO paid_total FROM public.payments WHERE order_id=o.id AND status='pago';
    IF round(paid_total,2)<>round(o.total,2) THEN
      RAISE EXCEPTION 'O pedido ainda possui saldo. Registre o pagamento recebido antes de marcar como pago.';
    END IF;
  END IF;
  before_snapshot:=public.sales_order_snapshot(o.id); root_id:=coalesce(o.root_order_id,o.id);
  IF p_stage IN ('em_caminho','vendido','esperando_pagamento') AND o.stock_state='reservado' THEN PERFORM public.sales_apply_stock(o.id,'baixar_reservado',uid); END IF;
  IF p_stage='vendido' THEN
    UPDATE public.payments SET status='pago',paid_at=coalesce(paid_at,current_date) WHERE order_id=o.id AND status<>'cancelado';
    UPDATE public.accounts_receivable SET status='pago',paid_at=coalesce(paid_at,current_date),updated_at=now() WHERE order_id=o.id AND status<>'cancelado';
  ELSIF p_stage='esperando_pagamento' THEN
    IF EXISTS(SELECT 1 FROM public.accounts_receivable WHERE order_id=o.id AND status<>'cancelado') THEN
      UPDATE public.accounts_receivable SET amount=greatest(0,o.total-o.amount_paid),currency=o.currency,status='pendente',paid_at=NULL,updated_at=now() WHERE order_id=o.id AND status<>'cancelado';
    ELSE INSERT INTO public.accounts_receivable(description,customer_id,product_id,order_id,amount,currency,due_date,status)
      VALUES('Pedido '||coalesce(o.number::text,o.id::text),o.customer_id,o.product_id,o.id,o.total,o.currency,current_date,'pendente'); END IF;
  END IF;
  UPDATE public.orders SET workflow_stage=p_stage,kind=CASE WHEN p_stage IN ('em_caminho','vendido','esperando_pagamento') THEN 'venda' ELSE kind END,
    stock_state=CASE WHEN p_stage IN ('em_caminho','vendido','esperando_pagamento') THEN 'baixado' ELSE stock_state END,
    payment_status=CASE WHEN p_stage='vendido' THEN 'pago' WHEN p_stage='esperando_pagamento' THEN 'a_pagar' ELSE payment_status END,
    amount_paid=CASE WHEN p_stage='vendido' THEN total WHEN p_stage='esperando_pagamento' THEN 0 ELSE amount_paid END,
    amount_receivable=CASE WHEN p_stage='vendido' THEN 0 WHEN p_stage='esperando_pagamento' THEN total ELSE amount_receivable END,
    fulfillment_status=CASE WHEN p_stage='em_caminho' THEN 'a_caminho' WHEN p_stage='vendido' THEN 'entregue' ELSE fulfillment_status END,
    status=CASE WHEN p_stage='vendido' THEN 'entregue' ELSE status END,
    delivered_at=CASE WHEN p_stage='vendido' THEN coalesce(delivered_at,current_date) ELSE delivered_at END,
    tracking_status=CASE WHEN p_stage='em_caminho' THEN 'Em caminho' WHEN p_stage='vendido' THEN 'Entregue' ELSE tracking_status END WHERE id=o.id;
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
  paid_total numeric:=0; remaining numeric:=0; new_payment_id uuid; root_id uuid; before_snapshot jsonb;
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
  UPDATE public.orders SET kind='venda',stock_state='baixado',amount_paid=paid_total,amount_receivable=remaining,
    payment_status=CASE WHEN remaining=0 THEN 'pago' ELSE 'a_pagar' END,
    workflow_stage=CASE WHEN remaining=0 THEN 'vendido' ELSE 'esperando_pagamento' END,
    status=CASE WHEN remaining=0 THEN 'entregue' ELSE 'faturado' END,
    delivered_at=CASE WHEN remaining=0 THEN coalesce(delivered_at,current_date) ELSE delivered_at END WHERE id=o.id;
  IF EXISTS(SELECT 1 FROM public.accounts_receivable WHERE order_id=o.id AND status<>'cancelado') THEN
    UPDATE public.accounts_receivable SET amount=remaining,status=CASE WHEN remaining=0 THEN 'pago' ELSE 'pendente' END,
      paid_at=CASE WHEN remaining=0 THEN current_date ELSE NULL END,updated_at=now() WHERE order_id=o.id AND status<>'cancelado';
  ELSIF remaining>0 THEN
    INSERT INTO public.accounts_receivable(description,customer_id,product_id,order_id,amount,currency,due_date,status)
      VALUES('Saldo do pedido '||coalesce(o.number::text,o.id::text),o.customer_id,o.product_id,o.id,remaining,o.currency,current_date,'pendente');
  END IF;
  INSERT INTO public.order_audit_log(order_id,root_order_id,revision_no,action,changed_by,note,previous_snapshot,new_snapshot)
    VALUES(o.id,root_id,o.revision_no,'status_alterado',uid,
      'Pagamento registrado: '||p_amount||' '||o.currency||'. Saldo: '||remaining||' '||o.currency,
      before_snapshot,public.sales_order_snapshot(o.id));
  RETURN jsonb_build_object('id',o.id,'payment_id',new_payment_id,'paid',paid_total,'remaining',remaining,
    'stage',CASE WHEN remaining=0 THEN 'vendido' ELSE 'esperando_pagamento' END);
END $$;
REVOKE ALL ON FUNCTION public.sales_register_payment(uuid,numeric,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_register_payment(uuid,numeric,text,uuid) TO authenticated;

-- Substitui um pedido em uma única transação. O documento anterior vira uma
-- versão histórica e todos os reflexos de estoque/financeiro são recalculados.
CREATE OR REPLACE FUNCTION public.sales_replace_order_version(
  p_previous_order_id uuid,p_customer_id uuid,p_product_id uuid,p_currency public.currency_code,
  p_discount numeric,p_shipping_cost numeric,p_shipping_percentage numeric,p_notes text,p_whatsapp text,
  p_items jsonb,p_warehouse_id uuid,p_shipping_address text,p_shipping_city text,p_shipping_state text,
  p_delivery_deadline date,p_carrier text,p_tracking_code text,p_revision_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  uid uuid:=auth.uid(); old public.orders%ROWTYPE; created jsonb; new_id uuid; root_id uuid;
  old_snapshot jsonb; new_snapshot jsonb; next_revision integer; old_stage text; old_kind text;
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

  -- O cancelamento e a criação abaixo participam da mesma transação.
  PERFORM public.sales_cancel_order(old.id,'Substituído pela revisão '||next_revision||': '||btrim(p_revision_note));
  created:=public.sales_create_document_v2('pre_pedido',p_customer_id,p_product_id,p_currency,p_discount,
    p_shipping_cost,p_shipping_percentage,p_notes,NULL,NULL,NULL,p_whatsapp,'edicao',p_items,'[]'::jsonb);
  new_id:=(created->>'id')::uuid;

  PERFORM public.sales_update_order_logistics(new_id,p_warehouse_id,p_shipping_address,p_shipping_city,p_shipping_state);
  UPDATE public.orders SET seller_id=old.seller_id,root_order_id=root_id,previous_order_id=old.id,
    revision_no=next_revision,delivery_deadline=p_delivery_deadline,
    carrier=nullif(btrim(p_carrier),''),tracking_code=nullif(btrim(p_tracking_code),'') WHERE id=new_id;

  IF old_stage IN ('esperando_pagamento','em_caminho','vendido') THEN
    PERFORM public.sales_apply_stock(new_id,'baixar_reservado',uid);
    UPDATE public.orders SET kind='venda',stock_state='baixado',workflow_stage=old_stage,
      status=CASE WHEN old_stage='vendido' THEN 'entregue' ELSE 'faturado' END,
      payment_status=CASE WHEN old_stage='vendido' THEN 'pago' WHEN old_stage='esperando_pagamento' THEN 'a_pagar' ELSE old.payment_status END,
      amount_paid=CASE WHEN old_stage='vendido' THEN total WHEN old_stage='esperando_pagamento' THEN 0 ELSE old.amount_paid END,
      amount_receivable=CASE WHEN old_stage='vendido' THEN 0 WHEN old_stage='esperando_pagamento' THEN total ELSE old.amount_receivable END,
      fulfillment_status=CASE WHEN old_stage='em_caminho' THEN 'a_caminho' WHEN old_stage='vendido' THEN 'entregue' ELSE old.fulfillment_status END,
      delivered_at=CASE WHEN old_stage='vendido' THEN coalesce(old.delivered_at,current_date) ELSE old.delivered_at END,
      tracking_status=CASE WHEN old_stage='em_caminho' THEN 'Em caminho' WHEN old_stage='vendido' THEN 'Entregue' ELSE old.tracking_status END
      WHERE id=new_id;
  ELSE
    UPDATE public.orders SET kind=old_kind,workflow_stage='pedido_feito' WHERE id=new_id;
  END IF;

  IF old_stage='vendido' THEN
    INSERT INTO public.order_payment_proofs(order_id,proof_type,file_path,external_url,file_name,mime_type,uploaded_by)
      SELECT new_id,proof_type,file_path,external_url,file_name,mime_type,uploaded_by
      FROM public.order_payment_proofs WHERE order_id=old.id;
    INSERT INTO public.payments(order_id,amount,currency,method,paid_at,installment,status)
      SELECT new_id,(SELECT total FROM public.orders WHERE id=new_id),p_currency,'Baixa preservada da versão anterior',current_date,1,'pago';
  ELSIF old_stage='esperando_pagamento' THEN
    INSERT INTO public.accounts_receivable(description,customer_id,product_id,order_id,amount,currency,due_date,status)
      SELECT 'Pedido '||number,customer_id,product_id,id,total,currency,current_date,'pendente' FROM public.orders WHERE id=new_id;
  END IF;

  UPDATE public.orders SET superseded_at=now(),superseded_by=uid,superseded_by_order_id=new_id WHERE id=old.id;
  new_snapshot:=public.sales_order_snapshot(new_id);
  INSERT INTO public.order_audit_log(order_id,root_order_id,revision_no,action,changed_by,note,previous_snapshot,new_snapshot)
    VALUES(new_id,root_id,next_revision,'versao_criada',uid,btrim(p_revision_note),old_snapshot,new_snapshot);
  RETURN jsonb_build_object('id',new_id,'number',created->'number','revision_no',next_revision,'root_order_id',root_id);
END $$;
REVOKE ALL ON FUNCTION public.sales_replace_order_version(uuid,uuid,uuid,public.currency_code,numeric,numeric,numeric,text,text,jsonb,uuid,text,text,text,date,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_replace_order_version(uuid,uuid,uuid,public.currency_code,numeric,numeric,numeric,text,text,jsonb,uuid,text,text,text,date,text,text,text) TO authenticated;
