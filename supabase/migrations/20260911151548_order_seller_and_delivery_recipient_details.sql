-- Completa a identificação operacional da entrega e centraliza no banco a
-- regra de quais vendedores podem ser escolhidos ao criar um pedido.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_recipient_document text,
  ADD COLUMN IF NOT EXISTS shipping_cep text;

COMMENT ON COLUMN public.orders.delivery_recipient_document IS
  'CPF ou documento da pessoa que receberá a entrega.';
COMMENT ON COLUMN public.orders.shipping_cep IS
  'CEP do endereço de entrega, armazenado somente com dígitos.';

UPDATE public.orders o
SET delivery_recipient_document = c.document
FROM public.customers c
WHERE o.customer_id = c.id
  AND nullif(btrim(o.delivery_recipient_document), '') IS NULL
  AND coalesce(nullif(btrim(o.delivery_recipient_name), ''), c.name) = c.name;

CREATE OR REPLACE FUNCTION public.sales_order_snapshot(p_order_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object(
    'id',o.id,'number',o.number,'revision_no',o.revision_no,'customer_id',o.customer_id,'customer_name',c.name,
    'seller_id',o.seller_id,'seller_name',seller.full_name,'currency',o.currency,'discount',o.discount,
    'shipping_cost',o.shipping_cost,'shipping_percentage',o.shipping_percentage,'total',o.total,'status',o.status,
    'workflow_stage',o.workflow_stage,'notes',o.notes,'whatsapp',o.whatsapp,'warehouse_id',o.warehouse_id,
    'delivery_recipient_name',o.delivery_recipient_name,'delivery_recipient_document',o.delivery_recipient_document,
    'shipping_address',o.shipping_address,'shipping_cep',o.shipping_cep,'shipping_city',o.shipping_city,
    'shipping_state',o.shipping_state,'delivery_deadline',o.delivery_deadline,'carrier',o.carrier,
    'tracking_code',o.tracking_code,
    'items',coalesce((SELECT jsonb_agg(jsonb_build_object('item_id',i.item_id,'description',i.description,'sku',i.sku,
      'quantity',i.quantity,'unit_price',i.unit_price,'discount',i.discount,'total',i.total) ORDER BY i.created_at)
      FROM public.order_items i WHERE i.order_id=o.id),'[]'::jsonb)
  )
  FROM public.orders o
  LEFT JOIN public.customers c ON c.id=o.customer_id
  LEFT JOIN public.profiles seller ON seller.id=o.seller_id
  WHERE o.id=p_order_id
$$;
REVOKE ALL ON FUNCTION public.sales_order_snapshot(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.sales_can_assign_seller(_user_id uuid, _seller_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT _user_id IS NOT NULL
    AND _user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'vendedor'
      WHERE p.id = _seller_id
        AND p.is_active
        AND (
          public.is_admin(_user_id)
          OR _seller_id = _user_id
          OR EXISTS (
            SELECT 1
            FROM public.team_members mine
            JOIN public.team_members colleague ON colleague.team_id = mine.team_id
            WHERE mine.user_id = _user_id
              AND colleague.user_id = _seller_id
          )
        )
    )
$$;
REVOKE ALL ON FUNCTION public.sales_can_assign_seller(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_can_assign_seller(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.sales_seller_options()
RETURNS TABLE(id uuid, full_name text, teams text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.id,
         coalesce(nullif(btrim(p.full_name), ''), p.email, 'Vendedor') AS full_name,
         coalesce(string_agg(DISTINCT t.name, ', ' ORDER BY t.name), 'Sem equipe') AS teams
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'vendedor'
  LEFT JOIN public.team_members tm ON tm.user_id = p.id
  LEFT JOIN public.teams t ON t.id = tm.team_id
  WHERE p.is_active
    AND public.sales_can_assign_seller((SELECT auth.uid()), p.id)
  GROUP BY p.id, p.full_name, p.email
  ORDER BY coalesce(nullif(btrim(p.full_name), ''), p.email, 'Vendedor')
$$;
REVOKE ALL ON FUNCTION public.sales_seller_options() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_seller_options() TO authenticated;

CREATE OR REPLACE FUNCTION public.sales_assign_order_seller(p_order_id uuid, p_seller_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid uuid := auth.uid();
  current_order public.orders%ROWTYPE;
  before_snapshot jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  SELECT * INTO current_order
  FROM public.orders
  WHERE id = p_order_id AND deleted_at IS NULL AND superseded_at IS NULL
  FOR UPDATE;
  IF current_order.id IS NULL OR NOT public.sales_can_manage(uid, current_order.seller_id) THEN
    RAISE EXCEPTION 'Pedido não encontrado ou sem permissão para atribuir vendedor.';
  END IF;
  IF NOT public.sales_can_assign_seller(uid, p_seller_id) THEN
    RAISE EXCEPTION 'Escolha um vendedor da sua equipe.';
  END IF;
  IF current_order.seller_id = p_seller_id THEN RETURN; END IF;

  before_snapshot := public.sales_order_snapshot(current_order.id);
  UPDATE public.orders SET seller_id = p_seller_id, updated_at = now() WHERE id = current_order.id;
  INSERT INTO public.order_audit_log(
    order_id,root_order_id,revision_no,action,changed_by,note,previous_snapshot,new_snapshot
  ) VALUES (
    current_order.id,coalesce(current_order.root_order_id,current_order.id),current_order.revision_no,
    'vendedor_atribuido',uid,'Vendedor responsável alterado.',before_snapshot,
    public.sales_order_snapshot(current_order.id)
  );
END $$;
REVOKE ALL ON FUNCTION public.sales_assign_order_seller(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_assign_order_seller(uuid,uuid) TO authenticated;

ALTER TABLE public.order_audit_log DROP CONSTRAINT IF EXISTS order_audit_log_action_check;
ALTER TABLE public.order_audit_log
  ADD CONSTRAINT order_audit_log_action_check CHECK (
    action IN (
      'versao_criada','status_alterado','comprovante_adicionado','excluido',
      'pagamento_registrado','pagamento_editado','pagamento_cancelado','entrega_confirmada',
      'vendedor_atribuido'
    )
  );

DROP FUNCTION IF EXISTS public.my_deliveries();
CREATE FUNCTION public.my_deliveries()
RETURNS TABLE(
  order_id uuid, number integer, status text, tracking_status text,
  workflow_stage text, fulfillment_status text, tracking_enabled boolean,
  delivery_token uuid, recipient text, recipient_document text, address text,
  cep text, city text, state text, phone text, deadline date, delivered_at date,
  instructions text, warehouse_name text, warehouse_address text,
  warehouse_city text, warehouse_state text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT o.id,o.number,o.status,o.tracking_status,o.workflow_stage,o.fulfillment_status,
    o.tracking_enabled,o.delivery_token,
    coalesce(nullif(btrim(o.delivery_recipient_name),''),o.delivery->>'name','Não informado'),
    o.delivery_recipient_document,
    coalesce(o.shipping_address,o.delivery->>'address'),o.shipping_cep,o.shipping_city,o.shipping_state,
    coalesce(o.whatsapp,o.delivery->>'phone'),o.delivery_deadline,o.delivered_at,
    coalesce(nullif(btrim(o.notes),''),o.delivery->>'notes'),w.name,w.address,w.city,w.state
  FROM public.orders o
  JOIN public.delivery_assignments d ON d.order_id=o.id AND d.driver_id=auth.uid()
  LEFT JOIN public.warehouses w ON w.id=o.warehouse_id
  WHERE auth.uid() IS NOT NULL AND o.deleted_at IS NULL AND o.superseded_at IS NULL
  ORDER BY o.delivery_deadline NULLS LAST,o.number DESC
  LIMIT 300
$$;
REVOKE EXECUTE ON FUNCTION public.my_deliveries() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.my_deliveries() TO authenticated;
