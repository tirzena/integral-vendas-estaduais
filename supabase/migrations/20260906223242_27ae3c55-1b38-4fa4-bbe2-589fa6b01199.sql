
-- ============ 1. TABELAS ADITIVAS ============
CREATE TABLE IF NOT EXISTS public.warehouse_user_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  location text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.warehouse_user_assignments TO authenticated;
GRANT ALL ON public.warehouse_user_assignments TO service_role;
ALTER TABLE public.warehouse_user_assignments ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS wua_uniq
  ON public.warehouse_user_assignments (user_id, coalesce(product_id,'00000000-0000-0000-0000-000000000000'::uuid), coalesce(location,''));

CREATE TABLE IF NOT EXISTS public.delivery_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, driver_id)
);
GRANT SELECT ON public.delivery_assignments TO authenticated;
GRANT ALL ON public.delivery_assignments TO service_role;
ALTER TABLE public.delivery_assignments ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS da_driver_idx ON public.delivery_assignments(driver_id);

CREATE TABLE IF NOT EXISTS public.inventory_item_locations (
  item_id uuid PRIMARY KEY REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  location text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.inventory_item_locations TO authenticated;
GRANT ALL ON public.inventory_item_locations TO service_role;
ALTER TABLE public.inventory_item_locations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.order_delivery_private (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  tracking_location text,
  tracking_url text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.order_delivery_private TO authenticated;
GRANT ALL ON public.order_delivery_private TO service_role;
ALTER TABLE public.order_delivery_private ENABLE ROW LEVEL SECURITY;

-- ============ 2. MIGRAÇÃO DOS DADOS SENSÍVEIS LEGADOS ============
INSERT INTO public.inventory_item_locations (item_id, location)
SELECT i.id, i.location FROM public.inventory_items i
WHERE i.location IS NOT NULL AND btrim(i.location) <> ''
ON CONFLICT (item_id) DO UPDATE SET location = EXCLUDED.location, updated_at = now();

INSERT INTO public.order_delivery_private (order_id, tracking_location, tracking_url)
SELECT o.id, o.tracking_location, o.tracking_url FROM public.orders o
WHERE coalesce(btrim(o.tracking_location),'') <> '' OR coalesce(btrim(o.tracking_url),'') <> ''
ON CONFLICT (order_id) DO UPDATE
  SET tracking_location = EXCLUDED.tracking_location, tracking_url = EXCLUDED.tracking_url, updated_at = now();

UPDATE public.inventory_items i SET location = NULL
WHERE i.location IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.inventory_item_locations l WHERE l.item_id = i.id AND l.location IS NOT DISTINCT FROM i.location);

UPDATE public.orders o SET tracking_location = NULL, tracking_url = NULL
WHERE (o.tracking_location IS NOT NULL OR o.tracking_url IS NOT NULL)
  AND EXISTS (
    SELECT 1 FROM public.order_delivery_private p
    WHERE p.order_id = o.id
      AND p.tracking_location IS NOT DISTINCT FROM o.tracking_location
      AND p.tracking_url IS NOT DISTINCT FROM o.tracking_url);

-- ============ 3. CAPACIDADES E ESCOPOS ============
CREATE OR REPLACE FUNCTION public.app_has_cap(_uid uuid, _cap text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT _uid IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _uid AND (
      ur.role IN ('superadmin','admin')
      OR (_cap = 'inventory_view'    AND ur.role IN ('gestor','financeiro','estoque'))
      OR (_cap = 'inventory_manage'  AND ur.role = 'estoque')
      OR (_cap = 'deliveries_view'   AND ur.role IN ('gestor','entregador'))
      OR (_cap = 'deliveries_manage' AND ur.role = 'gestor')
      OR (_cap = 'tracking_share_own' AND ur.role = 'entregador')
    )
  )
$$;
REVOKE EXECUTE ON FUNCTION public.app_has_cap(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_has_cap(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.inv_in_scope(_uid uuid, _item_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT _uid IS NOT NULL AND (
    public.is_admin(_uid)
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=_uid AND ur.role IN ('gestor','financeiro'))
    OR (
      EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=_uid AND ur.role='estoque')
      AND EXISTS (
        SELECT 1 FROM public.inventory_items i
        LEFT JOIN public.inventory_item_locations l ON l.item_id = i.id
        JOIN public.warehouse_user_assignments w ON w.user_id = _uid
        WHERE i.id = _item_id
          AND ( (w.product_id IS NOT NULL AND w.product_id = i.product_id)
             OR (w.location   IS NOT NULL AND w.location = l.location) )
      )
    )
  )
$$;
REVOKE EXECUTE ON FUNCTION public.inv_in_scope(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inv_in_scope(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.inv_can_manage_item(_uid uuid, _item_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT _uid IS NOT NULL AND (
    public.is_admin(_uid)
    OR ( EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=_uid AND ur.role='estoque')
         AND public.inv_in_scope(_uid, _item_id) )
  )
$$;
REVOKE EXECUTE ON FUNCTION public.inv_can_manage_item(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inv_can_manage_item(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.inv_can_write_product(_uid uuid, _product_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT _uid IS NOT NULL AND (
    public.is_admin(_uid)
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.warehouse_user_assignments w ON w.user_id = _uid AND w.product_id = _product_id
      WHERE ur.user_id = _uid AND ur.role = 'estoque'
    )
  )
$$;
REVOKE EXECUTE ON FUNCTION public.inv_can_write_product(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inv_can_write_product(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.delivery_is_assigned(_uid uuid, _order_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT _uid IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.delivery_assignments d
    WHERE d.order_id = _order_id AND d.driver_id = _uid
  )
$$;
REVOKE EXECUTE ON FUNCTION public.delivery_is_assigned(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delivery_is_assigned(uuid, uuid) TO authenticated, service_role;

-- ============ 4. POLICIES DAS TABELAS NOVAS ============
DROP POLICY IF EXISTS wua_admin_all ON public.warehouse_user_assignments;
CREATE POLICY wua_admin_all ON public.warehouse_user_assignments FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()) AND created_by = auth.uid());
DROP POLICY IF EXISTS wua_read_own ON public.warehouse_user_assignments;
CREATE POLICY wua_read_own ON public.warehouse_user_assignments FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS da_admin_all ON public.delivery_assignments;
CREATE POLICY da_admin_all ON public.delivery_assignments FOR ALL TO authenticated
  USING (public.app_has_cap(auth.uid(),'deliveries_manage'))
  WITH CHECK (public.app_has_cap(auth.uid(),'deliveries_manage') AND created_by = auth.uid());
DROP POLICY IF EXISTS da_read_own ON public.delivery_assignments;
CREATE POLICY da_read_own ON public.delivery_assignments FOR SELECT TO authenticated
  USING (driver_id = auth.uid());

DROP POLICY IF EXISTS iil_scope ON public.inventory_item_locations;
CREATE POLICY iil_scope ON public.inventory_item_locations FOR SELECT TO authenticated
  USING (public.inv_in_scope(auth.uid(), item_id));
DROP POLICY IF EXISTS iil_write ON public.inventory_item_locations;
CREATE POLICY iil_write ON public.inventory_item_locations FOR ALL TO authenticated
  USING (public.inv_can_manage_item(auth.uid(), item_id))
  WITH CHECK (public.inv_can_manage_item(auth.uid(), item_id));

DROP POLICY IF EXISTS odp_read ON public.order_delivery_private;
CREATE POLICY odp_read ON public.order_delivery_private FOR SELECT TO authenticated
  USING (public.app_has_cap(auth.uid(),'deliveries_manage'));
DROP POLICY IF EXISTS odp_write ON public.order_delivery_private;
CREATE POLICY odp_write ON public.order_delivery_private FOR ALL TO authenticated
  USING (public.app_has_cap(auth.uid(),'deliveries_manage'))
  WITH CHECK (public.app_has_cap(auth.uid(),'deliveries_manage'));

-- ============ 5. SUBSTITUIÇÃO DAS POLICIES PERMISSIVAS ============
DROP POLICY IF EXISTS inventory_items_read   ON public.inventory_items;
DROP POLICY IF EXISTS inventory_items_write  ON public.inventory_items;
DROP POLICY IF EXISTS inventory_items_update ON public.inventory_items;
DROP POLICY IF EXISTS inventory_items_delete ON public.inventory_items;
CREATE POLICY inventory_items_select ON public.inventory_items FOR SELECT TO authenticated
  USING (public.inv_in_scope(auth.uid(), id));
CREATE POLICY inventory_items_insert ON public.inventory_items FOR INSERT TO authenticated
  WITH CHECK (public.inv_can_write_product(auth.uid(), product_id));
CREATE POLICY inventory_items_update ON public.inventory_items FOR UPDATE TO authenticated
  USING (public.inv_can_manage_item(auth.uid(), id))
  WITH CHECK (public.inv_can_manage_item(auth.uid(), id));
CREATE POLICY inventory_items_delete ON public.inventory_items FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS inventory_movements_read   ON public.inventory_movements;
DROP POLICY IF EXISTS inventory_movements_write  ON public.inventory_movements;
DROP POLICY IF EXISTS inventory_movements_update ON public.inventory_movements;
DROP POLICY IF EXISTS inventory_movements_delete ON public.inventory_movements;
CREATE POLICY inventory_movements_select ON public.inventory_movements FOR SELECT TO authenticated
  USING (public.inv_in_scope(auth.uid(), item_id));
CREATE POLICY inventory_movements_insert ON public.inventory_movements FOR INSERT TO authenticated
  WITH CHECK (public.inv_can_manage_item(auth.uid(), item_id) AND user_id = auth.uid());
CREATE POLICY inventory_movements_update ON public.inventory_movements FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY inventory_movements_delete ON public.inventory_movements FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS delivery_events_read   ON public.delivery_events;
DROP POLICY IF EXISTS delivery_events_write  ON public.delivery_events;
DROP POLICY IF EXISTS delivery_events_update ON public.delivery_events;
DROP POLICY IF EXISTS delivery_events_delete ON public.delivery_events;
CREATE POLICY delivery_events_select ON public.delivery_events FOR SELECT TO authenticated
  USING (public.app_has_cap(auth.uid(),'deliveries_manage')
         OR public.delivery_is_assigned(auth.uid(), order_id));
CREATE POLICY delivery_events_insert ON public.delivery_events FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND status IN ('coletado','em_transito','saiu_entrega','entregue','problema')
    AND (public.app_has_cap(auth.uid(),'deliveries_manage')
         OR public.delivery_is_assigned(auth.uid(), order_id))
  );
CREATE POLICY delivery_events_update ON public.delivery_events FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY delivery_events_delete ON public.delivery_events FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- pedidos: fecha o INSERT/UPDATE irrestrito
DROP POLICY IF EXISTS orders_write ON public.orders;
CREATE POLICY orders_write ON public.orders FOR INSERT TO authenticated
  WITH CHECK (public.sales_sees_all(auth.uid()) OR seller_id = auth.uid());
DROP POLICY IF EXISTS orders_update ON public.orders;
CREATE POLICY orders_update ON public.orders FOR UPDATE TO authenticated
  USING (public.sales_sees_all(auth.uid()) OR seller_id = auth.uid()
         OR (product_id IS NOT NULL AND public.has_product_access(auth.uid(), product_id)))
  WITH CHECK (public.sales_sees_all(auth.uid()) OR seller_id = auth.uid()
         OR (product_id IS NOT NULL AND public.has_product_access(auth.uid(), product_id)));

-- pessoas e cargos deixam de ser enumeráveis por qualquer autenticado
DROP POLICY IF EXISTS profiles_select_all ON public.profiles;
CREATE POLICY profiles_select_scoped ON public.profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.is_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.user_roles ur
               WHERE ur.user_id = auth.uid()
                 AND ur.role IN ('gestor','financeiro','vendedor','estoque'))
  );

DROP POLICY IF EXISTS user_roles_read ON public.user_roles;
DROP POLICY IF EXISTS user_roles_select ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
CREATE POLICY user_roles_select_scoped ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid())
         OR public.has_role(auth.uid(),'gestor'));

-- ============ 6. CONSULTAS ENXUTAS (RPC) ============
CREATE OR REPLACE FUNCTION public.sales_items_for_sale(_product_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid, name text, sku text, barcode text, brand text, variation text,
              unit text, price numeric, currency public.currency_code,
              product_id uuid, category_id uuid, available numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT i.id, i.name, i.sku, i.barcode, i.brand, i.variation, i.unit,
         i.price, i.currency, i.product_id, i.category_id,
         greatest(coalesce(i.quantity,0) - coalesce(i.reserved,0), 0)
  FROM public.inventory_items i
  WHERE i.is_active
    AND auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
                 AND ur.role IN ('superadmin','admin','gestor','financeiro','vendedor','estoque'))
    AND (_product_id IS NULL OR i.product_id = _product_id)
    AND (i.product_id IS NULL OR public.has_product_access(auth.uid(), i.product_id)
         OR public.sales_sees_all(auth.uid()))
  ORDER BY i.name
  LIMIT 2000
$$;
REVOKE EXECUTE ON FUNCTION public.sales_items_for_sale(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_items_for_sale(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.my_deliveries()
RETURNS TABLE(order_id uuid, number integer, status text, tracking_status text,
              recipient text, address text, phone text, deadline date,
              delivered_at date, instructions text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT o.id, o.number, o.status, o.tracking_status,
         coalesce(c.name, o.delivery->>'name'),
         coalesce(o.delivery->>'address', c.address),
         coalesce(o.whatsapp, c.phone),
         o.delivery_deadline, o.delivered_at, o.delivery->>'notes'
  FROM public.orders o
  JOIN public.delivery_assignments d ON d.order_id = o.id AND d.driver_id = auth.uid()
  LEFT JOIN public.customers c ON c.id = o.customer_id
  WHERE auth.uid() IS NOT NULL AND o.status <> 'cancelado'
  ORDER BY o.delivery_deadline NULLS LAST, o.number DESC
  LIMIT 300
$$;
REVOKE EXECUTE ON FUNCTION public.my_deliveries() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_deliveries() TO authenticated;
