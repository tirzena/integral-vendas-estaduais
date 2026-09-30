CREATE OR REPLACE FUNCTION public.can_manage_catalog(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('superadmin','admin','gestor','estoque')
  )
$$;

CREATE OR REPLACE FUNCTION public.has_product_access(_user_id uuid, _product_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_manage_catalog(_user_id)
      OR EXISTS (SELECT 1 FROM public.product_users pu WHERE pu.user_id = _user_id AND pu.product_id = _product_id)
$$;

DROP POLICY IF EXISTS products_admin_write ON public.products;
CREATE POLICY products_manage ON public.products
  FOR ALL TO authenticated
  USING (public.can_manage_catalog(auth.uid()))
  WITH CHECK (public.can_manage_catalog(auth.uid()));

DROP POLICY IF EXISTS inventory_items_delete ON public.inventory_items;
CREATE POLICY inventory_items_delete ON public.inventory_items
  FOR DELETE TO authenticated
  USING (public.can_manage_catalog(auth.uid()));