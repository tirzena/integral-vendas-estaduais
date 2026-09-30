-- Loss is a logistics state; paid receipts and supplier obligations remain intact.
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_workflow_stage_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_workflow_stage_check CHECK (workflow_stage IN ('pedido_feito','em_caminho','vendido','pagamento_parcial','esperando_pagamento','cancelado','perdido'));
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_fulfillment_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_fulfillment_status_check CHECK (fulfillment_status IN ('recebido','preparando','a_caminho','entregue','cancelado','perdido'));
ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_status_check CHECK (status IN ('confirmada','cancelada','perdida'));

CREATE OR REPLACE FUNCTION public.sales_mark_order_lost(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid(); o public.orders%ROWTYPE; before_snapshot jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'NÃ£o autenticado.'; END IF;
  SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND OR NOT public.sales_can_manage(uid,o.seller_id) THEN RAISE EXCEPTION 'Sem permissÃ£o para alterar o pedido.'; END IF;
  IF o.deleted_at IS NOT NULL OR o.superseded_at IS NOT NULL OR o.status='cancelado' OR o.kind<>'venda' THEN RAISE EXCEPTION 'Somente vendas atuais podem ser marcadas como perdidas.'; END IF;
  IF o.fulfillment_status='perdido' THEN RETURN jsonb_build_object('id',o.id); END IF;
  before_snapshot:=public.sales_order_snapshot(o.id);
  IF o.stock_state='reservado' THEN PERFORM public.sales_apply_stock(o.id,'baixar_reservado',uid);
  ELSIF o.stock_state<>'baixado' THEN RAISE EXCEPTION 'Este pedido nÃ£o possui saÃ­da de estoque.';
  END IF;
  UPDATE public.orders SET workflow_stage='perdido',fulfillment_status='perdido',tracking_status='Perdido',delivered_at=NULL,stock_state='baixado',updated_at=now() WHERE id=o.id;
  UPDATE public.purchase_orders SET status='perdida',updated_at=now() WHERE source_type='sales_order' AND source_root_order_id=coalesce(o.root_order_id,o.id) AND status<>'cancelada';
  INSERT INTO public.order_audit_log(order_id,root_order_id,revision_no,action,changed_by,note,previous_snapshot,new_snapshot)
  VALUES(o.id,coalesce(o.root_order_id,o.id),o.revision_no,'status_alterado',uid,'Produtos perdidos; pagamentos e obrigaÃ§Ãµes mantidos.',before_snapshot,public.sales_order_snapshot(o.id));
  RETURN jsonb_build_object('id',o.id);
END $$;
REVOKE ALL ON FUNCTION public.sales_mark_order_lost(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_mark_order_lost(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.preserve_order_loss()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF OLD.fulfillment_status='perdido' AND NEW.status<>'cancelado' THEN
    NEW.fulfillment_status:='perdido'; NEW.workflow_stage:='perdido'; NEW.tracking_status:='Perdido'; NEW.delivered_at:=NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER preserve_order_loss BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.preserve_order_loss();

CREATE OR REPLACE FUNCTION public.preserve_purchase_loss()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF NEW.status<>'cancelada' AND NEW.source_type='sales_order' AND EXISTS(SELECT 1 FROM public.orders o WHERE o.id=NEW.source_order_id AND o.fulfillment_status='perdido') THEN NEW.status:='perdida'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER preserve_purchase_loss BEFORE INSERT OR UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.preserve_purchase_loss();
NOTIFY pgrst,'reload schema';

REVOKE ALL ON FUNCTION public.preserve_order_loss(), public.preserve_purchase_loss() FROM PUBLIC,anon,authenticated;
