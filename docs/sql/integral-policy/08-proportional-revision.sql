-- Reconcile only an administrator-approved revision. Existing fractional lot traces
-- are restored before revision and recreated for the paid fraction of the new order.
CREATE OR REPLACE FUNCTION private.integral_apply_approved_order_change(p_request public.order_change_requests) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE actor uuid:=auth.uid(); old_order public.orders%ROWTYPE; new_order public.orders%ROWTYPE;
 ratio numeric; next_ratio numeric; line record; consumed numeric; reserved_part numeric; result jsonb;
BEGIN
 IF actor IS NULL OR NOT public.is_admin(actor) OR NOT private.integral_operation_allowed(actor,'orders.approve_change') THEN RAISE EXCEPTION 'Aprovação não autorizada.' USING ERRCODE='42501'; END IF;
 SELECT * INTO old_order FROM public.orders WHERE id=p_request.order_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.payments WHERE order_id=old_order.id AND status='pendente') THEN RAISE EXCEPTION 'Confira os pagamentos pendentes antes de aprovar esta alteração.'; END IF;
 SELECT settled_ratio INTO ratio FROM private.seller_stock_settlements WHERE order_id=old_order.id FOR UPDATE;
 IF ratio>0 AND ratio<1 THEN
  IF old_order.warehouse_id IS NULL OR old_order.stock_state<>'reservado' THEN RAISE EXCEPTION 'Estado proporcional inconsistente; revisão não aplicada.'; END IF;
  FOR line IN SELECT item_id,sum(quantity) quantity FROM public.order_items WHERE order_id=old_order.id AND item_id IS NOT NULL GROUP BY item_id ORDER BY item_id LOOP
   consumed:=round(line.quantity*ratio,3);reserved_part:=line.quantity-consumed;
   PERFORM 1 FROM public.warehouse_inventory WHERE warehouse_id=old_order.warehouse_id AND item_id=line.item_id AND reserved>=reserved_part FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Reserva proporcional inconsistente; revisão não aplicada.'; END IF;
   UPDATE public.warehouse_inventory SET quantity=quantity+consumed,reserved=reserved-reserved_part,updated_at=now() WHERE warehouse_id=old_order.warehouse_id AND item_id=line.item_id;
   IF consumed>0 THEN
    INSERT INTO public.inventory_movements(item_id,user_id,movement_type,quantity,reason,document_type,document_id,document_number,target_warehouse_id)
    VALUES(line.item_id,actor,'entrada',consumed,'Estorno proporcional para revisão aprovada',old_order.kind,old_order.id,old_order.number,old_order.warehouse_id);
   END IF;
   IF reserved_part>0 THEN
    INSERT INTO public.inventory_movements(item_id,user_id,movement_type,quantity,reason,document_type,document_id,document_number,source_warehouse_id)
    VALUES(line.item_id,actor,'liberacao',reserved_part,'Liberação proporcional para revisão aprovada',old_order.kind,old_order.id,old_order.number,old_order.warehouse_id);
   END IF;
  END LOOP;
  DELETE FROM private.seller_stock_settlements WHERE order_id=old_order.id;
  UPDATE public.orders SET stock_state='nenhum' WHERE id=old_order.id;
 END IF;
 result:=private.seller_legacy_sales_save_order_edit(p_request.proposed_args||jsonb_build_object('p_revision_note','Aprovação: '||p_request.reason),p_request.proposed_followup,p_request.proposed_exchange);
 IF ratio>0 AND ratio<1 THEN
  SELECT * INTO new_order FROM public.orders WHERE id=(result->>'id')::uuid FOR UPDATE;
  next_ratio:=CASE WHEN new_order.total>0 THEN least(1,greatest(0,new_order.amount_paid/new_order.total)) ELSE 1 END;
  IF next_ratio<1 THEN
   UPDATE public.orders SET stock_state='reservado' WHERE id=new_order.id;
   INSERT INTO private.seller_stock_settlements(order_id,settled_ratio) VALUES(new_order.id,next_ratio);
   FOR line IN SELECT item_id,sum(quantity) quantity FROM public.order_items WHERE order_id=new_order.id AND item_id IS NOT NULL GROUP BY item_id ORDER BY item_id LOOP
    reserved_part:=line.quantity-round(line.quantity*next_ratio,3);
    PERFORM 1 FROM public.warehouse_inventory WHERE warehouse_id=new_order.warehouse_id AND item_id=line.item_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Saldo da nova revisão não encontrado.'; END IF;
    UPDATE public.warehouse_inventory SET quantity=quantity+reserved_part,reserved=reserved+reserved_part,updated_at=now() WHERE warehouse_id=new_order.warehouse_id AND item_id=line.item_id;
    IF reserved_part>0 THEN
     INSERT INTO public.inventory_movements(item_id,user_id,movement_type,quantity,reason,document_type,document_id,document_number,target_warehouse_id)
     VALUES(line.item_id,actor,'entrada',reserved_part,'Estorno da fração ainda não paga da revisão aprovada',new_order.kind,new_order.id,new_order.number,new_order.warehouse_id);
    END IF;
   END LOOP;
  END IF;
  INSERT INTO public.order_audit_log(order_id,root_order_id,revision_no,action,changed_by,note,previous_snapshot,new_snapshot)
  VALUES(new_order.id,coalesce(new_order.root_order_id,new_order.id),new_order.revision_no,'status_alterado',actor,'Estoque proporcional reconciliado: '||ratio||' → '||next_ratio,p_request.previous_snapshot,private.seller_legacy_sales_order_snapshot(new_order.id));
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION private.integral_apply_approved_order_change(public.order_change_requests) FROM PUBLIC,anon,authenticated;
