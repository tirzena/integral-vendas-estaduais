ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS tax_percent numeric(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_cost numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS markup_percent numeric(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_percent numeric(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.digital_catalogs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  cover_url text,
  show_prices boolean NOT NULL DEFAULT true,
  currency currency_code NOT NULL DEFAULT 'USD',
  whatsapp text,
  product_ids uuid[] NOT NULL DEFAULT '{}',
  category_ids uuid[] NOT NULL DEFAULT '{}',
  item_ids uuid[] NOT NULL DEFAULT '{}',
  is_published boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.digital_catalogs TO authenticated;
GRANT ALL ON public.digital_catalogs TO service_role;

ALTER TABLE public.digital_catalogs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "digital_catalogs_read" ON public.digital_catalogs FOR SELECT TO authenticated USING (true);
CREATE POLICY "digital_catalogs_write" ON public.digital_catalogs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "digital_catalogs_update" ON public.digital_catalogs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "digital_catalogs_delete" ON public.digital_catalogs FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

CREATE TRIGGER trg_digital_catalogs_updated BEFORE UPDATE ON public.digital_catalogs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();