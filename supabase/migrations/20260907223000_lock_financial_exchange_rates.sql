-- Congela a conversão monetária de novos pagamentos, sem reprocessar o histórico existente.
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS exchange_markup_brl numeric(10,4) NOT NULL DEFAULT 0.12;

ALTER TABLE public.accounts_receivable
  ADD COLUMN IF NOT EXISTS settled_amount_brl numeric(20,4),
  ADD COLUMN IF NOT EXISTS settled_amount_usd numeric(20,4),
  ADD COLUMN IF NOT EXISTS settled_amount_pyg numeric(20,4),
  ADD COLUMN IF NOT EXISTS exchange_rates_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS exchange_rate_source text,
  ADD COLUMN IF NOT EXISTS exchange_rate_locked_at timestamptz;

ALTER TABLE public.accounts_payable
  ADD COLUMN IF NOT EXISTS settled_amount_brl numeric(20,4),
  ADD COLUMN IF NOT EXISTS settled_amount_usd numeric(20,4),
  ADD COLUMN IF NOT EXISTS settled_amount_pyg numeric(20,4),
  ADD COLUMN IF NOT EXISTS exchange_rates_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS exchange_rate_source text,
  ADD COLUMN IF NOT EXISTS exchange_rate_locked_at timestamptz;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS settled_amount_brl numeric(20,4),
  ADD COLUMN IF NOT EXISTS settled_amount_usd numeric(20,4),
  ADD COLUMN IF NOT EXISTS settled_amount_pyg numeric(20,4),
  ADD COLUMN IF NOT EXISTS exchange_rates_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS exchange_rate_source text,
  ADD COLUMN IF NOT EXISTS exchange_rate_locked_at timestamptz;

ALTER TABLE public.payroll_entries
  ADD COLUMN IF NOT EXISTS settled_amount_brl numeric(20,4),
  ADD COLUMN IF NOT EXISTS settled_amount_usd numeric(20,4),
  ADD COLUMN IF NOT EXISTS settled_amount_pyg numeric(20,4),
  ADD COLUMN IF NOT EXISTS exchange_rates_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS exchange_rate_source text,
  ADD COLUMN IF NOT EXISTS exchange_rate_locked_at timestamptz;

CREATE OR REPLACE FUNCTION public.financial_rate_at(
  p_base public.currency_code,
  p_quote public.currency_code,
  p_at timestamptz
)
RETURNS TABLE(rate numeric, source text, captured_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_base = p_quote THEN
    RETURN QUERY SELECT 1::numeric, 'Moeda original'::text, p_at;
    RETURN;
  END IF;

  RETURN QUERY
    SELECT e.rate, e.source, e.created_at
      FROM public.exchange_rates e
     WHERE e.base_currency = p_base
       AND e.quote_currency = p_quote
       AND e.created_at <= p_at
     ORDER BY e.created_at DESC
     LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY
      SELECT e.rate, e.source, e.created_at
        FROM public.exchange_rates e
       WHERE e.base_currency = p_base
         AND e.quote_currency = p_quote
       ORDER BY e.created_at DESC
       LIMIT 1;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.lock_financial_exchange_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  lock_at timestamptz := coalesce(NEW.paid_at::timestamptz, now());
  brl_rate numeric;
  usd_rate numeric;
  pyg_rate numeric;
  rate_source text;
  rate_time timestamptz;
BEGIN
  IF (NEW.status <> 'pago' AND NEW.paid_at IS NULL) OR NEW.exchange_rate_locked_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT r.rate, r.source, r.captured_at INTO brl_rate, rate_source, rate_time
    FROM public.financial_rate_at(NEW.currency, 'BRL', lock_at) r LIMIT 1;
  SELECT r.rate INTO usd_rate
    FROM public.financial_rate_at(NEW.currency, 'USD', lock_at) r LIMIT 1;
  SELECT r.rate INTO pyg_rate
    FROM public.financial_rate_at(NEW.currency, 'PYG', lock_at) r LIMIT 1;

  IF brl_rate IS NULL OR usd_rate IS NULL OR pyg_rate IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.settled_amount_brl := round(NEW.amount * brl_rate, 4);
  NEW.settled_amount_usd := round(NEW.amount * usd_rate, 4);
  NEW.settled_amount_pyg := round(NEW.amount * pyg_rate, 4);
  NEW.exchange_rates_snapshot := jsonb_build_object(
    'base', NEW.currency, 'BRL', brl_rate, 'USD', usd_rate, 'PYG', pyg_rate
  );
  NEW.exchange_rate_source := coalesce(rate_source, 'Histórico de câmbio');
  NEW.exchange_rate_locked_at := coalesce(rate_time, lock_at);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS lock_exchange_snapshot ON public.accounts_receivable;
CREATE TRIGGER lock_exchange_snapshot BEFORE INSERT OR UPDATE OF amount, currency, status, paid_at
  ON public.accounts_receivable FOR EACH ROW EXECUTE FUNCTION public.lock_financial_exchange_snapshot();

DROP TRIGGER IF EXISTS lock_exchange_snapshot ON public.accounts_payable;
CREATE TRIGGER lock_exchange_snapshot BEFORE INSERT OR UPDATE OF amount, currency, status, paid_at
  ON public.accounts_payable FOR EACH ROW EXECUTE FUNCTION public.lock_financial_exchange_snapshot();

DROP TRIGGER IF EXISTS lock_exchange_snapshot ON public.payments;
CREATE TRIGGER lock_exchange_snapshot BEFORE INSERT OR UPDATE OF amount, currency, status, paid_at
  ON public.payments FOR EACH ROW EXECUTE FUNCTION public.lock_financial_exchange_snapshot();

DROP TRIGGER IF EXISTS lock_exchange_snapshot ON public.payroll_entries;
CREATE TRIGGER lock_exchange_snapshot BEFORE INSERT OR UPDATE OF amount, currency, status, paid_at
  ON public.payroll_entries FOR EACH ROW EXECUTE FUNCTION public.lock_financial_exchange_snapshot();
