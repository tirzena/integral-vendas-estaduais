-- Stock deductions must also update the selected warehouse when a payment arrives
-- before final confirmation. Cancellation/restoration keeps its existing trigger.
DO $$ DECLARE definition text; anchor text:='FOR r IN SELECT item_id, quantity FROM public.order_items'; replacement text; BEGIN
 definition:=pg_get_functiondef('public.sales_apply_stock(uuid,text,uuid)'::regprocedure);
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'Unexpected stock routine; review before applying'; END IF;
 replacement:=$patch$
 IF p_action IN ('baixar','baixar_reservado') AND ord.warehouse_id IS NOT NULL THEN
  FOR r IN SELECT item_id,sum(quantity) quantity FROM public.order_items WHERE order_id=p_order_id AND item_id IS NOT NULL GROUP BY item_id ORDER BY item_id LOOP
   SELECT w.*,i.name INTO inv FROM public.warehouse_inventory w JOIN public.inventory_items i ON i.id=w.item_id WHERE w.warehouse_id=ord.warehouse_id AND w.item_id=r.item_id FOR UPDATE OF w;
   IF NOT FOUND OR (p_action='baixar' AND inv.quantity-inv.reserved<r.quantity) OR (p_action='baixar_reservado' AND (inv.quantity<r.quantity OR inv.reserved<r.quantity)) THEN RAISE EXCEPTION 'Saldo ou reserva insuficiente no estoque selecionado.'; END IF;
   UPDATE public.warehouse_inventory SET quantity=quantity-r.quantity,reserved=reserved-CASE WHEN p_action='baixar_reservado' THEN r.quantity ELSE 0 END,updated_at=now() WHERE warehouse_id=ord.warehouse_id AND item_id=r.item_id;
   INSERT INTO public.inventory_movements(item_id,user_id,movement_type,quantity,reason,document_type,document_id,document_number,source_warehouse_id) VALUES(r.item_id,p_user_id,'saida',r.quantity,'Saída do pedido confirmado',ord.kind,ord.id,ord.number,ord.warehouse_id);
  END LOOP;
  RETURN;
 END IF;
 FOR r IN SELECT item_id, quantity FROM public.order_items
$patch$;
 EXECUTE replace(definition,anchor,replacement);
END $$;
-- Confirmation withdraws stock once, independently of payment.
CREATE OR REPLACE FUNCTION public.sales_confirm_order(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid(); o public.orders%ROWTYPE; line record; bal public.warehouse_inventory%ROWTYPE; before_snapshot jsonb;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF o.id IS NULL OR NOT public.sales_can_manage(uid,o.seller_id) THEN RAISE EXCEPTION 'Sem permissão para confirmar este pedido.'; END IF;
 IF o.deleted_at IS NOT NULL OR o.superseded_at IS NOT NULL OR o.status='cancelado' THEN RAISE EXCEPTION 'Pedido excluído, cancelado ou substituído.'; END IF;
 IF o.kind NOT IN ('venda','pre_pedido') THEN RAISE EXCEPTION 'Documento inválido.'; END IF;
 before_snapshot:=public.sales_order_snapshot(o.id);
 IF o.stock_state<>'baixado' THEN
  IF o.stock_state NOT IN ('reservado','nenhum') THEN RAISE EXCEPTION 'Situação de estoque inválida.'; END IF;
  IF o.warehouse_id IS NULL THEN RAISE EXCEPTION 'Selecione o estoque de saída.'; END IF;
  FOR line IN SELECT item_id,sum(quantity) quantity FROM public.order_items WHERE order_id=o.id AND item_id IS NOT NULL GROUP BY item_id ORDER BY item_id LOOP
   SELECT * INTO bal FROM public.warehouse_inventory WHERE warehouse_id=o.warehouse_id AND item_id=line.item_id FOR UPDATE;
   IF NOT FOUND OR (o.stock_state='reservado' AND (bal.reserved<line.quantity OR bal.quantity<line.quantity)) OR (o.stock_state='nenhum' AND bal.quantity-bal.reserved<line.quantity) THEN RAISE EXCEPTION 'Saldo ou reserva insuficiente no estoque selecionado.'; END IF;
  END LOOP;
  PERFORM public.sales_apply_stock(o.id,CASE WHEN o.stock_state='reservado' THEN 'baixar_reservado' ELSE 'baixar' END,uid);
END IF;
 UPDATE public.orders SET kind='venda',stock_state='baixado',status=CASE WHEN status='pre_pedido' THEN 'faturado' ELSE status END WHERE id=o.id;
 PERFORM public.purchase_sync_from_sales_order(o.id);
 IF o.stock_state<>'baixado' OR o.kind<>'venda' THEN
  INSERT INTO public.order_audit_log(order_id,root_order_id,revision_no,action,changed_by,note,previous_snapshot,new_snapshot) VALUES(o.id,coalesce(o.root_order_id,o.id),o.revision_no,'status_alterado',uid,'Pedido confirmado: saída do estoque e percurso da compra; pagamentos preservados.',before_snapshot,public.sales_order_snapshot(o.id));
 END IF;
 RETURN jsonb_build_object('id',o.id,'number',o.number,'kind','venda','stock_state','baixado');
END $$;
REVOKE ALL ON FUNCTION public.sales_confirm_order(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sales_confirm_order(uuid) TO authenticated;