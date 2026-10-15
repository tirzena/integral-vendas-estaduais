CREATE OR REPLACE FUNCTION public.integral_order_context(p_order_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE actor uuid:=auth.uid(); o public.orders%ROWTYPE; result jsonb;
BEGIN
 IF actor IS NULL OR (NOT private.integral_operation_allowed(actor,'orders.view') AND NOT (NOT private.seller_is_restricted(actor) AND private.seller_legacy_sales_sees_all(actor))) THEN RAISE EXCEPTION 'Sem permissão para consultar pedidos.' USING ERRCODE='42501'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=p_order_id AND deleted_at IS NULL AND superseded_at IS NULL;
 IF NOT FOUND OR NOT(o.seller_id=actor OR (NOT private.seller_is_restricted(actor) AND private.seller_legacy_sales_sees_all(actor))) THEN RAISE EXCEPTION 'Pedido vigente não autorizado.' USING ERRCODE='42501'; END IF;
 result:=private.seller_legacy_sales_order_detail(o.id);
 RETURN result||jsonb_build_object('order',CASE WHEN public.is_admin(actor) THEN to_jsonb(o) ELSE to_jsonb(o)-ARRAY['total_cost_usd','total_cost_brl','gross_margin','source_payload','merchandise_cost','variable_cost'] END,
 'items',coalesce((SELECT jsonb_agg(to_jsonb(l)) FROM public.order_items l WHERE l.order_id=o.id),'[]'::jsonb),
 'history',coalesce((SELECT jsonb_agg(jsonb_build_object('id',l.id,'action',l.action,'note',l.note,'created_at',l.created_at,'changed_by',l.changed_by) ORDER BY l.created_at DESC) FROM public.order_audit_log l WHERE l.root_order_id=coalesce(o.root_order_id,o.id) OR l.order_id=o.id),'[]'::jsonb),
 'registeredPayments',coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM public.payments p WHERE p.order_id=o.id),'[]'::jsonb),
 'proofs',coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM public.order_payment_proofs p WHERE p.order_id=o.id),'[]'::jsonb),
 'exchange_rates_snapshot',o.exchange_rates_snapshot,'exchange_rate_source',o.exchange_rate_source,'exchange_rate_locked_at',o.exchange_rate_locked_at,
 'requires_approval',private.integral_order_locked(o.id),'can_edit',private.integral_operation_allowed(actor,'orders.edit_open'),
 'can_pay',private.integral_operation_allowed(actor,'payments.create'),'can_delete',private.integral_operation_allowed(actor,'orders.delete'));
END $$;
REVOKE ALL ON FUNCTION public.integral_order_context(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.integral_order_context(uuid) TO authenticated;

