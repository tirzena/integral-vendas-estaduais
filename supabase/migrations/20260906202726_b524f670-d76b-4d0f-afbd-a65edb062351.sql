-- 0. gênero opcional no cadastro de clientes
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS gender text;

-- helper de permissão
CREATE OR REPLACE FUNCTION public.campaigns_can_manage(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('superadmin','admin','gestor'))
$$;
REVOKE EXECUTE ON FUNCTION public.campaigns_can_manage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.campaigns_can_manage(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.campaigns_scope(_user_id uuid, _product_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.campaigns_can_manage(_user_id)
      OR _product_id IS NULL
      OR public.has_product_access(_user_id, _product_id)
$$;
REVOKE EXECUTE ON FUNCTION public.campaigns_scope(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.campaigns_scope(uuid, uuid) TO authenticated;

-- 1. consentimentos por canal
CREATE TABLE IF NOT EXISTS public.message_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('whatsapp','email','sms')),
  status text NOT NULL DEFAULT 'opt_in' CHECK (status IN ('opt_in','opt_out')),
  source text,
  consented_at timestamptz,
  revoked_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, channel)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_consents TO authenticated;
GRANT ALL ON public.message_consents TO service_role;
ALTER TABLE public.message_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "consents_select" ON public.message_consents FOR SELECT TO authenticated USING (true);
CREATE POLICY "consents_insert" ON public.message_consents FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "consents_update" ON public.message_consents FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "consents_delete" ON public.message_consents FOR DELETE TO authenticated USING (public.campaigns_can_manage(auth.uid()));
CREATE TRIGGER trg_message_consents_updated BEFORE UPDATE ON public.message_consents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. supressão
CREATE TABLE IF NOT EXISTS public.message_suppression (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL CHECK (channel IN ('whatsapp','email','sms')),
  address text NOT NULL,
  reason text,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel, address)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_suppression TO authenticated;
GRANT ALL ON public.message_suppression TO service_role;
ALTER TABLE public.message_suppression ENABLE ROW LEVEL SECURITY;
CREATE POLICY "suppression_select" ON public.message_suppression FOR SELECT TO authenticated USING (true);
CREATE POLICY "suppression_write" ON public.message_suppression FOR INSERT TO authenticated WITH CHECK (public.campaigns_can_manage(auth.uid()));
CREATE POLICY "suppression_update" ON public.message_suppression FOR UPDATE TO authenticated USING (public.campaigns_can_manage(auth.uid()));
CREATE POLICY "suppression_delete" ON public.message_suppression FOR DELETE TO authenticated USING (public.campaigns_can_manage(auth.uid()));

-- 3. públicos salvos
CREATE TABLE IF NOT EXISTS public.campaign_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_segments TO authenticated;
GRANT ALL ON public.campaign_segments TO service_role;
ALTER TABLE public.campaign_segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "segments_select" ON public.campaign_segments FOR SELECT TO authenticated USING (public.campaigns_scope(auth.uid(), product_id));
CREATE POLICY "segments_insert" ON public.campaign_segments FOR INSERT TO authenticated WITH CHECK (public.campaigns_scope(auth.uid(), product_id));
CREATE POLICY "segments_update" ON public.campaign_segments FOR UPDATE TO authenticated USING (public.campaigns_scope(auth.uid(), product_id));
CREATE POLICY "segments_delete" ON public.campaign_segments FOR DELETE TO authenticated USING (public.campaigns_can_manage(auth.uid()));
CREATE TRIGGER trg_campaign_segments_updated BEFORE UPDATE ON public.campaign_segments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. modelos
CREATE TABLE IF NOT EXISTS public.campaign_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('whatsapp','email','sms')),
  occasion text NOT NULL DEFAULT 'personalizada',
  subject text,
  body text NOT NULL DEFAULT '',
  media_url text,
  link text,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  whatsapp_template_name text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_templates TO authenticated;
GRANT ALL ON public.campaign_templates TO service_role;
ALTER TABLE public.campaign_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "templates_select" ON public.campaign_templates FOR SELECT TO authenticated USING (public.campaigns_scope(auth.uid(), product_id));
CREATE POLICY "templates_insert" ON public.campaign_templates FOR INSERT TO authenticated WITH CHECK (public.campaigns_scope(auth.uid(), product_id));
CREATE POLICY "templates_update" ON public.campaign_templates FOR UPDATE TO authenticated USING (public.campaigns_scope(auth.uid(), product_id));
CREATE POLICY "templates_delete" ON public.campaign_templates FOR DELETE TO authenticated USING (public.campaigns_can_manage(auth.uid()));
CREATE TRIGGER trg_campaign_templates_updated BEFORE UPDATE ON public.campaign_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. campanhas
CREATE TABLE IF NOT EXISTS public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  objective text,
  channels text[] NOT NULL DEFAULT ARRAY['whatsapp']::text[],
  fallback_channel text CHECK (fallback_channel IN ('whatsapp','email','sms')),
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  segment_id uuid REFERENCES public.campaign_segments(id) ON DELETE SET NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  sender text,
  subject text,
  body text NOT NULL DEFAULT '',
  link text,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  occasion text NOT NULL DEFAULT 'pontual',
  recurring boolean NOT NULL DEFAULT false,
  scheduled_at timestamptz,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  quiet_start time NOT NULL DEFAULT '21:00',
  quiet_end time NOT NULL DEFAULT '08:00',
  status text NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho','aguardando_aprovacao','agendada','executando','pausada','concluida','cancelada')),
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  cancel_reason text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON public.campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_product ON public.campaigns(product_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;
GRANT ALL ON public.campaigns TO service_role;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaigns_select" ON public.campaigns FOR SELECT TO authenticated USING (public.campaigns_scope(auth.uid(), product_id));
CREATE POLICY "campaigns_insert" ON public.campaigns FOR INSERT TO authenticated WITH CHECK (public.campaigns_scope(auth.uid(), product_id));
CREATE POLICY "campaigns_update" ON public.campaigns FOR UPDATE TO authenticated USING (public.campaigns_scope(auth.uid(), product_id));
CREATE POLICY "campaigns_delete" ON public.campaigns FOR DELETE TO authenticated USING (public.campaigns_can_manage(auth.uid()));
CREATE TRIGGER trg_campaigns_updated BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. fluxos e etapas
CREATE TABLE IF NOT EXISTS public.campaign_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Fluxo principal',
  trigger_type text NOT NULL DEFAULT 'pontual'
    CHECK (trigger_type IN ('pontual','aniversario','data_fixa','recorrente')),
  trigger_date date,
  recurrence text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_workflows TO authenticated;
GRANT ALL ON public.campaign_workflows TO service_role;
ALTER TABLE public.campaign_workflows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workflows_all" ON public.campaign_workflows FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND public.campaigns_scope(auth.uid(), c.product_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND public.campaigns_scope(auth.uid(), c.product_id)));
CREATE TRIGGER trg_campaign_workflows_updated BEFORE UPDATE ON public.campaign_workflows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.campaign_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.campaign_workflows(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 1,
  channel text NOT NULL CHECK (channel IN ('whatsapp','email','sms')),
  fallback_channel text CHECK (fallback_channel IN ('whatsapp','email','sms')),
  template_id uuid REFERENCES public.campaign_templates(id) ON DELETE SET NULL,
  subject text,
  body text,
  wait_minutes integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_campaign_steps_workflow ON public.campaign_steps(workflow_id, position);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_steps TO authenticated;
GRANT ALL ON public.campaign_steps TO service_role;
ALTER TABLE public.campaign_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "steps_all" ON public.campaign_steps FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.campaign_workflows w JOIN public.campaigns c ON c.id = w.campaign_id
                 WHERE w.id = workflow_id AND public.campaigns_scope(auth.uid(), c.product_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.campaign_workflows w JOIN public.campaigns c ON c.id = w.campaign_id
                 WHERE w.id = workflow_id AND public.campaigns_scope(auth.uid(), c.product_id)));

-- 7. destinatários
CREATE TABLE IF NOT EXISTS public.campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  name text,
  phone text,
  email text,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','elegivel','bloqueado','enviado','falhou')),
  blocked_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, customer_id)
);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign ON public.campaign_recipients(campaign_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_recipients TO authenticated;
GRANT ALL ON public.campaign_recipients TO service_role;
ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recipients_all" ON public.campaign_recipients FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND public.campaigns_scope(auth.uid(), c.product_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND public.campaigns_scope(auth.uid(), c.product_id)));

-- 8. fila de envios e tentativas
CREATE TABLE IF NOT EXISTS public.message_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES public.campaign_recipients(id) ON DELETE CASCADE,
  step_id uuid REFERENCES public.campaign_steps(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('whatsapp','email','sms')),
  to_address text NOT NULL,
  subject text,
  body text NOT NULL DEFAULT '',
  media_url text,
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'na_fila'
    CHECK (status IN ('na_fila','processando','enviado','entregue','lido','respondido','falhou','cancelado','bloqueado')),
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  provider text,
  provider_message_id text,
  error text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  replied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_message_jobs_campaign ON public.message_jobs(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_message_jobs_queue ON public.message_jobs(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_message_jobs_provider_msg ON public.message_jobs(provider_message_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_jobs TO authenticated;
GRANT ALL ON public.message_jobs TO service_role;
ALTER TABLE public.message_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jobs_select" ON public.message_jobs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND public.campaigns_scope(auth.uid(), c.product_id)));
CREATE POLICY "jobs_write" ON public.message_jobs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND public.campaigns_can_manage(auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND public.campaigns_can_manage(auth.uid())));
CREATE TRIGGER trg_message_jobs_updated BEFORE UPDATE ON public.message_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.message_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.message_jobs(id) ON DELETE CASCADE,
  attempt_no integer NOT NULL DEFAULT 1,
  status text NOT NULL,
  error text,
  provider_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_message_attempts_job ON public.message_attempts(job_id);
GRANT SELECT, INSERT ON public.message_attempts TO authenticated;
GRANT ALL ON public.message_attempts TO service_role;
ALTER TABLE public.message_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attempts_select" ON public.message_attempts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.message_jobs j JOIN public.campaigns c ON c.id = j.campaign_id
                 WHERE j.id = job_id AND public.campaigns_scope(auth.uid(), c.product_id)));
CREATE POLICY "attempts_insert" ON public.message_attempts FOR INSERT TO authenticated
  WITH CHECK (public.campaigns_can_manage(auth.uid()));