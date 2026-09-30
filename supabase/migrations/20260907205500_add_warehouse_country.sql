ALTER TABLE public.warehouses
  ADD COLUMN IF NOT EXISTS country text;

UPDATE public.warehouses
SET country = CASE
  WHEN upper(coalesce(state, '')) IN ('ALTO PARANA', 'ALTO PARANÁ', 'CENTRAL', 'ITAPUA', 'ITAPÚA')
    THEN 'Paraguai'
  ELSE 'Brasil'
END
WHERE country IS NULL OR btrim(country) = '';
