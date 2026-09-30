DROP POLICY IF EXISTS "ad_metrics_select" ON public.ad_metrics;
DROP POLICY IF EXISTS "ad_metrics_select_by_meta_account" ON public.ad_metrics;

CREATE POLICY "ad_metrics_select_scoped" ON public.ad_metrics
FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR (
    meta_ad_account_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.meta_ad_account_products m
      JOIN public.product_users pu ON pu.product_id = m.product_id
      WHERE m.meta_ad_account_id = ad_metrics.meta_ad_account_id
        AND pu.user_id = auth.uid()
    )
  )
  OR (
    meta_ad_account_id IS NULL
    AND product_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.product_users pu
      WHERE pu.product_id = ad_metrics.product_id
        AND pu.user_id = auth.uid()
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS meta_connections_meta_user_id_key
  ON public.meta_connections (meta_user_id);