-- ============ conexões Meta (somente servidor) ============
CREATE TABLE public.meta_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_user_id text NOT NULL,
  meta_user_name text,
  access_token_encrypted text NOT NULL,
  token_expires_at timestamptz,
  scopes text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'conectado',
  last_error text,
  last_verified_at timestamptz,
  connected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.meta_connections TO service_role;
ALTER TABLE public.meta_connections ENABLE ROW LEVEL SECURITY;
-- sem policies: nenhum acesso direto de anon/authenticated
CREATE TRIGGER trg_meta_connections_updated BEFORE UPDATE ON public.meta_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ states do OAuth (somente servidor) ============
CREATE TABLE public.meta_oauth_states (
  state text PRIMARY KEY,
  user_id uuid NOT NULL,
  redirect_uri text NOT NULL,
  return_path text,
  used_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.meta_oauth_states TO service_role;
ALTER TABLE public.meta_oauth_states ENABLE ROW LEVEL SECURITY;

-- ============ contas de anúncios ============
CREATE TABLE public.meta_ad_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.meta_connections(id) ON DELETE CASCADE,
  ad_account_id text NOT NULL,
  name text,
  business_id text,
  business_name text,
  currency text,
  timezone_name text,
  account_status integer,
  is_active boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz,
  last_sync_status text,
  last_sync_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, ad_account_id)
);
GRANT SELECT ON public.meta_ad_accounts TO authenticated;
GRANT ALL ON public.meta_ad_accounts TO service_role;
ALTER TABLE public.meta_ad_accounts ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_meta_ad_accounts_updated BEFORE UPDATE ON public.meta_ad_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.meta_ad_account_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_ad_account_id uuid NOT NULL REFERENCES public.meta_ad_accounts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meta_ad_account_id, product_id)
);
GRANT SELECT ON public.meta_ad_account_products TO authenticated;
GRANT ALL ON public.meta_ad_account_products TO service_role;
ALTER TABLE public.meta_ad_account_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meta_ad_accounts_select" ON public.meta_ad_accounts
  FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.meta_ad_account_products m
      JOIN public.product_users pu ON pu.product_id = m.product_id
      WHERE m.meta_ad_account_id = meta_ad_accounts.id AND pu.user_id = auth.uid()
    )
  );

CREATE POLICY "meta_ad_account_products_select" ON public.meta_ad_account_products
  FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.product_users pu
      WHERE pu.product_id = meta_ad_account_products.product_id AND pu.user_id = auth.uid()
    )
  );

-- ============ logs de sincronização ============
CREATE TABLE public.meta_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_ad_account_id uuid REFERENCES public.meta_ad_accounts(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES public.meta_connections(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'insights',
  status text NOT NULL DEFAULT 'ok',
  rows_upserted integer NOT NULL DEFAULT 0,
  date_start date,
  date_stop date,
  message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.meta_sync_logs TO authenticated;
GRANT ALL ON public.meta_sync_logs TO service_role;
ALTER TABLE public.meta_sync_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meta_sync_logs_select_admin" ON public.meta_sync_logs
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- ============ ad_metrics: identificação inequívoca ============
ALTER TABLE public.ad_metrics
  ADD COLUMN IF NOT EXISTS meta_ad_account_id uuid REFERENCES public.meta_ad_accounts(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS level text NOT NULL DEFAULT 'account',
  ADD COLUMN IF NOT EXISTS object_id text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS object_name text,
  ADD COLUMN IF NOT EXISTS account_currency text,
  ADD COLUMN IF NOT EXISTS account_timezone text,
  ADD COLUMN IF NOT EXISTS reach bigint,
  ADD COLUMN IF NOT EXISTS frequency numeric,
  ADD COLUMN IF NOT EXISTS cpc numeric,
  ADD COLUMN IF NOT EXISTS cpm numeric,
  ADD COLUMN IF NOT EXISTS ctr numeric,
  ADD COLUMN IF NOT EXISTS results integer,
  ADD COLUMN IF NOT EXISTS result_type text,
  ADD COLUMN IF NOT EXISTS cost_per_result numeric,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS synced_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS ad_metrics_meta_unique
  ON public.ad_metrics (meta_ad_account_id, metric_date, level, object_id)
  WHERE meta_ad_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ad_metrics_meta_account_date ON public.ad_metrics (meta_ad_account_id, metric_date);

CREATE POLICY "ad_metrics_select_by_meta_account" ON public.ad_metrics
  FOR SELECT TO authenticated
  USING (
    meta_ad_account_id IS NOT NULL AND (
      public.is_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.meta_ad_account_products m
        JOIN public.product_users pu ON pu.product_id = m.product_id
        WHERE m.meta_ad_account_id = ad_metrics.meta_ad_account_id AND pu.user_id = auth.uid()
      )
    )
  );