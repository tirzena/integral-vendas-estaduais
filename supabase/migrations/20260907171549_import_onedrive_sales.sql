-- Campos de auditoria para vendas importadas de fontes externas.
-- Os dados pessoais são importados diretamente no Supabase e nunca versionados no Git.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS source_reference text,
  ADD COLUMN IF NOT EXISTS source_month text,
  ADD COLUMN IF NOT EXISTS amount_paid numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_receivable numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonus_percent numeric(8,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonus_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cost_usd numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cost_brl numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_margin numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_payload jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS orders_source_reference_uq
  ON public.orders(source_reference)
  WHERE source_reference IS NOT NULL;
