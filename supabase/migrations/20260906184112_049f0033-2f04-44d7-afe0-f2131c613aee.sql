DROP INDEX IF EXISTS public.ad_metrics_meta_unique;
CREATE UNIQUE INDEX ad_metrics_meta_unique
  ON public.ad_metrics (meta_ad_account_id, metric_date, level, object_id);