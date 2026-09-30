-- Liga itens históricos importados como texto aos produtos cadastrados no estoque.
WITH matches AS (
  SELECT oi.id AS order_item_id,
         (
           SELECT i.id
           FROM public.inventory_items i
           WHERE lower(btrim(i.name)) = lower(btrim(oi.description))
              OR lower(btrim(coalesce(i.variation,''))) = lower(btrim(oi.description))
              OR (lower(btrim(oi.description)) = 'retrazin' AND lower(i.name) LIKE 'retrat%')
           ORDER BY
             CASE WHEN lower(btrim(i.name)) = lower(btrim(oi.description)) THEN 0 ELSE 1 END,
             i.created_at
           LIMIT 1
         ) AS item_id
  FROM public.order_items oi
  WHERE oi.item_id IS NULL
)
UPDATE public.order_items oi
SET item_id = matches.item_id
FROM matches
WHERE oi.id = matches.order_item_id
  AND matches.item_id IS NOT NULL;

UPDATE public.orders o
SET product_id = linked.product_id
FROM (
  SELECT oi.order_id,min(i.product_id::text)::uuid AS product_id
  FROM public.order_items oi
  JOIN public.inventory_items i ON i.id=oi.item_id
  GROUP BY oi.order_id
  HAVING count(DISTINCT i.product_id)=1
) linked
WHERE o.id=linked.order_id AND o.product_id IS NULL;
