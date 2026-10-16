ALTER TABLE public.order_audit_log DROP CONSTRAINT order_audit_log_action_check; ALTER TABLE public.order_audit_log ADD CONSTRAINT order_audit_log_action_check CHECK(action IN ('versao_criada','status_alterado','comprovante_adicionado','excluido','pagamento_registrado','pagamento_editado','pagamento_cancelado','entrega_confirmada','vendedor_atribuido','tracking_updated'));
CREATE OR REPLACE FUNCTION public.integral_order_tracking(p_order_id uuid,p_save boolean DEFAULT false,p_code text DEFAULT null,p_carrier text DEFAULT null)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); o public.orders%ROWTYPE; editable boolean; result jsonb;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND is_active) THEN RAISE EXCEPTION 'Acesso indisponível.' USING ERRCODE='42501'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=p_order_id AND deleted_at IS NULL AND superseded_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pedido indisponível.' USING ERRCODE='42501'; END IF;
 editable:=coalesce(o.seller_id=actor,false) OR public.is_admin(actor) OR public.app_has_cap(actor,'deliveries_manage') OR EXISTS(SELECT 1 FROM public.delivery_assignments WHERE order_id=o.id AND driver_id=actor);
 IF NOT editable AND NOT (NOT private.seller_is_restricted(actor) AND private.seller_legacy_sales_sees_all(actor)) THEN RAISE EXCEPTION 'Pedido não autorizado.' USING ERRCODE='42501'; END IF;
 IF p_save THEN
  IF NOT editable THEN RAISE EXCEPTION 'Sem permissão para vincular rastreio.' USING ERRCODE='42501'; END IF;
  IF coalesce(length(trim(p_code)),0)>150 OR coalesce(length(trim(p_carrier)),0)>150 THEN RAISE EXCEPTION 'Código ou transportadora muito longo.'; END IF;
  INSERT INTO private.seller_creation_context(backend_pid,transaction_id,actor,new_order_id,operation) VALUES(pg_backend_pid(),txid_current(),actor,o.id,'edit_order');
  UPDATE public.orders SET tracking_code=nullif(trim(p_code),''),carrier=nullif(trim(p_carrier),'') WHERE id=o.id;
  INSERT INTO public.order_audit_log(order_id,root_order_id,revision_no,action,changed_by,note,previous_snapshot,new_snapshot)
  VALUES(o.id,coalesce(o.root_order_id,o.id),coalesce(o.revision_no,0),'tracking_updated',actor,'Código de rastreio atualizado',jsonb_build_object('tracking_code',o.tracking_code,'carrier',o.carrier),jsonb_build_object('tracking_code',nullif(trim(p_code),''),'carrier',nullif(trim(p_carrier),'')));
  DELETE FROM private.seller_creation_context ctx WHERE ctx.backend_pid=pg_backend_pid() AND ctx.transaction_id=txid_current() AND ctx.actor=auth.uid();
  SELECT * INTO o FROM public.orders WHERE id=p_order_id;
 END IF;
 RETURN jsonb_build_object('can_edit',editable,'number',o.number,'revision_no',o.revision_no,'tracking_code',o.tracking_code,'carrier',o.carrier,'created_at',o.created_at,'order_date',o.order_date,'delivered_at',o.delivered_at,'workflow_stage',o.workflow_stage,'fulfillment_status',o.fulfillment_status,'approval_status',o.approval_status,
  'events',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'status',e.status,'location',e.location,'notes',e.notes,'happened_at',e.happened_at) ORDER BY e.happened_at) FROM public.delivery_events e WHERE e.order_id=o.id),'[]'::jsonb),
  'history',coalesce((SELECT jsonb_agg(jsonb_build_object('id',l.id,'note',l.note,'created_at',l.created_at,'actor',p.full_name,'tracking_code',l.new_snapshot->>'tracking_code','carrier',l.new_snapshot->>'carrier') ORDER BY l.created_at DESC) FROM public.order_audit_log l LEFT JOIN public.profiles p ON p.id=l.changed_by WHERE l.order_id=o.id AND l.action='tracking_updated'),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.integral_order_tracking(uuid,boolean,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.integral_order_tracking(uuid,boolean,text,text) TO authenticated;