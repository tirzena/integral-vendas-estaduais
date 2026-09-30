-- 1) Visibilidade mais restrita
CREATE OR REPLACE FUNCTION public.whatsapp_conversation_visible(_conversation_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.whatsapp_conversations c
    WHERE c.id = _conversation_id
      AND (
        public.is_admin(auth.uid())
        OR (
          c.product_id IS NOT NULL
          AND public.has_product_access(auth.uid(), c.product_id)
          AND (
            public.whatsapp_can_manage()
            OR c.assignee_id = auth.uid()
          )
        )
      )
  )
$$;

DROP POLICY IF EXISTS whatsapp_accounts_manage ON public.whatsapp_accounts;
CREATE POLICY whatsapp_accounts_manage ON public.whatsapp_accounts
  FOR ALL TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR (public.whatsapp_can_manage() AND product_id IS NOT NULL AND public.has_product_access(auth.uid(), product_id))
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    OR (public.whatsapp_can_manage() AND product_id IS NOT NULL AND public.has_product_access(auth.uid(), product_id))
  );

DROP POLICY IF EXISTS whatsapp_conversations_scope_update ON public.whatsapp_conversations;
CREATE POLICY whatsapp_conversations_scope_update ON public.whatsapp_conversations
  FOR UPDATE TO authenticated
  USING (public.whatsapp_conversation_visible(id))
  WITH CHECK (
    public.is_admin(auth.uid())
    OR (product_id IS NOT NULL AND public.has_product_access(auth.uid(), product_id))
  );

-- 2) Sem UPDATE genérico em mensagens
DROP POLICY IF EXISTS whatsapp_messages_scope_update ON public.whatsapp_messages;

-- 3) Operações validadas
CREATE OR REPLACE FUNCTION public.whatsapp_mark_read(_conversation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.whatsapp_conversation_visible(_conversation_id) THEN
    RAISE EXCEPTION 'Conversa fora do seu acesso.';
  END IF;
  UPDATE public.whatsapp_conversations SET unread_count = 0, updated_at = now()
  WHERE id = _conversation_id;
  UPDATE public.whatsapp_messages SET read_at = COALESCE(read_at, now()), updated_at = now()
  WHERE conversation_id = _conversation_id AND from_me = false AND read_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.whatsapp_assign_conversation(_conversation_id uuid, _assignee uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.is_admin(auth.uid()) OR public.whatsapp_can_manage()) THEN
    RAISE EXCEPTION 'Sem permissão para definir responsável.';
  END IF;
  IF NOT public.whatsapp_conversation_visible(_conversation_id) THEN
    RAISE EXCEPTION 'Conversa fora do seu acesso.';
  END IF;
  IF _assignee IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _assignee) THEN
    RAISE EXCEPTION 'Responsável inválido.';
  END IF;
  UPDATE public.whatsapp_conversations
  SET assignee_id = _assignee, updated_at = now()
  WHERE id = _conversation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.whatsapp_mark_read(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.whatsapp_assign_conversation(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.whatsapp_mark_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_assign_conversation(uuid, uuid) TO authenticated;

-- 4) Limite de uso persistente
CREATE TABLE IF NOT EXISTS public.whatsapp_rate_limits (
  bucket_key text NOT NULL,
  window_start timestamptz NOT NULL DEFAULT now(),
  hits integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket_key)
);
GRANT ALL ON public.whatsapp_rate_limits TO service_role;
ALTER TABLE public.whatsapp_rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY whatsapp_rate_limits_admin_read ON public.whatsapp_rate_limits
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.whatsapp_rate_hit(_key text, _max integer, _window_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_hits integer;
BEGIN
  INSERT INTO public.whatsapp_rate_limits (bucket_key, window_start, hits, updated_at)
  VALUES (_key, now(), 1, now())
  ON CONFLICT (bucket_key) DO UPDATE
    SET hits = CASE WHEN public.whatsapp_rate_limits.window_start < now() - make_interval(secs => _window_seconds)
                    THEN 1 ELSE public.whatsapp_rate_limits.hits + 1 END,
        window_start = CASE WHEN public.whatsapp_rate_limits.window_start < now() - make_interval(secs => _window_seconds)
                    THEN now() ELSE public.whatsapp_rate_limits.window_start END,
        updated_at = now()
  RETURNING hits INTO v_hits;
  RETURN v_hits <= GREATEST(_max, 1);
END;
$$;
REVOKE ALL ON FUNCTION public.whatsapp_rate_hit(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.whatsapp_rate_hit(text, integer, integer) TO authenticated, service_role;

-- 5) Idempotência separada do id do provedor
ALTER TABLE public.whatsapp_messages ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_messages_idempotency_uidx
  ON public.whatsapp_messages (conversation_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_messages_provider_uidx
  ON public.whatsapp_messages (account_id, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- 6) Conversa única por conta/telefone
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_conversations_account_phone_uidx
  ON public.whatsapp_conversations (account_id, contact_phone)
  WHERE account_id IS NOT NULL AND contact_phone IS NOT NULL;

CREATE OR REPLACE FUNCTION public.whatsapp_upsert_contact(
  _account_id uuid, _phone text, _name text, _product_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_customer uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('wa_contact:' || _phone));
  SELECT id INTO v_customer FROM public.customers
   WHERE deleted_at IS NULL
     AND (regexp_replace(COALESCE(phone,''), '\D', '', 'g') = _phone
          OR regexp_replace(COALESCE(whatsapp,''), '\D', '', 'g') = _phone)
   ORDER BY created_at LIMIT 1;
  IF v_customer IS NULL THEN
    INSERT INTO public.customers (name, phone, whatsapp, origin, status)
    VALUES (COALESCE(NULLIF(_name,''), 'Contato ' || right(_phone, 4)), _phone, _phone, 'whatsapp', 'lead')
    RETURNING id INTO v_customer;
  END IF;
  IF _product_id IS NOT NULL THEN
    INSERT INTO public.customer_products (customer_id, product_id)
    VALUES (v_customer, _product_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN v_customer;
END;
$$;
REVOKE ALL ON FUNCTION public.whatsapp_upsert_contact(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_upsert_contact(uuid, text, text, uuid) TO service_role;

-- 7) Eventos: updated_at e retenção
ALTER TABLE public.whatsapp_webhook_events
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS whatsapp_webhook_events_updated_at ON public.whatsapp_webhook_events;
CREATE TRIGGER whatsapp_webhook_events_updated_at BEFORE UPDATE ON public.whatsapp_webhook_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS whatsapp_webhook_events_created_idx
  ON public.whatsapp_webhook_events (created_at);

CREATE OR REPLACE FUNCTION public.whatsapp_purge_webhook_events(_days integer DEFAULT 30)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  DELETE FROM public.whatsapp_webhook_events
   WHERE created_at < now() - make_interval(days => GREATEST(_days, 1));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.whatsapp_purge_webhook_events(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_purge_webhook_events(integer) TO service_role;