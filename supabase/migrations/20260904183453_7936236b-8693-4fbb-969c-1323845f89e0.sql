CREATE TABLE public.product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  position integer NOT NULL DEFAULT 0,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_categories TO authenticated;
GRANT ALL ON public.product_categories TO service_role;

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver subcategorias com acesso ao produto"
ON public.product_categories FOR SELECT TO authenticated
USING (public.has_product_access(auth.uid(), product_id));

CREATE POLICY "Criar subcategorias com acesso ao produto"
ON public.product_categories FOR INSERT TO authenticated
WITH CHECK (public.has_product_access(auth.uid(), product_id));

CREATE POLICY "Editar subcategorias com acesso ao produto"
ON public.product_categories FOR UPDATE TO authenticated
USING (public.has_product_access(auth.uid(), product_id))
WITH CHECK (public.has_product_access(auth.uid(), product_id));

CREATE POLICY "Excluir subcategorias com acesso ao produto"
ON public.product_categories FOR DELETE TO authenticated
USING (public.has_product_access(auth.uid(), product_id));

CREATE TRIGGER trg_product_categories_updated
BEFORE UPDATE ON public.product_categories
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_product_categories_product ON public.product_categories(product_id);

ALTER TABLE public.inventory_items
  ADD COLUMN category_id uuid REFERENCES public.product_categories(id) ON DELETE SET NULL,
  ADD COLUMN size text,
  ADD COLUMN weight text,
  ADD COLUMN volume text,
  ADD COLUMN unit text;

CREATE INDEX idx_inventory_items_category ON public.inventory_items(category_id);