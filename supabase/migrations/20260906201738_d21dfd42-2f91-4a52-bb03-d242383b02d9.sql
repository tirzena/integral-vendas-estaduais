CREATE OR REPLACE FUNCTION public.sales_sees_all(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND (
    public.is_admin(_user_id)
    OR public.has_role(_user_id, 'gestor')
    OR public.has_role(_user_id, 'financeiro')
  )
$$;
REVOKE EXECUTE ON FUNCTION public.sales_sees_all(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_sees_all(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.sales_can_see_order(_order_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orders o WHERE o.id = _order_id AND (
      public.sales_sees_all(auth.uid())
      OR o.seller_id = auth.uid()
      OR (o.product_id IS NOT NULL AND public.has_product_access(auth.uid(), o.product_id))
    )
  )
$$;
REVOKE EXECUTE ON FUNCTION public.sales_can_see_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_can_see_order(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.sales_can_see_quote(_quote_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.quotes q WHERE q.id = _quote_id AND (
      public.sales_sees_all(auth.uid())
      OR q.seller_id = auth.uid()
      OR (q.product_id IS NOT NULL AND public.has_product_access(auth.uid(), q.product_id))
    )
  )
$$;
REVOKE EXECUTE ON FUNCTION public.sales_can_see_quote(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_can_see_quote(uuid) TO authenticated;

-- orders
DROP POLICY IF EXISTS orders_read ON public.orders;
DROP POLICY IF EXISTS orders_update ON public.orders;
CREATE POLICY orders_read ON public.orders FOR SELECT TO authenticated
  USING (public.sales_sees_all(auth.uid()) OR seller_id = auth.uid()
    OR (product_id IS NOT NULL AND public.has_product_access(auth.uid(), product_id)));
CREATE POLICY orders_update ON public.orders FOR UPDATE TO authenticated
  USING (public.sales_sees_all(auth.uid()) OR seller_id = auth.uid()
    OR (product_id IS NOT NULL AND public.has_product_access(auth.uid(), product_id)));

-- quotes
DROP POLICY IF EXISTS quotes_read ON public.quotes;
DROP POLICY IF EXISTS quotes_update ON public.quotes;
CREATE POLICY quotes_read ON public.quotes FOR SELECT TO authenticated
  USING (public.sales_sees_all(auth.uid()) OR seller_id = auth.uid()
    OR (product_id IS NOT NULL AND public.has_product_access(auth.uid(), product_id)));
CREATE POLICY quotes_update ON public.quotes FOR UPDATE TO authenticated
  USING (public.sales_sees_all(auth.uid()) OR seller_id = auth.uid()
    OR (product_id IS NOT NULL AND public.has_product_access(auth.uid(), product_id)));

-- itens e pagamentos seguem o documento
DROP POLICY IF EXISTS order_items_read ON public.order_items;
DROP POLICY IF EXISTS order_items_update ON public.order_items;
CREATE POLICY order_items_read ON public.order_items FOR SELECT TO authenticated
  USING (public.sales_can_see_order(order_id));
CREATE POLICY order_items_update ON public.order_items FOR UPDATE TO authenticated
  USING (public.sales_can_see_order(order_id));

DROP POLICY IF EXISTS quote_items_read ON public.quote_items;
DROP POLICY IF EXISTS quote_items_update ON public.quote_items;
CREATE POLICY quote_items_read ON public.quote_items FOR SELECT TO authenticated
  USING (public.sales_can_see_quote(quote_id));
CREATE POLICY quote_items_update ON public.quote_items FOR UPDATE TO authenticated
  USING (public.sales_can_see_quote(quote_id));

DROP POLICY IF EXISTS payments_read ON public.payments;
DROP POLICY IF EXISTS payments_update ON public.payments;
CREATE POLICY payments_read ON public.payments FOR SELECT TO authenticated
  USING (public.sales_can_see_order(order_id));
CREATE POLICY payments_update ON public.payments FOR UPDATE TO authenticated
  USING (public.sales_sees_all(auth.uid()));