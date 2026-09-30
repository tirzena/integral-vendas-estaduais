-- Estagios comerciais, varios estoques e seguranca financeira.
CREATE TABLE IF NOT EXISTS public.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  city text NOT NULL,
  state text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT warehouses_name_city_state_uq UNIQUE (name, city, state)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouses TO authenticated;
GRANT ALL ON public.warehouses TO service_role;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS warehouses_read ON public.warehouses;
CREATE POLICY warehouses_read ON public.warehouses FOR SELECT TO authenticated
  USING (public.app_has_cap(auth.uid(), 'inventory_view'));
DROP POLICY IF EXISTS warehouses_manage ON public.warehouses;
CREATE POLICY warehouses_manage ON public.warehouses FOR ALL TO authenticated
  USING (public.app_has_cap(auth.uid(), 'inventory_manage'))
  WITH CHECK (public.app_has_cap(auth.uid(), 'inventory_manage'));

DROP TRIGGER IF EXISTS trg_warehouses_updated ON public.warehouses;
CREATE TRIGGER trg_warehouses_updated BEFORE UPDATE ON public.warehouses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.warehouses(name, city, state)
SELECT 'Estoque principal', 'A definir', 'A definir'
WHERE NOT EXISTS (SELECT 1 FROM public.warehouses);

ALTER TABLE public.inventory_item_locations
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL;
ALTER TABLE public.warehouse_user_assignments
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE CASCADE;

UPDATE public.inventory_item_locations
SET warehouse_id = (SELECT id FROM public.warehouses ORDER BY created_at LIMIT 1)
WHERE warehouse_id IS NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS workflow_stage text NOT NULL DEFAULT 'pedido_feito',
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'a_pagar',
  ADD COLUMN IF NOT EXISTS fulfillment_status text NOT NULL DEFAULT 'recebido',
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shipping_address text,
  ADD COLUMN IF NOT EXISTS shipping_city text,
  ADD COLUMN IF NOT EXISTS shipping_state text;

UPDATE public.orders SET
  workflow_stage = CASE
    WHEN status = 'cancelado' THEN 'cancelado'
    WHEN lower(coalesce(tracking_status,'')) SIMILAR TO '%(caminho|transito|trânsito|enviado)%' THEN 'em_caminho'
    WHEN coalesce(amount_receivable,0) > 0 THEN 'esperando_pagamento'
    WHEN status = 'entregue' OR delivered_at IS NOT NULL THEN 'vendido'
    WHEN kind = 'venda' THEN 'vendido'
    ELSE 'pedido_feito'
  END,
  payment_status = CASE
    WHEN status = 'cancelado' THEN 'cancelado'
    WHEN coalesce(amount_receivable,0) > 0 THEN 'a_pagar'
    WHEN kind = 'venda' THEN 'pago'
    ELSE 'a_pagar'
  END,
  fulfillment_status = CASE
    WHEN status = 'cancelado' THEN 'cancelado'
    WHEN status = 'entregue' OR delivered_at IS NOT NULL THEN 'entregue'
    WHEN lower(coalesce(tracking_status,'')) SIMILAR TO '%(caminho|transito|trânsito|enviado)%' THEN 'a_caminho'
    ELSE 'recebido'
  END;

DO $$ BEGIN
  ALTER TABLE public.orders ADD CONSTRAINT orders_workflow_stage_check
    CHECK (workflow_stage IN ('pedido_feito','em_caminho','vendido','esperando_pagamento','cancelado'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orders ADD CONSTRAINT orders_payment_status_check
    CHECK (payment_status IN ('a_pagar','pago','cancelado'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orders ADD CONSTRAINT orders_fulfillment_status_check
    CHECK (fulfillment_status IN ('recebido','preparando','a_caminho','entregue','cancelado'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_orders_workflow_stage ON public.orders(workflow_stage);
CREATE INDEX IF NOT EXISTS idx_orders_warehouse ON public.orders(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inventory_item_locations_warehouse ON public.inventory_item_locations(warehouse_id);

INSERT INTO public.permission_catalog(key,label,description,group_name,sort_order) VALUES
('manage_discounts','Gerenciar descontos','Definir ou alterar descontos em pedidos e orçamentos.','Vendas',25)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, description=EXCLUDED.description,
  group_name=EXCLUDED.group_name, sort_order=EXCLUDED.sort_order;

INSERT INTO public.job_role_permissions(job_role_id, permission_key, allowed)
SELECT r.id, 'manage_discounts', true
FROM public.job_roles r
WHERE (r.leadership OR r.system_key IN ('fundador','diretor_geral','diretor_executivo','gestor_executivo','gerente'))
  AND NOT EXISTS (SELECT 1 FROM public.job_role_permissions x WHERE x.job_role_id=r.id AND x.job_level_id IS NULL AND x.permission_key='manage_discounts');
UPDATE public.job_role_permissions x SET allowed=true
FROM public.job_roles r
WHERE x.job_role_id=r.id AND x.job_level_id IS NULL AND x.permission_key='manage_discounts'
  AND (r.leadership OR r.system_key IN ('fundador','diretor_geral','diretor_executivo','gestor_executivo','gerente'));

CREATE OR REPLACE FUNCTION public.sales_discount_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v numeric;
BEGIN
  v := coalesce(NEW.discount, 0);
  IF v > 0 AND auth.uid() IS NOT NULL AND NOT (public.app_has_cap(auth.uid(),'manage_discounts') OR public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'gestor')) THEN
    RAISE EXCEPTION 'Somente cargos de liderança podem definir ou alterar descontos.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_orders_discount_guard ON public.orders;
CREATE TRIGGER trg_orders_discount_guard BEFORE INSERT OR UPDATE OF discount ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.sales_discount_guard();
DROP TRIGGER IF EXISTS trg_quotes_discount_guard ON public.quotes;
CREATE TRIGGER trg_quotes_discount_guard BEFORE INSERT OR UPDATE OF discount ON public.quotes
FOR EACH ROW EXECUTE FUNCTION public.sales_discount_guard();
DROP TRIGGER IF EXISTS trg_order_items_discount_guard ON public.order_items;
CREATE TRIGGER trg_order_items_discount_guard BEFORE INSERT OR UPDATE OF discount ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.sales_discount_guard();
DROP TRIGGER IF EXISTS trg_quote_items_discount_guard ON public.quote_items;
CREATE TRIGGER trg_quote_items_discount_guard BEFORE INSERT OR UPDATE OF discount ON public.quote_items
FOR EACH ROW EXECUTE FUNCTION public.sales_discount_guard();

CREATE OR REPLACE FUNCTION public.sales_sync_cancelled_stage()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.status = 'cancelado' THEN
    NEW.workflow_stage := 'cancelado';
    NEW.payment_status := 'cancelado';
    NEW.fulfillment_status := 'cancelado';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_orders_sync_cancelled_stage ON public.orders;
CREATE TRIGGER trg_orders_sync_cancelled_stage BEFORE INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.sales_sync_cancelled_stage();

CREATE OR REPLACE FUNCTION public.sales_update_order_logistics(
  p_order_id uuid, p_warehouse_id uuid, p_address text, p_city text, p_state text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := auth.uid(); o public.orders%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND OR NOT public.sales_can_manage(uid,o.seller_id) THEN RAISE EXCEPTION 'Sem permissão para alterar o pedido.'; END IF;
  IF p_warehouse_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.warehouses WHERE id=p_warehouse_id AND is_active) THEN
    RAISE EXCEPTION 'Estoque inválido ou inativo.';
  END IF;
  UPDATE public.orders SET warehouse_id=p_warehouse_id, shipping_address=nullif(btrim(p_address),''),
    shipping_city=nullif(btrim(p_city),''), shipping_state=nullif(btrim(p_state),'') WHERE id=p_order_id;
  RETURN jsonb_build_object('id',p_order_id,'updated',true);
END $$;
REVOKE ALL ON FUNCTION public.sales_update_order_logistics(uuid,uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_update_order_logistics(uuid,uuid,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.sales_set_stage(p_order_id uuid, p_stage text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := auth.uid(); o public.orders%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF p_stage NOT IN ('pedido_feito','em_caminho','vendido','esperando_pagamento') THEN RAISE EXCEPTION 'Estágio inválido.'; END IF;
  SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND OR NOT public.sales_can_manage(uid,o.seller_id) THEN RAISE EXCEPTION 'Sem permissão para alterar o pedido.'; END IF;
  IF o.status='cancelado' THEN RAISE EXCEPTION 'Pedido cancelado não pode mudar de estágio.'; END IF;
  IF p_stage IN ('em_caminho','vendido','esperando_pagamento') AND o.stock_state='reservado' THEN
    PERFORM public.sales_apply_stock(p_order_id,'baixar_reservado',uid);
  END IF;
  UPDATE public.orders SET workflow_stage=p_stage,
    kind=CASE WHEN p_stage IN ('em_caminho','vendido','esperando_pagamento') THEN 'venda' ELSE kind END,
    stock_state=CASE WHEN p_stage IN ('em_caminho','vendido','esperando_pagamento') THEN 'baixado' ELSE stock_state END,
    payment_status=CASE WHEN p_stage='vendido' THEN 'pago' WHEN p_stage='esperando_pagamento' THEN 'a_pagar' ELSE payment_status END,
    fulfillment_status=CASE WHEN p_stage='em_caminho' THEN 'a_caminho' WHEN p_stage='vendido' THEN 'entregue' ELSE fulfillment_status END,
    status=CASE WHEN p_stage='vendido' THEN 'entregue' ELSE status END,
    delivered_at=CASE WHEN p_stage='vendido' THEN coalesce(delivered_at,current_date) ELSE delivered_at END,
    tracking_status=CASE WHEN p_stage='em_caminho' THEN 'Em caminho' WHEN p_stage='vendido' THEN 'Entregue' ELSE tracking_status END
  WHERE id=p_order_id;
  RETURN jsonb_build_object('id',p_order_id,'stage',p_stage);
END $$;
REVOKE ALL ON FUNCTION public.sales_set_stage(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_set_stage(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.inventory_sales_orders()
RETURNS TABLE(order_id uuid, number integer, created_at timestamptz, workflow_stage text,
  fulfillment_status text, warehouse_id uuid, warehouse_name text, warehouse_city text,
  warehouse_state text, customer_name text, shipping_address text, shipping_city text,
  shipping_state text, item_count bigint, total_quantity numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT o.id,o.number,o.created_at,o.workflow_stage,o.fulfillment_status,o.warehouse_id,
    w.name,w.city,w.state,c.name,o.shipping_address,o.shipping_city,o.shipping_state,
    count(oi.id),coalesce(sum(oi.quantity),0)
  FROM public.orders o
  LEFT JOIN public.warehouses w ON w.id=o.warehouse_id
  LEFT JOIN public.customers c ON c.id=o.customer_id
  LEFT JOIN public.order_items oi ON oi.order_id=o.id
  WHERE auth.uid() IS NOT NULL AND public.app_has_cap(auth.uid(),'inventory_view')
    AND o.status <> 'cancelado' AND o.workflow_stage IN ('pedido_feito','em_caminho')
  GROUP BY o.id,w.id,c.id
  ORDER BY o.number DESC LIMIT 500
$$;
REVOKE ALL ON FUNCTION public.inventory_sales_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_sales_orders() TO authenticated;

CREATE OR REPLACE FUNCTION public.sales_order_detail(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid:=auth.uid(); o public.orders%ROWTYPE; sale_ok boolean; cost_ok boolean; payload jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  SELECT * INTO o FROM public.orders WHERE id=p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
  sale_ok := public.sales_sees_all(uid) OR o.seller_id=uid;
  cost_ok := public.app_has_cap(uid,'company_finance');
  IF NOT sale_ok AND NOT public.app_has_cap(uid,'inventory_view') THEN RAISE EXCEPTION 'Sem permissão para ver este pedido.'; END IF;
  SELECT jsonb_build_object(
    'id',o.id,'number',o.number,'created_at',o.created_at,'workflow_stage',o.workflow_stage,
    'payment_status',o.payment_status,'fulfillment_status',o.fulfillment_status,
    'customer',(SELECT to_jsonb(c) - 'created_by' - 'is_demo' FROM public.customers c WHERE c.id=o.customer_id),
    'supplier',(SELECT jsonb_build_object('id',s.id,'name',s.name) FROM public.suppliers s WHERE s.id=o.supplier_id),
    'warehouse',(SELECT jsonb_build_object('id',w.id,'name',w.name,'city',w.city,'state',w.state) FROM public.warehouses w WHERE w.id=o.warehouse_id),
    'shipping',jsonb_build_object('address',o.shipping_address,'city',o.shipping_city,'state',o.shipping_state),
    'currency',o.currency,'total',CASE WHEN sale_ok THEN to_jsonb(o.total) ELSE 'null'::jsonb END,
    'discount',CASE WHEN sale_ok THEN to_jsonb(o.discount) ELSE 'null'::jsonb END,
    'cost_brl',CASE WHEN cost_ok THEN to_jsonb(o.total_cost_brl) ELSE 'null'::jsonb END,
    'cost_usd',CASE WHEN cost_ok THEN to_jsonb(o.total_cost_usd) ELSE 'null'::jsonb END,
    'paid',CASE WHEN sale_ok THEN to_jsonb(o.amount_paid) ELSE 'null'::jsonb END,
    'receivable',CASE WHEN sale_ok THEN to_jsonb(o.amount_receivable) ELSE 'null'::jsonb END,
    'cancel_reason',o.cancel_reason,'cancelled_at',o.cancelled_at,
    'items',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'description',oi.description,'sku',oi.sku,'quantity',oi.quantity,
      'unit_price',CASE WHEN sale_ok THEN to_jsonb(oi.unit_price) ELSE 'null'::jsonb END,
      'discount',CASE WHEN sale_ok THEN to_jsonb(oi.discount) ELSE 'null'::jsonb END,
      'total',CASE WHEN sale_ok THEN to_jsonb(oi.total) ELSE 'null'::jsonb END,
      'cost',CASE WHEN cost_ok THEN to_jsonb(ii.cost) ELSE 'null'::jsonb END,
      'product',p.name,'subcategory',pc.name,'supplier',s.name
    ) ORDER BY oi.created_at) FROM public.order_items oi
      LEFT JOIN public.inventory_items ii ON ii.id=oi.item_id
      LEFT JOIN public.products p ON p.id=ii.product_id
      LEFT JOIN public.product_categories pc ON pc.id=ii.category_id
      LEFT JOIN public.suppliers s ON s.id=coalesce(ii.supplier_id,o.supplier_id)
      WHERE oi.order_id=o.id),'[]'::jsonb)
  ) INTO payload;
  RETURN payload;
END $$;
REVOKE ALL ON FUNCTION public.sales_order_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_order_detail(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.inv_in_scope(_uid uuid, _item_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT _uid IS NOT NULL AND (
    public.is_admin(_uid)
    OR EXISTS (
      SELECT 1 FROM public.inventory_items i
      LEFT JOIN public.inventory_item_locations l ON l.item_id=i.id
      JOIN public.warehouse_user_assignments w ON w.user_id=_uid
       AND (w.product_id=i.product_id OR w.warehouse_id=l.warehouse_id OR (w.location IS NOT NULL AND w.location=l.location))
      WHERE i.id=_item_id
    )
  )
$$;
REVOKE EXECUTE ON FUNCTION public.inv_in_scope(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inv_in_scope(uuid,uuid) TO authenticated, service_role;




CREATE OR REPLACE FUNCTION public.sales_warehouses()
RETURNS TABLE(id uuid, name text, city text, state text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT w.id,w.name,w.city,w.state
  FROM public.warehouses w
  WHERE auth.uid() IS NOT NULL AND w.is_active
    AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=auth.uid())
  ORDER BY w.name
$$;
REVOKE ALL ON FUNCTION public.sales_warehouses() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_warehouses() TO authenticated;
