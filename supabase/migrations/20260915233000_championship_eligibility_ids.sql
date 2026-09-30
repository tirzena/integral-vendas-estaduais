BEGIN;
ALTER TABLE public.ranking_championships
 ADD COLUMN IF NOT EXISTS eligible_macro_ids uuid[] NOT NULL DEFAULT '{}',
 ADD COLUMN IF NOT EXISTS eligible_category_ids uuid[] NOT NULL DEFAULT '{}',
 ADD COLUMN IF NOT EXISTS eligible_item_ids uuid[] NOT NULL DEFAULT '{}';
DO $migration$
DECLARE definition text;
BEGIN
 definition := pg_get_functiondef('public.ranking_championship_standings(text)'::regprocedure);
 IF position($old$WHERE cardinality(c.eligible_products)=0 OR lower(trim(i.description))=ANY(c.eligible_products)$old$ IN definition)=0 THEN
  IF position('c.eligible_macro_ids' IN definition)>0 AND position('c.eligible_category_ids' IN definition)>0 AND position('c.eligible_item_ids' IN definition)>0 THEN RETURN; END IF;
  RAISE EXCEPTION 'Predicado de elegibilidade não encontrado; revisar função antes de aplicar.';
 END IF;
 EXECUTE replace(definition, $old$WHERE cardinality(c.eligible_products)=0 OR lower(trim(i.description))=ANY(c.eligible_products)$old$, $new$WHERE (cardinality(c.eligible_macro_ids)=0 OR EXISTS (SELECT 1 FROM public.inventory_items inv WHERE inv.id=i.item_id AND inv.product_id=ANY(c.eligible_macro_ids)))
 AND (cardinality(c.eligible_category_ids)=0 OR EXISTS (SELECT 1 FROM public.inventory_items inv WHERE inv.id=i.item_id AND inv.category_id=ANY(c.eligible_category_ids)))
 AND (cardinality(c.eligible_item_ids)=0 OR i.item_id=ANY(c.eligible_item_ids))
 AND (cardinality(c.eligible_macro_ids)+cardinality(c.eligible_category_ids)+cardinality(c.eligible_item_ids)>0 OR cardinality(c.eligible_products)=0 OR lower(trim(i.description))=ANY(c.eligible_products))$new$);
END $migration$;
NOTIFY pgrst, 'reload schema';
COMMIT;
