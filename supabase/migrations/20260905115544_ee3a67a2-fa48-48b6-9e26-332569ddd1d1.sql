ALTER TABLE public.investments ADD COLUMN product_id uuid REFERENCES public.products(id);
ALTER TABLE public.bonus_awards ADD COLUMN product_id uuid REFERENCES public.products(id);
CREATE INDEX IF NOT EXISTS investments_product_idx ON public.investments (product_id);
CREATE INDEX IF NOT EXISTS bonus_awards_product_idx ON public.bonus_awards (product_id);