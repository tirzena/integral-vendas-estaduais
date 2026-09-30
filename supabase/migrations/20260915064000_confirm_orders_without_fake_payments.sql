-- Confirma pedido sem simular recebimento nem movimentar reservas existentes.
CREATE OR REPLACE FUNCTION public.sales_confirm_order(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid := auth.uid(); o public.orders%ROWTYPE; before_snapshot jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF o.id IS NULL OR NOT public.sales_can_manage(uid,o.seller_id) THEN
    RAISE EXCEPTION 'Sem permissão para confirmar este pedido.';
  END IF;
  IF o.deleted_at IS NOT NULL OR o.superseded_at IS NOT NULL OR o.status='cancelado' THEN
    RAISE EXCEPTION 'Pedido excluído, cancelado ou substituído não pode ser confirmado.';
  END IF;
  IF o.kind NOT IN ('venda','pre_pedido') THEN RAISE EXCEPTION 'Documento inválido.'; END IF;
  IF o.kind='pre_pedido' THEN
    before_snapshot:=public.sales_order_snapshot(o.id);
    UPDATE public.orders SET kind='venda' WHERE id=o.id;
    INSERT INTO public.order_audit_log(order_id,root_order_id,revision_no,action,changed_by,note,previous_snapshot,new_snapshot)
    VALUES(o.id,coalesce(o.root_order_id,o.id),o.revision_no,'status_alterado',uid,
      'Pedido confirmado sem alterar pagamentos ou reservas.',before_snapshot,public.sales_order_snapshot(o.id));
  END IF;
  PERFORM public.purchase_sync_from_sales_order(o.id);
  RETURN jsonb_build_object('id',o.id,'number',o.number,'kind','venda');
END $$;
REVOKE ALL ON FUNCTION public.sales_confirm_order(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sales_confirm_order(uuid) TO authenticated;
