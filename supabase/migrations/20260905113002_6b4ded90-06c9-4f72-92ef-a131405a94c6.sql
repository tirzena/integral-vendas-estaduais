ALTER TABLE public.member_compensations
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.product_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS label text;

ALTER TABLE public.payroll_entries
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.product_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_member_compensations_category ON public.member_compensations(category_id);
CREATE INDEX IF NOT EXISTS idx_payroll_entries_category ON public.payroll_entries(category_id);