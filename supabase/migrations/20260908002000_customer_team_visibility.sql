-- Vendedores veem seus próprios clientes e, quando o gestor autoriza, os clientes da equipe.
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS sellers_can_view_team_clients boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.sales_can_view_customer(_customer_id uuid, _created_by uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT
    public.is_admin(auth.uid())
    OR _created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.customer_id=_customer_id AND o.seller_id=auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.customer_products cp
      WHERE cp.customer_id=_customer_id AND cp.owner_id=auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.teams t
      JOIN public.team_members colleague ON colleague.team_id=t.id
      WHERE (t.manager_id=auth.uid() OR (
          t.sellers_can_view_team_clients
          AND EXISTS (
            SELECT 1 FROM public.team_members mine
            WHERE mine.team_id=t.id AND mine.user_id=auth.uid()
          )
        ))
        AND (
          colleague.user_id=_created_by
          OR EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.customer_id=_customer_id AND o.seller_id=colleague.user_id
          )
          OR EXISTS (
            SELECT 1 FROM public.customer_products cp
            WHERE cp.customer_id=_customer_id AND cp.owner_id=colleague.user_id
          )
        )
    )
$$;
REVOKE ALL ON FUNCTION public.sales_can_view_customer(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_can_view_customer(uuid,uuid) TO authenticated;

DROP POLICY IF EXISTS customers_read ON public.customers;
DROP POLICY IF EXISTS customers_team_read ON public.customers;
CREATE POLICY customers_team_read ON public.customers FOR SELECT TO authenticated
  USING (public.sales_can_view_customer(id,created_by));

DROP POLICY IF EXISTS customer_contacts_read ON public.customer_contacts;
DROP POLICY IF EXISTS customer_contacts_team_read ON public.customer_contacts;
CREATE POLICY customer_contacts_team_read ON public.customer_contacts FOR SELECT TO authenticated
  USING (public.sales_can_view_customer(customer_id,NULL));

DROP POLICY IF EXISTS customer_documents_read ON public.customer_documents;
DROP POLICY IF EXISTS customer_documents_team_read ON public.customer_documents;
CREATE POLICY customer_documents_team_read ON public.customer_documents FOR SELECT TO authenticated
  USING (public.sales_can_view_customer(customer_id,NULL));

DROP POLICY IF EXISTS customer_products_read ON public.customer_products;
DROP POLICY IF EXISTS customer_products_team_read ON public.customer_products;
CREATE POLICY customer_products_team_read ON public.customer_products FOR SELECT TO authenticated
  USING (public.sales_can_view_customer(customer_id,NULL));

DROP POLICY IF EXISTS opportunity_history_read ON public.opportunity_history;
DROP POLICY IF EXISTS opportunity_history_team_read ON public.opportunity_history;
CREATE POLICY opportunity_history_team_read ON public.opportunity_history FOR SELECT TO authenticated
  USING (EXISTS(
    SELECT 1 FROM public.customer_products cp
    WHERE cp.id=opportunity_history.customer_product_id
      AND public.sales_can_view_customer(cp.customer_id,NULL)
  ));

DROP POLICY IF EXISTS activities_read ON public.activities;
DROP POLICY IF EXISTS activities_team_read ON public.activities;
CREATE POLICY activities_team_read ON public.activities FOR SELECT TO authenticated
  USING (customer_id IS NULL OR public.sales_can_view_customer(customer_id,NULL));

CREATE OR REPLACE FUNCTION public.sales_visible_customer_ownership()
RETURNS TABLE(customer_id uuid,seller_id uuid,team_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT DISTINCT o.customer_id,o.seller_id,tm.team_id
  FROM public.orders o
  LEFT JOIN public.team_members tm ON tm.user_id=o.seller_id
  WHERE o.customer_id IS NOT NULL AND o.seller_id IS NOT NULL
    AND public.sales_can_view_customer(o.customer_id,NULL)
$$;
REVOKE ALL ON FUNCTION public.sales_visible_customer_ownership() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_visible_customer_ownership() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_team_client_visibility(_team_id uuid,_enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT (
    public.is_admin(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.teams t WHERE t.id=_team_id AND t.manager_id=auth.uid()
    )
  ) THEN
    RAISE EXCEPTION 'Apenas o gestor da equipe pode alterar esta permissão.';
  END IF;
  UPDATE public.teams SET sellers_can_view_team_clients=_enabled,updated_at=now() WHERE id=_team_id;
END $$;
REVOKE ALL ON FUNCTION public.set_team_client_visibility(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_team_client_visibility(uuid,boolean) TO authenticated;
