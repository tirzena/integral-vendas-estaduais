-- ============ whatsapp_accounts ============
ALTER TABLE public.whatsapp_accounts
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'evolution',
  ADD COLUMN IF NOT EXISTS instance_name text,
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS connection_status text NOT NULL DEFAULT 'desconectado',
  ADD COLUMN IF NOT EXISTS phone_e164 text,
  ADD COLUMN IF NOT EXISTS owner_jid text,
  ADD COLUMN IF NOT EXISTS profile_name text,
  ADD COLUMN IF NOT EXISTS webhook_configured_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS connected_at timestamptz,
  ADD COLUMN IF NOT EXISTS disconnected_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_accounts_instance_uk
  ON public.whatsapp_accounts (instance_name) WHERE instance_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS whatsapp_accounts_product_idx ON public.whatsapp_accounts (product_id);
CREATE INDEX IF NOT EXISTS whatsapp_accounts_status_idx ON public.whatsapp_accounts (connection_status);
CREATE INDEX IF NOT EXISTS whatsapp_accounts_alive_idx ON public.whatsapp_accounts (deleted_at);

-- ============ whatsapp_conversations ============
ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS remote_jid text,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

CREATE INDEX IF NOT EXISTS whatsapp_conversations_account_idx ON public.whatsapp_conversations (account_id);
CREATE INDEX IF NOT EXISTS whatsapp_conversations_phone_idx ON public.whatsapp_conversations (contact_phone);
CREATE INDEX IF NOT EXISTS whatsapp_conversations_last_msg_idx ON public.whatsapp_conversations (last_message_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_conversations_account_jid_uk
  ON public.whatsapp_conversations (account_id, remote_jid)
  WHERE account_id IS NOT NULL AND remote_jid IS NOT NULL;

-- ============ whatsapp_messages ============
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.whatsapp_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS remote_jid text,
  ADD COLUMN IF NOT EXISTS participant_jid text,
  ADD COLUMN IF NOT EXISTS from_me boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quoted_message_id text,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS media_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS provider_timestamp timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS error text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_messages_provider_uk
  ON public.whatsapp_messages (account_id, provider_message_id)
  WHERE account_id IS NOT NULL AND provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS whatsapp_messages_conversation_idx ON public.whatsapp_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS whatsapp_messages_account_idx ON public.whatsapp_messages (account_id);
CREATE INDEX IF NOT EXISTS whatsapp_messages_status_idx ON public.whatsapp_messages (status);

DROP TRIGGER IF EXISTS trg_whatsapp_messages_updated ON public.whatsapp_messages;
CREATE TRIGGER trg_whatsapp_messages_updated BEFORE UPDATE ON public.whatsapp_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ eventos de webhook (idempotência) ============
CREATE TABLE IF NOT EXISTS public.whatsapp_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES public.whatsapp_accounts(id) ON DELETE CASCADE,
  event text NOT NULL,
  event_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_webhook_events_uk
  ON public.whatsapp_webhook_events (account_id, event, event_key);
GRANT ALL ON public.whatsapp_webhook_events TO service_role;
ALTER TABLE public.whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "whatsapp_webhook_events_admin_read" ON public.whatsapp_webhook_events
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- ============ helpers de escopo ============
CREATE OR REPLACE FUNCTION public.whatsapp_can_manage()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('superadmin','admin','gestor')
  )
$$;
REVOKE EXECUTE ON FUNCTION public.whatsapp_can_manage() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.whatsapp_can_manage() TO authenticated;

CREATE OR REPLACE FUNCTION public.whatsapp_account_visible(_account_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.whatsapp_accounts a
    WHERE a.id = _account_id
      AND a.deleted_at IS NULL
      AND (
        public.is_admin(auth.uid())
        OR (a.product_id IS NOT NULL AND public.has_product_access(auth.uid(), a.product_id))
      )
  )
$$;
REVOKE EXECUTE ON FUNCTION public.whatsapp_account_visible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.whatsapp_account_visible(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.whatsapp_conversation_visible(_conversation_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.whatsapp_conversations c
    WHERE c.id = _conversation_id
      AND (
        public.is_admin(auth.uid())
        OR (
          (c.product_id IS NULL OR public.has_product_access(auth.uid(), c.product_id))
          AND (
            public.whatsapp_can_manage()
            OR c.assignee_id IS NULL
            OR c.assignee_id = auth.uid()
          )
        )
      )
  )
$$;
REVOKE EXECUTE ON FUNCTION public.whatsapp_conversation_visible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.whatsapp_conversation_visible(uuid) TO authenticated;

-- ============ RLS: contas ============
DROP POLICY IF EXISTS whatsapp_accounts_read ON public.whatsapp_accounts;
DROP POLICY IF EXISTS whatsapp_accounts_admin_write ON public.whatsapp_accounts;

CREATE POLICY "whatsapp_accounts_scope_read" ON public.whatsapp_accounts
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      public.is_admin(auth.uid())
      OR (product_id IS NOT NULL AND public.has_product_access(auth.uid(), product_id))
    )
  );

CREATE POLICY "whatsapp_accounts_admin_manage" ON public.whatsapp_accounts
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ============ RLS: conversas ============
DROP POLICY IF EXISTS whatsapp_conversations_read ON public.whatsapp_conversations;
DROP POLICY IF EXISTS whatsapp_conversations_update ON public.whatsapp_conversations;
DROP POLICY IF EXISTS whatsapp_conversations_write ON public.whatsapp_conversations;
DROP POLICY IF EXISTS whatsapp_conversations_delete ON public.whatsapp_conversations;

CREATE POLICY "whatsapp_conversations_scope_read" ON public.whatsapp_conversations
  FOR SELECT TO authenticated
  USING (public.whatsapp_conversation_visible(id));

CREATE POLICY "whatsapp_conversations_scope_insert" ON public.whatsapp_conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin(auth.uid())
    OR (product_id IS NOT NULL AND public.has_product_access(auth.uid(), product_id))
  );

CREATE POLICY "whatsapp_conversations_scope_update" ON public.whatsapp_conversations
  FOR UPDATE TO authenticated
  USING (public.whatsapp_conversation_visible(id))
  WITH CHECK (
    public.is_admin(auth.uid())
    OR (product_id IS NULL OR public.has_product_access(auth.uid(), product_id))
  );

CREATE POLICY "whatsapp_conversations_admin_delete" ON public.whatsapp_conversations
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- ============ RLS: mensagens ============
DROP POLICY IF EXISTS whatsapp_messages_read ON public.whatsapp_messages;
DROP POLICY IF EXISTS whatsapp_messages_update ON public.whatsapp_messages;
DROP POLICY IF EXISTS whatsapp_messages_write ON public.whatsapp_messages;
DROP POLICY IF EXISTS whatsapp_messages_delete ON public.whatsapp_messages;

CREATE POLICY "whatsapp_messages_scope_read" ON public.whatsapp_messages
  FOR SELECT TO authenticated
  USING (public.whatsapp_conversation_visible(conversation_id));

-- pela tela, o usuário só grava nota interna; envio real passa pelo servidor
CREATE POLICY "whatsapp_messages_note_insert" ON public.whatsapp_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    is_internal_note = true
    AND sender_id = auth.uid()
    AND public.whatsapp_conversation_visible(conversation_id)
  );

CREATE POLICY "whatsapp_messages_scope_update" ON public.whatsapp_messages
  FOR UPDATE TO authenticated
  USING (public.whatsapp_conversation_visible(conversation_id))
  WITH CHECK (public.whatsapp_conversation_visible(conversation_id));

CREATE POLICY "whatsapp_messages_admin_delete" ON public.whatsapp_messages
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- ============ GRANTs ============
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_messages TO authenticated;
GRANT SELECT ON public.whatsapp_webhook_events TO authenticated;
GRANT ALL ON public.whatsapp_accounts TO service_role;
GRANT ALL ON public.whatsapp_conversations TO service_role;
GRANT ALL ON public.whatsapp_messages TO service_role;

-- ============ compatibilidade com registros antigos ============
UPDATE public.whatsapp_accounts
   SET provider = COALESCE(provider,'evolution'),
       display_name = COALESCE(display_name, 'Conta WhatsApp'),
       connection_status = CASE WHEN status = 'conectado' THEN 'conectado' ELSE 'desconectado' END
 WHERE display_name IS NULL OR connection_status IS NULL;

UPDATE public.whatsapp_messages m
   SET account_id = c.account_id,
       from_me = (m.direction = 'outbound')
  FROM public.whatsapp_conversations c
 WHERE m.conversation_id = c.id AND m.account_id IS NULL;