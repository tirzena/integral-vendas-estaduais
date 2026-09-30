ALTER TABLE public.accounts_payable
  ADD COLUMN IF NOT EXISTS recurrence text NOT NULL DEFAULT 'variavel',
  ADD COLUMN IF NOT EXISTS installment_number integer,
  ADD COLUMN IF NOT EXISTS installments_total integer;

ALTER TABLE public.accounts_receivable
  ADD COLUMN IF NOT EXISTS recurrence text NOT NULL DEFAULT 'variavel',
  ADD COLUMN IF NOT EXISTS installment_number integer,
  ADD COLUMN IF NOT EXISTS installments_total integer;

CREATE INDEX IF NOT EXISTS idx_ap_recurrence ON public.accounts_payable(recurrence);
CREATE INDEX IF NOT EXISTS idx_ar_recurrence ON public.accounts_receivable(recurrence);