-- PostgREST can target a full unique index with on_conflict columns. The
-- previous partial indexes could not be inferred, so conversation/message
-- upserts from Evolution were rejected even when the payload was valid.
DROP INDEX IF EXISTS public.whatsapp_conversations_account_phone_uidx;
CREATE UNIQUE INDEX whatsapp_conversations_account_phone_uidx
  ON public.whatsapp_conversations (account_id, contact_phone);

DROP INDEX IF EXISTS public.whatsapp_conversations_account_jid_uk;
CREATE UNIQUE INDEX whatsapp_conversations_account_jid_uk
  ON public.whatsapp_conversations (account_id, remote_jid);

DROP INDEX IF EXISTS public.whatsapp_messages_provider_uidx;
CREATE UNIQUE INDEX whatsapp_messages_provider_uidx
  ON public.whatsapp_messages (account_id, provider_message_id);
