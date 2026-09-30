ALTER TABLE public.product_categories
  ADD COLUMN IF NOT EXISTS image_url text;
