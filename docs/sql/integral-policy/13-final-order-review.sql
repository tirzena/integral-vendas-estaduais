CREATE OR REPLACE FUNCTION public.integral_review_order_change(p_id uuid,p_approve boolean,p_note text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE actor uuid:=auth.uid(); r public.order_change_requests%ROWTYPE; result jsonb;
BEGIN
 IF actor IS NULL OR NOT public.is_admin(actor) OR NOT private.integral_operation_allowed(actor,'orders.approve_change') THEN RAISE EXCEPTION 'Aprovação não autorizada.' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.order_change_requests WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR r.status<>'pending' OR r.requested_by=actor THEN RAISE EXCEPTION 'Solicitação indisponível ou aprovação própria proibida.'; END IF;
 IF length(btrim(coalesce(p_note,'')))<5 THEN RAISE EXCEPTION 'Informe a justificativa da decisão.'; END IF;
 PERFORM 1 FROM public.orders WHERE id=r.order_id AND superseded_at IS NULL AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pedido substituído ou excluído; solicite nova análise.'; END IF;
 IF p_approve THEN
  IF private.seller_legacy_sales_order_snapshot(r.order_id) IS DISTINCT FROM r.previous_snapshot THEN RAISE EXCEPTION 'Pedido alterado após a solicitação; solicite nova análise.'; END IF;
  result:=private.integral_apply_approved_order_change(r);
 END IF;
 UPDATE public.order_change_requests SET status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,reviewed_by=actor,review_note=p_note,reviewed_at=now(),resulting_order_id=(result->>'id')::uuid WHERE id=r.id;
 INSERT INTO public.audit_logs(user_id,entity,entity_id,action,details) VALUES(actor,'order_change_request',r.id,CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,jsonb_build_object('order_id',r.order_id,'reason',p_note,'result',result));
 RETURN coalesce(result,'{}')||jsonb_build_object('request_id',r.id,'status',CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END);
END $$;
REVOKE ALL ON FUNCTION public.integral_review_order_change(uuid,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.integral_review_order_change(uuid,boolean,text) TO authenticated;
