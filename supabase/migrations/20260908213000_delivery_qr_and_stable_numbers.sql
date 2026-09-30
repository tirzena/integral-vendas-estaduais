-- QR de entrega, baixa manual e numeracao estavel entre revisoes.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_token uuid DEFAULT gen_random_uuid();
UPDATE public.orders SET delivery_token = gen_random_uuid() WHERE delivery_token IS NULL;
ALTER TABLE public.orders ALTER COLUMN delivery_token SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS orders_delivery_token_uq ON public.orders(delivery_token);

ALTER TABLE public.order_audit_log DROP CONSTRAINT IF EXISTS order_audit_log_action_check;
ALTER TABLE public.order_audit_log
  ADD CONSTRAINT order_audit_log_action_check CHECK (
    action IN (
      'versao_criada','status_alterado','comprovante_adicionado','excluido',
      'pagamento_registrado','entrega_confirmada'
    )
  );

CREATE OR REPLACE FUNCTION public.delivery_qr_detail(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE uid uuid := auth.uid(); o public.orders%ROWTYPE; warehouse jsonb; items jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Nao autenticado.'; END IF;
  SELECT * INTO o FROM public.orders
   WHERE delivery_token = p_token AND deleted_at IS NULL AND superseded_at IS NULL
   LIMIT 1;
  IF o.id IS NULL THEN RAISE EXCEPTION 'Ordem de entrega nao encontrada.'; END IF;
  IF NOT (public.app_has_cap(uid,'deliveries_manage') OR public.delivery_is_assigned(uid,o.id)) THEN
    RAISE EXCEPTION 'Sem permissao para esta entrega.';
  END IF;
  SELECT jsonb_build_object('name',w.name,'address',w.address,'city',w.city,'state',w.state)
    INTO warehouse FROM public.warehouses w WHERE w.id=o.warehouse_id;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'description',i.description,'quantity',i.quantity,'unit',i.unit
    ) ORDER BY i.created_at),'[]'::jsonb)
    INTO items FROM public.order_items i WHERE i.order_id=o.id;
  RETURN jsonb_build_object(
    'id',o.id,'number',o.number,'recipient',o.delivery_recipient_name,
    'address',o.shipping_address,'city',o.shipping_city,'state',o.shipping_state,
    'deadline',o.delivery_deadline,'delivered_at',o.delivered_at,
    'fulfillment_status',o.fulfillment_status,'tracking_status',o.tracking_status,
    'warehouse',warehouse,'items',items
  );
END $$;
REVOKE ALL ON FUNCTION public.delivery_qr_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delivery_qr_detail(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.delivery_mark_delivered(p_order_id uuid, p_source text DEFAULT 'manual')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE uid uuid:=auth.uid(); o public.orders%ROWTYPE; root_id uuid; source_label text; before_snapshot jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Nao autenticado.'; END IF;
  SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF o.id IS NULL OR o.deleted_at IS NOT NULL OR o.superseded_at IS NOT NULL THEN
    RAISE EXCEPTION 'Ordem de entrega nao encontrada.';
  END IF;
  IF NOT (public.app_has_cap(uid,'deliveries_manage') OR public.delivery_is_assigned(uid,o.id)) THEN
    RAISE EXCEPTION 'Sem permissao para concluir esta entrega.';
  END IF;
  IF o.status='cancelado' OR o.fulfillment_status='cancelado' THEN
    RAISE EXCEPTION 'Uma entrega cancelada nao pode ser concluida.';
  END IF;
  IF o.delivered_at IS NOT NULL OR o.fulfillment_status='entregue' THEN
    RETURN jsonb_build_object('id',o.id,'already_delivered',true,'delivered_at',o.delivered_at);
  END IF;

  before_snapshot:=public.sales_order_snapshot(o.id);
  source_label:=CASE WHEN lower(coalesce(p_source,''))='qr' THEN 'QR Code' ELSE 'confirmacao manual' END;
  UPDATE public.orders SET
    status='entregue', fulfillment_status='entregue', tracking_status='entregue',
    delivered_at=current_date, updated_at=now()
  WHERE id=o.id;

  INSERT INTO public.delivery_events(order_id,status,location,notes,happened_at,created_by)
  VALUES(o.id,'entregue',coalesce(o.shipping_city,o.shipping_state),
    'Entrega confirmada por '||source_label,now(),uid);

  root_id:=coalesce(o.root_order_id,o.id);
  INSERT INTO public.order_audit_log(
    order_id,root_order_id,revision_no,action,changed_by,note,previous_snapshot,new_snapshot
  ) VALUES(
    o.id,root_id,coalesce(o.revision_no,1),'entrega_confirmada',uid,
    'Entrega confirmada por '||source_label,before_snapshot,public.sales_order_snapshot(o.id)
  );
  RETURN jsonb_build_object('id',o.id,'already_delivered',false,'delivered_at',current_date);
END $$;
REVOKE ALL ON FUNCTION public.delivery_mark_delivered(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delivery_mark_delivered(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.delivery_confirm_by_qr(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE order_id uuid;
BEGIN
  SELECT id INTO order_id FROM public.orders
  WHERE delivery_token=p_token AND deleted_at IS NULL AND superseded_at IS NULL;
  IF order_id IS NULL THEN RAISE EXCEPTION 'QR Code invalido ou expirado.'; END IF;
  RETURN public.delivery_mark_delivered(order_id,'qr');
END $$;
REVOKE ALL ON FUNCTION public.delivery_confirm_by_qr(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delivery_confirm_by_qr(uuid) TO authenticated;

ALTER FUNCTION public.sales_replace_order_version(
  uuid,uuid,uuid,public.currency_code,numeric,numeric,numeric,text,text,jsonb,
  uuid,text,text,text,date,text,text,text
) RENAME TO sales_replace_order_version_internal;

CREATE FUNCTION public.sales_replace_order_version(
  p_previous_order_id uuid,p_customer_id uuid,p_product_id uuid,p_currency public.currency_code,
  p_discount numeric,p_shipping_cost numeric,p_shipping_percentage numeric,p_notes text,p_whatsapp text,
  p_items jsonb,p_warehouse_id uuid,p_shipping_address text,p_shipping_city text,p_shipping_state text,
  p_delivery_deadline date,p_carrier text,p_tracking_code text,p_revision_note text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; old_number integer; temporary_number integer; new_id uuid;
BEGIN
  SELECT number INTO old_number FROM public.orders WHERE id=p_previous_order_id;
  result:=public.sales_replace_order_version_internal(
    p_previous_order_id,p_customer_id,p_product_id,p_currency,p_discount,p_shipping_cost,
    p_shipping_percentage,p_notes,p_whatsapp,p_items,p_warehouse_id,p_shipping_address,
    p_shipping_city,p_shipping_state,p_delivery_deadline,p_carrier,p_tracking_code,p_revision_note
  );
  new_id:=(result->>'id')::uuid;
  temporary_number:=(result->>'number')::integer;
  UPDATE public.orders SET number=old_number WHERE id=new_id;
  UPDATE public.document_counters
    SET last_number=last_number-1,updated_at=now()
    WHERE scope='orders' AND last_number=temporary_number AND temporary_number>old_number;
  UPDATE public.order_audit_log
    SET new_snapshot=public.sales_order_snapshot(new_id)
    WHERE order_id=new_id AND action='versao_criada' AND revision_no=(result->>'revision_no')::integer;
  RETURN result || jsonb_build_object('number',old_number);
END $$;
REVOKE ALL ON FUNCTION public.sales_replace_order_version(uuid,uuid,uuid,public.currency_code,numeric,numeric,numeric,text,text,jsonb,uuid,text,text,text,date,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_replace_order_version(uuid,uuid,uuid,public.currency_code,numeric,numeric,numeric,text,text,jsonb,uuid,text,text,text,date,text,text,text) TO authenticated;

DROP FUNCTION IF EXISTS public.my_deliveries();
CREATE FUNCTION public.my_deliveries()
RETURNS TABLE(
  order_id uuid, number integer, status text, tracking_status text,
  workflow_stage text, fulfillment_status text, tracking_enabled boolean,
  delivery_token uuid, recipient text, address text, city text, state text,
  phone text, deadline date, delivered_at date, instructions text,
  warehouse_name text, warehouse_address text, warehouse_city text, warehouse_state text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT o.id,o.number,o.status,o.tracking_status,o.workflow_stage,o.fulfillment_status,
    o.tracking_enabled,o.delivery_token,
    coalesce(nullif(btrim(o.delivery_recipient_name),''),o.delivery->>'name','Nao informado'),
    coalesce(o.shipping_address,o.delivery->>'address'),o.shipping_city,o.shipping_state,
    coalesce(o.whatsapp,o.delivery->>'phone'),o.delivery_deadline,o.delivered_at,
    o.delivery->>'notes',w.name,w.address,w.city,w.state
  FROM public.orders o
  JOIN public.delivery_assignments d ON d.order_id=o.id AND d.driver_id=auth.uid()
  LEFT JOIN public.warehouses w ON w.id=o.warehouse_id
  WHERE auth.uid() IS NOT NULL AND o.deleted_at IS NULL AND o.superseded_at IS NULL
  ORDER BY o.delivery_deadline NULLS LAST,o.number DESC
  LIMIT 300
$$;
REVOKE EXECUTE ON FUNCTION public.my_deliveries() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.my_deliveries() TO authenticated;

CREATE OR REPLACE FUNCTION public.supplier_set_user(p_supplier_id uuid,p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid();
BEGIN
  IF uid IS NULL OR NOT public.app_has_cap(uid,'manage_suppliers') THEN
    RAISE EXCEPTION 'Sem permissao para vincular o fornecedor.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_user_id AND role='fornecedor') THEN
    RAISE EXCEPTION 'O usuario selecionado precisa ter o perfil Fornecedor.';
  END IF;
  DELETE FROM public.supplier_user_assignments WHERE user_id=p_user_id OR supplier_id=p_supplier_id;
  INSERT INTO public.supplier_user_assignments(supplier_id,user_id,created_by)
  VALUES(p_supplier_id,p_user_id,uid);
END $$;
REVOKE ALL ON FUNCTION public.supplier_set_user(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.supplier_set_user(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.supplier_save_bonus_policy(
  p_supplier_id uuid,p_item_id uuid,p_mode text,p_value numeric
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid(); result uuid;
BEGIN
  IF uid IS NULL OR NOT (
    public.app_has_cap(uid,'manage_suppliers') OR EXISTS(
      SELECT 1 FROM public.supplier_user_assignments
      WHERE supplier_id=p_supplier_id AND user_id=uid
    )
  ) THEN RAISE EXCEPTION 'Sem permissao para editar esta bonificacao.'; END IF;
  IF p_mode NOT IN ('quantidade','percentual','valor') OR coalesce(p_value,-1)<0 THEN
    RAISE EXCEPTION 'Regra de bonificacao invalida.';
  END IF;
  DELETE FROM public.supplier_bonus_policies
  WHERE supplier_id=p_supplier_id
    AND coalesce(item_id,'00000000-0000-0000-0000-000000000000'::uuid)
      =coalesce(p_item_id,'00000000-0000-0000-0000-000000000000'::uuid);
  INSERT INTO public.supplier_bonus_policies(supplier_id,item_id,mode,value,created_by)
  VALUES(p_supplier_id,p_item_id,p_mode,p_value,uid) RETURNING id INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.supplier_save_bonus_policy(uuid,uuid,text,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.supplier_save_bonus_policy(uuid,uuid,text,numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.supplier_portal_data(p_supplier_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid(); supplier_id uuid; result jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Nao autenticado.'; END IF;
  IF public.app_has_cap(uid,'manage_suppliers') AND p_supplier_id IS NOT NULL THEN
    supplier_id:=p_supplier_id;
  ELSE
    SELECT sua.supplier_id INTO supplier_id FROM public.supplier_user_assignments sua
    WHERE sua.user_id=uid LIMIT 1;
  END IF;
  IF supplier_id IS NULL THEN RAISE EXCEPTION 'Login ainda nao vinculado a um fornecedor.'; END IF;

  SELECT jsonb_build_object(
    'supplier',jsonb_build_object('id',s.id,'name',s.name,'status',s.status),
    'items',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',ii.id,'name',ii.name,'sku',ii.sku,'currency',ii.currency
    ) ORDER BY ii.name) FROM public.inventory_items ii WHERE ii.supplier_id=s.id),'[]'::jsonb),
    'purchases',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',im.id,'item_id',im.item_id,'item_name',ii.name,'quantity',im.quantity,
      'bonus_quantity',im.bonus_quantity,'paid_quantity',im.quantity-im.bonus_quantity,
      'unit_cost',im.unit_cost,'freight_cost',im.freight_cost,'variable_cost',im.variable_cost,
      'total_cost',im.total_cost,'currency',im.currency,'created_at',im.created_at,
      'payable_status',ap.status,'payable_id',im.payable_id
    ) ORDER BY im.created_at DESC)
      FROM public.inventory_movements im
      JOIN public.inventory_items ii ON ii.id=im.item_id
      LEFT JOIN public.accounts_payable ap ON ap.id=im.payable_id
      WHERE ii.supplier_id=s.id AND im.movement_type='entrada_compra'),'[]'::jsonb),
    'policies',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',bp.id,'item_id',bp.item_id,'mode',bp.mode,'value',bp.value,'is_active',bp.is_active
    ) ORDER BY bp.created_at DESC) FROM public.supplier_bonus_policies bp
      WHERE bp.supplier_id=s.id),'[]'::jsonb)
  ) INTO result FROM public.suppliers s WHERE s.id=supplier_id;
  IF result IS NULL THEN RAISE EXCEPTION 'Fornecedor nao encontrado.'; END IF;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.supplier_portal_data(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.supplier_portal_data(uuid) TO authenticated;
