import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  evolutionCall,
  evolutionConfig,
  mapState,
  requireEvolution,
  webhookPayload,
  webhookUrl,
} from "../_shared/evolution.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(payload: unknown, status = 200) {
  return Response.json(payload, { status, headers: cors });
}

function safeMessage(error: unknown) {
  return error instanceof Error
    ? error.message.slice(0, 220)
    : "Falha na integração com o WhatsApp.";
}

function messageRows(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  for (const candidate of [
    payload?.messages?.records,
    payload?.messages,
    payload?.records,
    payload?.data?.records,
    payload?.data,
  ]) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function chatRows(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  for (const candidate of [
    payload?.chats?.records,
    payload?.chats,
    payload?.records,
    payload?.data?.records,
    payload?.data,
  ]) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function jidPhone(jid: unknown) {
  const value = String(jid ?? "");
  if (/@(lid|g\.us|broadcast)$/i.test(value)) return null;
  const digits =
    value
      .split("@")[0]
      ?.replace(/\D/g, "") ?? "";
  return digits.length >= 8 && digits.length <= 20 ? digits : null;
}

function realContactJid(...candidates: unknown[]) {
  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (!value || /@(lid|g\.us|broadcast)$/i.test(value) || value === "status@broadcast") continue;
    if (jidPhone(value)) return value;
  }
  return null;
}

function contactName(item: any) {
  const value =
    item?.pushName ?? item?.name ?? item?.notify ?? item?.verifiedName ??
    item?.contact?.pushName ?? item?.contact?.name ?? item?.contact?.notify ?? null;
  const name = String(value ?? "").trim();
  return name || null;
}

function profilePicture(item: any) {
  const value =
    item?.profilePictureUrl ?? item?.profilePicUrl ?? item?.picture ??
    item?.contact?.profilePictureUrl ?? item?.contact?.profilePicUrl ?? null;
  const url = String(value ?? "").trim();
  return /^https?:\/\//i.test(url) ? url : null;
}

function messageText(item: any): string | null {
  const message = item?.message ?? {};
  return (
    message.conversation ??
    message.extendedTextMessage?.text ??
    message.imageMessage?.caption ??
    message.videoMessage?.caption ??
    message.documentMessage?.caption ??
    item?.text ??
    null
  );
}

function messageKind(item: any) {
  const message = item?.message ?? {};
  if (message.imageMessage) return "image";
  if (message.videoMessage) return "video";
  if (message.audioMessage) return "audio";
  if (message.documentMessage) return "document";
  if (message.stickerMessage) return "sticker";
  return "text";
}

function referralOf(item: any) {
  const message = item?.message ?? {};
  const context = message.extendedTextMessage?.contextInfo ?? message.contextInfo ?? {};
  const ad = context.externalAdReply ?? {};
  const referral = {
    title: ad.title ? String(ad.title) : null,
    body: ad.body ? String(ad.body) : null,
    sourceUrl: ad.sourceUrl ? String(ad.sourceUrl) : null,
    sourceId: ad.sourceId ? String(ad.sourceId) : null,
    thumbnailUrl: ad.thumbnailUrl ? String(ad.thumbnailUrl) : null,
    ctwaClid: context.ctwaClid ?? ad.ctwaClid ?? null,
  };
  return Object.values(referral).some(Boolean) ? referral : {};
}

function messageTime(value: unknown) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return new Date(numeric > 10_000_000_000 ? numeric : numeric * 1000).toISOString();
  }
  const parsed = new Date(String(value ?? ""));
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authorization = request.headers.get("Authorization") ?? "";
    if (!authorization.startsWith("Bearer ")) return json({ error: "Não autorizado." }, 401);

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) return json({ error: "Sessão inválida." }, 401);

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? "");
    if (action === "status") {
      return json({ ok: true, provider: "Evolution API", configured: Boolean(evolutionConfig()) });
    }

    const { data: canManage } = await supabase.rpc("whatsapp_can_manage");
    if (!canManage)
      return json({ error: "Você não tem permissão para gerenciar contas de WhatsApp." }, 403);

    const accountId = String(body.accountId ?? "");
    if (!accountId) return json({ error: "Conta inválida." }, 400);
    const { data: visible } = await supabase.rpc("whatsapp_account_visible", {
      _account_id: accountId,
    });
    if (!visible) return json({ error: "Conta de WhatsApp não encontrada no seu acesso." }, 404);
      const { data: account } = await supabase
      .from("whatsapp_accounts")
      .select("id,instance_name,product_id,created_by,deleted_at")
      .eq("id", accountId)
      .maybeSingle();
    if (!account || account.deleted_at || !account.instance_name) {
      return json({ error: "Conta de WhatsApp indisponível." }, 404);
    }

    if (action === "remove") {
      const { data: isAdmin } = await supabase.rpc("is_admin", { _user_id: auth.user.id });
      if (!isAdmin) return json({ error: "Apenas administradores podem remover contas." }, 403);
    }

    const config = requireEvolution();
    const instance = encodeURIComponent(account.instance_name);

    if (action === "sync") {
      const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const [messagesResult, chatsResult] = await Promise.all([
        evolutionCall<any>(config, `/chat/findMessages/${instance}`, {
          method: "POST",
          // Evolution 2.3.x paginates messages with page/offset. `take/skip`
          // belongs to findChats and is ignored by findMessages.
          body: { where: {}, page: 1, offset: 5000 },
        }),
        evolutionCall<any>(config, `/chat/findChats/${instance}`, {
          method: "POST",
          body: { where: {}, take: 5000, skip: 0 },
        }),
      ]);
      const chats = chatRows(chatsResult);
      const providerMessages = Number(
        messagesResult?.messages?.total ??
          messagesResult?.total ??
          messageRows(messagesResult).length,
      );
      const rows = [...messageRows(messagesResult), ...chats.filter((item) => item?.key?.id)]
        .filter(
          (item, index, all) =>
            item?.key?.id && all.findIndex((other) => other?.key?.id === item.key.id) === index,
        )
        .sort((a, b) => Number(a.messageTimestamp ?? 0) - Number(b.messageTimestamp ?? 0));

      // Algumas versões da Evolution mantêm a lista de chats mesmo quando o
      // histórico de mensagens não está persistido. Criamos essas conversas
      // primeiro para que elas apareçam na caixa de entrada.
      for (const chat of chats) {
        if (chat?.key?.id) continue;
        const primaryJid = String(chat.remoteJid ?? chat.id ?? chat.jid ?? "");
        const remoteJid = realContactJid(
          chat.remoteJidAlt,
          chat.contact?.remoteJidAlt,
          chat.contact?.id,
          chat.contact?.jid,
          primaryJid,
        );
        if (!remoteJid) continue;
        const phone = jidPhone(remoteJid);
        if (!phone) continue;
        const stamp = messageTime(chat.updatedAt ?? chat.createdAt ?? chat.conversationTimestamp);
        const name = contactName(chat);
        const picture = profilePicture(chat);
        await admin.from("whatsapp_conversations").upsert(
          {
            account_id: account.id,
            product_id: account.product_id,
            contact_phone: phone,
            ...(name ? { contact_name: name } : {}),
            ...(picture ? { profile_picture_url: picture } : {}),
            remote_jid: remoteJid,
            status: "aberta",
            unread_count: Number(chat.unreadMessages ?? chat.unreadCount ?? 0),
            last_message_at: stamp,
            last_synced_at: new Date().toISOString(),
            is_demo: false,
          },
          { onConflict: "account_id,contact_phone" },
        );
      }
      let conversations = 0;
      let messages = 0;
      const seen = new Set<string>();

      for (const item of rows) {
        const primaryJid = String(item.key.remoteJid ?? "");
        const remoteJid = realContactJid(
          item.key.remoteJidAlt,
          item.remoteJidAlt,
          item.key.participantAlt,
          item.participantAlt,
          primaryJid,
        );
        if (!remoteJid) continue;
        const phone = jidPhone(remoteJid);
        if (!phone) continue;
        const stamp = messageTime(item.messageTimestamp ?? item.createdAt ?? item.updatedAt);
        const fromMe = Boolean(item.key.fromMe);
        const referral = referralOf(item);
        const name = contactName(item);
        let customerId: string | null = null;
        if (!fromMe) {
          const { data: upserted } = await admin.rpc("whatsapp_upsert_contact", {
            _account_id: account.id,
            _phone: phone,
            _name: name ?? "",
            _product_id: account.product_id,
            _referral: referral,
            _owner_id: account.created_by,
          });
          customerId = upserted ?? null;
        }
        const { data: conversation, error: conversationError } = await admin
          .from("whatsapp_conversations")
          .upsert(
            {
              account_id: account.id,
              product_id: account.product_id,
              ...(customerId ? { customer_id: customerId } : {}),
              contact_phone: phone,
              ...(name ? { contact_name: name } : {}),
              remote_jid: remoteJid,
              status: "aberta",
              unread_count: 0,
              last_message_at: stamp,
              last_inbound_at: fromMe ? null : stamp,
              last_synced_at: new Date().toISOString(),
              is_demo: false,
              ...(Object.keys(referral).length ? { referral } : {}),
            },
            { onConflict: "account_id,contact_phone" },
          )
          .select("id")
          .single();
        if (conversationError || !conversation) continue;
        if (!seen.has(conversation.id)) {
          seen.add(conversation.id);
          conversations += 1;
        }
        const { error: messageError } = await admin.from("whatsapp_messages").upsert(
          {
            conversation_id: conversation.id,
            account_id: account.id,
            direction: fromMe ? "outbound" : "inbound",
            from_me: fromMe,
            message_type: messageKind(item),
            body: messageText(item),
            provider_message_id: String(item.key.id),
            remote_jid: remoteJid,
            participant_jid: item.key.participant ?? null,
            provider_timestamp: stamp,
            status: fromMe ? "enviada" : "entregue",
            is_internal_note: false,
            is_demo: false,
            referral,
          },
          { onConflict: "account_id,provider_message_id", ignoreDuplicates: true },
        );
        if (!messageError) messages += 1;
      }
      await admin
        .from("whatsapp_accounts")
        .update({
          last_sync_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", account.id);
      let historyRequested = false;
      if (rows.length === 0 && chats.length === 0) {
        try {
          const foundSettings = await evolutionCall<any>(config, `/settings/find/${instance}`);
          const current =
            foundSettings?.settings?.settings ?? foundSettings?.settings ?? foundSettings ?? {};
          await evolutionCall(config, `/settings/set/${instance}`, {
            method: "POST",
            body: {
              rejectCall: Boolean(current.rejectCall),
              msgCall: String(current.msgCall ?? ""),
              groupsIgnore: Boolean(current.groupsIgnore),
              alwaysOnline: Boolean(current.alwaysOnline),
              readMessages: Boolean(current.readMessages),
              readStatus: Boolean(current.readStatus),
              syncFullHistory: true,
              wavoipToken: String(current.wavoipToken ?? ""),
            },
          });
          await evolutionCall(config, `/instance/restart/${instance}`, { method: "PUT" });
          historyRequested = true;
        } catch (error) {
          console.error("whatsapp-history-request", safeMessage(error));
        }
      }
      const { count: storedConversations } = await admin
        .from("whatsapp_conversations")
        .select("id", { count: "exact", head: true })
        .eq("account_id", account.id)
        .is("deleted_at", null);
      return json({
        ok: true,
        conversations: storedConversations ?? conversations,
        messages,
        scanned: rows.length,
        chatsScanned: chats.length,
        providerMessages: Number.isFinite(providerMessages) ? providerMessages : 0,
        historyRequested,
      });
    }

    if (action === "create") {
      await evolutionCall(config, "/instance/create", {
        method: "POST",
        body: {
          instanceName: account.instance_name,
          integration: "WHATSAPP-BAILEYS",
          qrcode: true,
          syncFullHistory: true,
          webhook: webhookPayload(config),
        },
      });
      await evolutionCall(config, `/webhook/set/${instance}`, {
        method: "POST",
        body: { webhook: webhookPayload(config) },
      });
      const result = await evolutionCall<Record<string, unknown>>(
        config,
        `/instance/connect/${instance}`,
      );
      const base64 = (result.base64 ??
        (result.qrcode as Record<string, unknown> | undefined)?.base64) as string | undefined;
      return json({
        ok: true,
        qrBase64: base64
          ? base64.startsWith("data:")
            ? base64
            : `data:image/png;base64,${base64}`
          : null,
        pairingCode: result.pairingCode ?? result.code ?? null,
      });
    }

    if (action === "qr") {
      const statePayload = await evolutionCall<Record<string, unknown>>(
        config,
        `/instance/connectionState/${instance}`,
      );
      const state = String(
        (statePayload.instance as Record<string, unknown> | undefined)?.state ??
          statePayload.state ??
          "close",
      );
      if (mapState(state) === "conectado")
        return json({ ok: true, connected: true, qrBase64: null });
      const result = await evolutionCall<Record<string, unknown>>(
        config,
        `/instance/connect/${instance}`,
      );
      const base64 = (result.base64 ??
        (result.qrcode as Record<string, unknown> | undefined)?.base64) as string | undefined;
      return json({
        ok: true,
        connected: false,
        qrBase64: base64
          ? base64.startsWith("data:")
            ? base64
            : `data:image/png;base64,${base64}`
          : null,
        pairingCode: result.pairingCode ?? result.code ?? null,
      });
    }

    if (action === "check") {
      const statePayload = await evolutionCall<Record<string, unknown>>(
        config,
        `/instance/connectionState/${instance}`,
      );
      const state = String(
        (statePayload.instance as Record<string, unknown> | undefined)?.state ??
          statePayload.state ??
          "close",
      );
      let info: Record<string, unknown> | null = null;
      let hook: Record<string, unknown> | null = null;
      try {
        const found = await evolutionCall<unknown>(
          config,
          `/instance/fetchInstances?instanceName=${instance}`,
        );
        const item = Array.isArray(found) ? found[0] : found;
        info = ((item as Record<string, unknown> | null)?.instance ?? item) as Record<
          string,
          unknown
        > | null;
      } catch {
        /* informação auxiliar */
      }
      try {
        hook = await evolutionCall<Record<string, unknown>>(config, `/webhook/find/${instance}`);
      } catch {
        /* será corrigido abaixo se solicitado */
      }
      const nestedHook = hook?.webhook as Record<string, unknown> | undefined;
      const hookOk = Boolean(
        hook &&
        (hook.url ?? nestedHook?.url) === webhookUrl() &&
        (hook.enabled ?? nestedHook?.enabled),
      );
      let webhookFixed = false;
      if (!hookOk && body.fixWebhook !== false) {
        await evolutionCall(config, `/webhook/set/${instance}`, {
          method: "POST",
          body: { webhook: webhookPayload(config) },
        });
        webhookFixed = true;
      }
      return json({
        ok: true,
        status: mapState(state),
        ownerJid: info?.owner ?? info?.ownerJid ?? null,
        profileName: info?.profileName ?? null,
        webhookOk: hookOk || webhookFixed,
        webhookFixed,
      });
    }

    if (action === "disconnect") {
      try {
        await evolutionCall(config, `/instance/logout/${instance}`, { method: "DELETE" });
      } catch {
        /* já desconectada */
      }
      return json({ ok: true });
    }

    if (action === "remove") {
      try {
        await evolutionCall(config, `/instance/logout/${instance}`, { method: "DELETE" });
      } catch {
        /* segue */
      }
      try {
        await evolutionCall(config, `/instance/delete/${instance}`, { method: "DELETE" });
      } catch {
        /* já removida */
      }
      return json({ ok: true });
    }

    if (action === "send") {
      const number = String(body.number ?? "").replace(/\D/g, "");
      if (number.length < 8 || number.length > 15) return json({ error: "Número inválido." }, 400);
      const text = String(body.text ?? "");
      const media = body.media as Record<string, unknown> | undefined;
      if (media) {
        const kind = String(media.mediatype ?? "document");
        const path =
          kind === "audio"
            ? `/message/sendWhatsAppAudio/${instance}`
            : kind === "sticker"
              ? `/message/sendSticker/${instance}`
              : `/message/sendMedia/${instance}`;
        const payload =
          kind === "audio"
            ? { number, audio: media.url }
            : kind === "sticker"
              ? { number, sticker: media.url }
              : {
                  number,
                  mediatype: kind,
                  mimetype: media.mimetype,
                  media: media.url,
                  caption: text,
                  fileName: media.fileName ?? "arquivo",
                };
        const result = await evolutionCall<Record<string, unknown>>(config, path, {
          method: "POST",
          body: payload,
        });
        return json({
          ok: true,
          id: (result.key as Record<string, unknown> | undefined)?.id ?? result.messageId ?? null,
        });
      }
      let result: Record<string, unknown>;
      try {
        result = await evolutionCall<Record<string, unknown>>(config, `/message/sendText/${instance}`, {
          method: "POST",
          body: { number, text },
        });
      } catch (error) {
        if (!/bad request|payload|body|400/i.test(safeMessage(error))) throw error;
        result = await evolutionCall<Record<string, unknown>>(config, `/message/sendText/${instance}`, {
          method: "POST",
          body: { number, textMessage: { text } },
        });
      }
      return json({
        ok: true,
        id: (result.key as Record<string, unknown> | undefined)?.id ?? result.messageId ?? null,
      });
    }

    if (action === "delete") {
      const id = String(body.messageId ?? "").trim();
      const remoteJid = String(body.remoteJid ?? "").trim();
      const participant = body.participant ? String(body.participant) : undefined;
      if (!id || !remoteJid) return json({ error: "Mensagem inválida." }, 400);
      await evolutionCall(config, `/chat/deleteMessageForEveryone/${instance}`, {
        method: "DELETE",
        body: { id, remoteJid, fromMe: true, ...(participant ? { participant } : {}) },
      });
      return json({ ok: true });
    }

    if (action === "profile") {
      const number = String(body.number ?? "").replace(/\D/g, "");
      if (!number) return json({ error: "Número inválido." }, 400);
      const result = await evolutionCall<Record<string, unknown>>(
        config,
        `/chat/fetchProfilePictureUrl/${instance}`,
        {
          method: "POST",
          body: { number },
        },
      );
      return json({
        ok: true,
        url: result.profilePictureUrl ?? result.picture ?? result.url ?? null,
      });
    }

    return json({ error: "Ação inválida." }, 400);
  } catch (error) {
    console.error("whatsapp-evolution", safeMessage(error));
    return json({ error: safeMessage(error) }, 500);
  }
});
