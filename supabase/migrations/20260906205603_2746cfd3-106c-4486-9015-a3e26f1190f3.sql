-- 1. Helpers: ignoram _user_id arbitrário e usam search_path vazio
CREATE OR REPLACE FUNCTION public.campaigns_can_manage(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT _user_id IS NOT NULL
     AND _user_id = auth.uid()
     AND EXISTS (SELECT 1 FROM public.user_roles ur
                  WHERE ur.user_id = auth.uid()
                    AND ur.role IN ('superadmin','admin','gestor'))
$$;

CREATE OR REPLACE FUNCTION public.campaigns_scope(_user_id uuid, _product_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT _user_id IS NOT NULL
     AND _user_id = auth.uid()
     AND (
       public.campaigns_can_manage(auth.uid())
       OR (_product_id IS NOT NULL AND public.has_product_access(auth.uid(), _product_id))
     )
$$;

-- 2. Bloqueia mudança direta de status das campanhas
CREATE OR REPLACE FUNCTION public.campaigns_guard_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND coalesce(current_setting('app.campaign_status', true), '') <> '1' THEN
    RAISE EXCEPTION 'O status da campanha só pode ser alterado pelo fluxo de aprovação.';
  END IF;
  IF NEW.approved_by IS DISTINCT FROM OLD.approved_by
     AND coalesce(current_setting('app.campaign_status', true), '') <> '1' THEN
    RAISE EXCEPTION 'Aprovação inválida.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_campaigns_guard_status ON public.campaigns;
CREATE TRIGGER trg_campaigns_guard_status
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.campaigns_guard_status();

-- 3. Políticas: leitura sensível somente para admin/gestor
DROP POLICY IF EXISTS consents_select ON public.message_consents;
CREATE POLICY consents_select ON public.message_consents FOR SELECT TO authenticated
  USING (public.campaigns_can_manage(auth.uid()));
DROP POLICY IF EXISTS consents_insert ON public.message_consents;
CREATE POLICY consents_insert ON public.message_consents FOR INSERT TO authenticated
  WITH CHECK (public.campaigns_can_manage(auth.uid()));
DROP POLICY IF EXISTS consents_update ON public.message_consents;
CREATE POLICY consents_update ON public.message_consents FOR UPDATE TO authenticated
  USING (public.campaigns_can_manage(auth.uid()))
  WITH CHECK (public.campaigns_can_manage(auth.uid()));

DROP POLICY IF EXISTS suppression_select ON public.message_suppression;
CREATE POLICY suppression_select ON public.message_suppression FOR SELECT TO authenticated
  USING (public.campaigns_can_manage(auth.uid()));

DROP POLICY IF EXISTS recipients_all ON public.campaign_recipients;
CREATE POLICY recipients_manage ON public.campaign_recipients FOR ALL TO authenticated
  USING (public.campaigns_can_manage(auth.uid()))
  WITH CHECK (public.campaigns_can_manage(auth.uid()));

DROP POLICY IF EXISTS jobs_select ON public.message_jobs;
CREATE POLICY jobs_select ON public.message_jobs FOR SELECT TO authenticated
  USING (public.campaigns_can_manage(auth.uid()));

DROP POLICY IF EXISTS attempts_select ON public.message_attempts;
CREATE POLICY attempts_select ON public.message_attempts FOR SELECT TO authenticated
  USING (public.campaigns_can_manage(auth.uid()));
DROP POLICY IF EXISTS attempts_insert ON public.message_attempts;

-- campanhas: escrita precisa de WITH CHECK
DROP POLICY IF EXISTS campaigns_update ON public.campaigns;
CREATE POLICY campaigns_update ON public.campaigns FOR UPDATE TO authenticated
  USING (public.campaigns_scope(auth.uid(), product_id))
  WITH CHECK (public.campaigns_scope(auth.uid(), product_id));

-- contadores de documentos não precisam ser lidos pelo aplicativo
DROP POLICY IF EXISTS counters_select_auth ON public.document_counters;
REVOKE SELECT ON public.document_counters FROM authenticated;

-- 4. Colunas aditivas
ALTER TABLE public.message_consents
  ADD COLUMN IF NOT EXISTS legal_basis text,
  ADD COLUMN IF NOT EXISTS evidence text;

ALTER TABLE public.message_jobs
  ADD COLUMN IF NOT EXISTS lease_until timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by text,
  ADD COLUMN IF NOT EXISTS step_no integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS template_name text,
  ADD COLUMN IF NOT EXISTS template_lang text,
  ADD COLUMN IF NOT EXISTS template_vars jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS media_mime text,
  ADD COLUMN IF NOT EXISTS media_path text;

CREATE UNIQUE INDEX IF NOT EXISTS message_jobs_idempotency_uq
  ON public.message_jobs (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS message_jobs_queue_idx
  ON public.message_jobs (status, scheduled_for);

-- 5. Eventos de webhook idempotentes
CREATE TABLE IF NOT EXISTS public.message_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.message_webhook_events TO service_role;
ALTER TABLE public.message_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY webhook_events_admin ON public.message_webhook_events FOR SELECT TO authenticated
  USING (public.campaigns_can_manage(auth.uid()));
CREATE UNIQUE INDEX IF NOT EXISTS message_webhook_events_uq
  ON public.message_webhook_events (provider, event_id);