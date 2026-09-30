-- Correcao restrita ao modulo de estoques: as policies consultam as capacidades
-- por uma funcao dedicada, sem conceder acesso ao schema private.
CREATE OR REPLACE FUNCTION public.warehouse_has_cap(_uid uuid, _cap text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT
    _uid IS NOT NULL
    AND _uid = (select auth.uid())
    AND _cap IN ('inventory_view','inventory_manage')
    AND EXISTS (
      SELECT 1 FROM private.effective_capabilities(_uid) capability
      WHERE capability = _cap
    )
$$;
REVOKE ALL ON FUNCTION public.warehouse_has_cap(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.warehouse_has_cap(uuid,text) TO authenticated, service_role;

DROP POLICY IF EXISTS warehouses_read ON public.warehouses;
CREATE POLICY warehouses_read ON public.warehouses FOR SELECT TO authenticated
  USING (public.warehouse_has_cap((select auth.uid()), 'inventory_view'));

DROP POLICY IF EXISTS warehouses_manage ON public.warehouses;
CREATE POLICY warehouses_manage ON public.warehouses FOR ALL TO authenticated
  USING (public.warehouse_has_cap((select auth.uid()), 'inventory_manage'))
  WITH CHECK (public.warehouse_has_cap((select auth.uid()), 'inventory_manage'));

DROP POLICY IF EXISTS warehouse_inventory_read ON public.warehouse_inventory;
CREATE POLICY warehouse_inventory_read ON public.warehouse_inventory FOR SELECT TO authenticated
  USING (public.warehouse_has_cap((select auth.uid()), 'inventory_view'));

DROP POLICY IF EXISTS warehouse_inventory_manage ON public.warehouse_inventory;
CREATE POLICY warehouse_inventory_manage ON public.warehouse_inventory FOR ALL TO authenticated
  USING (public.warehouse_has_cap((select auth.uid()), 'inventory_manage'))
  WITH CHECK (public.warehouse_has_cap((select auth.uid()), 'inventory_manage'));

