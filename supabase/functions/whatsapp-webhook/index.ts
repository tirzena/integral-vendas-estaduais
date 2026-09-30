import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { evolutionCall, evolutionConfig } from "../_shared/evolution.ts";

// Full-history batches from Evolution can be several megabytes.
const MAX_BODY = 10_000_000;

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

function normalizePhone(input?: string | null) {
  if (!input) return null;
  let digits = String(input).replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

function jidToPhone(jid?: string | null) {
  if (/@(lid|g\.us|broadcast)$/i.test(String(jid ?? ""))) return null;
  const raw =
    String(jid ?? "")
      .split("@")[0]
      ?.split(":")[0] ?? "";
  return normalizePhone(raw);
}

function realContactJid(...candidates: unknown[]) {
  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (!value || /@(lid|g\.us|broadcast)$/i.test(value) || value === "status@broadcast") continue;
    if (jidToPhone(value)) return value;
  }
  return null;
}

function contactName(item: Record<string, any>) {
  const value =
    item?.pushName ?? item?.name ?? item?.notify ?? item?.verifiedName ??
    item?.contact?.pushName ?? item?.contact?.name ?? item?.contact?.notify ?? null;
  const name = String(value ?? "").trim();
  return name || null;
}

function textOf(item: Record<string, any>) {
  const message = item?.message ?? {};
  return (
    message.conversation ??
    message.extendedTextMessage?.text ??
    message.imageMessage?.caption ??
    message.videoMessage?.caption ??
    message.documentMessage?.caption ??
    message.buttonsResponseMessage?.selectedDisplayText ??
    message.listResponseMessage?.title ??
    null
  );
}

function typeOf(item: Record<string, any>) {
  const message = item?.message ?? {};
  if (message.imageMessage)
    return {
      type: "image",
      mime: message.imageMessage.mimetype ?? null,
      meta: { size: message.imageMessage.fileLength ?? null },
    };
  if (message.videoMessage)
    return {
      type: "video",
      mime: message.videoMessage.mimetype ?? null,
      meta: { size: message.videoMessage.fileLength ?? null },
    };
  if (message.audioMessage)
    return {
      type: "audio",
      mime: message.audioMessage.mimetype ?? null,
      meta: { seconds: message.audioMessage.seconds ?? null },
    };
  if (message.documentMessage)
    return {
      type: "document",
      mime: message.documentMessage.mimetype ?? null,
      meta: {
        fileName: message.documentMessage.fileName ?? null,
        size: message.documentMessage.fileLength ?? null,
      },
    };
  if (message.stickerMessage)
    return { type: "sticker", mime: message.stickerMessage.mimetype ?? null, meta: {} };
  if (message.locationMessage) return { type: "location", mime: null, meta: {} };
  return { type: "text", mime: null, meta: {} };
}

function referralOf(item: Record<string, any>) {
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

function messageStatus(raw?: string | null) {
  const value = String(raw ?? "").toUpperCase();
  if (value === "DELIVERY_ACK" || value === "DELIVERED") return "entregue";
  if (value === "READ" || value === "PLAYED") return "lida";
  if (value === "SERVER_ACK" || value === "SENT") return "enviada";
  if (value === "ERROR" || value === "FAILED") return "falhou";
  return null;
}

async function storeMedia(
  admin: any,
  instance: string,
  item: Record<string, any>,
  providerId: string,
  mime: string | null,
) {
  try {
    const result = await evolutionCall<any>(
      evolutionConfig(),
      `/chat/getBase64FromMediaMessage/${instance}`,
      {
        method: "POST",
        body: { message: item, convertToMp4: false },
      },
    );
    const raw = String(result.base64 ?? result.data ?? "");
    const base64 = raw.includes(",") ? raw.split(",").pop()! : raw;
    if (!base64 || base64.length > 22_000_000) return null;
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const extension =
      (mime ?? result.mimetype ?? "application/octet-stream")
        .split("/")[1]
        ?.split(";")[0]
        ?.replace(/[^a-z0-9]/gi, "") || "bin";
    const path = `whatsapp/${instance}/${providerId}.${extension}`;
    const { error } = await admin.storage.from("chat-anexos").upload(path, bytes, {
      contentType: mime ?? result.mimetype ?? "application/octet-stream",
      upsert: true,
    });
    return error ? null : path;
  } catch {
    return null;
  }
}

function connectionStatus(raw?: string | null) {
  const value = String(raw ?? "").toLowerCase();
  if (value === "open" || value === "connected") return "conectado";
  if (value === "connecting") return "conectando";
  return "desconectado";
}

function messageItems(data: any): Record<string, any>[] {
  if (Array.isArray(data)) return data;
  for (const candidate of [data?.messages?.records, data?.messages, data?.records]) {
    if (Array.isArray(candidate)) return candidate;
  }
  return data?.key?.id ? [data] : [];
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Método não permitido", { status: 405 });

  const expectedSecret = Deno.env.get("EVOLUTION_WEBHOOK_SECRET");
  if (!expectedSecret) return new Response("Configuração pendente", { status: 503 });
  const providedSecret = request.headers.get("x-webhook-secret") ?? "";
  if (!providedSecret || !safeEqual(providedSecret, expectedSecret)) {
    return new Response("Não autorizado", { status: 401 });
  }

  const raw = await request.text();
  if (!raw || raw.length > MAX_BODY) return new Response("Corpo inválido", { status: 413 });
  let body: Record<string, any>;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("JSON inválido", { status: 400 });
  }

  const instance = String(body.instance ?? body.instanceName ?? "").trim();
  const event = String(body.event ?? "")
    .toUpperCase()
    .replace(/\./g, "_");
  if (!instance || !event) return new Response("ok");

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data: account } = await admin
    .from("whatsapp_accounts")
    .select("id,product_id,instance_name,created_by,deleted_at")
    .eq("instance_name", instance)
    .maybeSingle();
  if (!account || account.deleted_at)
    return new Response("Instância não reconhecida", { status: 404 });

  const now = new Date().toISOString();
  if (Math.random() < 0.02) await admin.rpc("whatsapp_purge_webhook_events", { _days: 30 });

  async function once(key: string) {
    const { error } = await admin.from("whatsapp_webhook_events").insert({
      account_id: account.id,
      event,
      event_key: key.slice(0, 200),
    });
    return !error;
  }

  if (event === "CONNECTION_UPDATE") {
    const status = connectionStatus(body?.data?.state ?? body?.data?.connection);
    const ownerJid = body?.data?.wuid ?? body?.sender ?? null;
    const phone = jidToPhone(ownerJid);
    await admin
      .from("whatsapp_accounts")
      .update({
        connection_status: status,
        status: status === "conectado" ? "conectado" : "pendente",
        last_seen_at: now,
        ...(ownerJid ? { owner_jid: ownerJid } : {}),
        ...(phone ? { phone_e164: phone, display_phone_number: phone } : {}),
        ...(status === "conectado" ? { connected_at: now, last_error: null } : {}),
        ...(status === "desconectado" ? { disconnected_at: now } : {}),
      })
      .eq("id", account.id);
    return new Response("ok");
  }

  if (event === "QRCODE_UPDATED") {
    await admin
      .from("whatsapp_accounts")
      .update({ connection_status: "aguardando_qr", last_seen_at: now })
      .eq("id", account.id);
    return new Response("ok");
  }

  if (event === "MESSAGES_SET" || event === "MESSAGES_UPSERT" || event === "SEND_MESSAGE") {
    const items = messageItems(body.data);
    for (const item of items) {
      if (!item?.key?.id) continue;
      const providerId = String(item.key.id);
      if (!(await once(providerId))) continue;
      const primaryJid = String(item.key.remoteJid ?? "");
      const remoteJid = realContactJid(
        item.key.remoteJidAlt,
        item.remoteJidAlt,
        item.key.participantAlt,
        item.participantAlt,
        primaryJid,
      );
      if (!remoteJid) continue;
      const fromMe = Boolean(item.key.fromMe);
      const phone = jidToPhone(remoteJid);
      if (!phone) continue;
      const name = contactName(item);
      const info = typeOf(item);
      const text = textOf(item);
      const referral = referralOf(item);
      const stamp = item.messageTimestamp
        ? new Date(Number(item.messageTimestamp) * 1000).toISOString()
        : now;
      const mediaPath =
        info.type === "text" || info.type === "location"
          ? null
          : await storeMedia(admin, instance, item, providerId, info.mime);

      let { data: conversation } = await admin
        .from("whatsapp_conversations")
        .select("id,customer_id,unread_count,assignee_id,profile_picture_url")
        .eq("account_id", account.id)
        .eq("contact_phone", phone)
        .maybeSingle();
      let customerId = conversation?.customer_id ?? null;
      if (!fromMe && !customerId) {
        const { data: upserted } = await admin.rpc("whatsapp_upsert_contact", {
          _account_id: account.id,
          _phone: phone,
          _name: name ?? "",
          _product_id: account.product_id,
          _referral: referral,
          _owner_id: conversation?.assignee_id ?? account.created_by,
        });
        customerId = upserted ?? null;
      }

      if (!conversation) {
        const { data: created } = await admin
          .from("whatsapp_conversations")
          .upsert(
            {
              account_id: account.id,
              product_id: account.product_id,
              customer_id: customerId,
              contact_phone: phone,
              ...(name ? { contact_name: name } : {}),
              remote_jid: remoteJid,
              status: "aberta",
              unread_count: fromMe ? 0 : 1,
              last_message_at: stamp,
              last_inbound_at: fromMe ? null : stamp,
              last_synced_at: now,
              referral,
              is_demo: false,
            },
            { onConflict: "account_id,contact_phone" },
          )
          .select("id,customer_id,unread_count,assignee_id,profile_picture_url")
          .single();
        conversation = created;
      } else {
        await admin
          .from("whatsapp_conversations")
          .update({
            last_message_at: stamp,
            ...(fromMe
              ? {}
              : { last_inbound_at: stamp, unread_count: (conversation.unread_count ?? 0) + 1 }),
            ...(customerId && !conversation.customer_id ? { customer_id: customerId } : {}),
            ...(name ? { contact_name: name } : {}),
            remote_jid: remoteJid,
            last_synced_at: now,
            ...(Object.keys(referral).length ? { referral } : {}),
          })
          .eq("id", conversation.id);
      }
      if (!conversation) continue;
      if (!conversation.profile_picture_url) {
        try {
          const picture = await evolutionCall<Record<string, unknown>>(
            evolutionConfig(),
            `/chat/fetchProfilePictureUrl/${encodeURIComponent(instance)}`,
            { method: "POST", body: { number: phone } },
          );
          const pictureUrl = String(
            picture.profilePictureUrl ?? picture.picture ?? picture.url ?? "",
          ).trim();
          if (/^https?:\/\//i.test(pictureUrl)) {
            await admin
              .from("whatsapp_conversations")
              .update({ profile_picture_url: pictureUrl })
              .eq("id", conversation.id);
          }
        } catch {
          // A foto é opcional; o recebimento da mensagem não pode falhar por isso.
        }
      }
      await admin.from("whatsapp_messages").insert({
        conversation_id: conversation.id,
        account_id: account.id,
        direction: fromMe ? "outbound" : "inbound",
        from_me: fromMe,
        message_type: info.type,
        body: text,
        mime_type: info.mime,
        media_url: mediaPath,
        media_meta: info.meta,
        provider_message_id: providerId,
        remote_jid: remoteJid,
        participant_jid: item.key.participant ?? null,
        quoted_message_id: item?.message?.extendedTextMessage?.contextInfo?.stanzaId ?? null,
        provider_timestamp: stamp,
        status: fromMe ? "enviada" : "entregue",
        is_internal_note: false,
        is_demo: false,
        referral,
      });
    }
    return new Response("ok");
  }

  if (event === "MESSAGES_UPDATE") {
    const items = Array.isArray(body.data) ? body.data : [body.data];
    for (const item of items) {
      const providerId = item?.keyId ?? item?.key?.id;
      const status = messageStatus(item?.status);
      if (!providerId || !status || !(await once(`${providerId}:${status}`))) continue;
      await admin
        .from("whatsapp_messages")
        .update({
          status,
          ...(status === "entregue" ? { delivered_at: now } : {}),
          ...(status === "lida" ? { read_at: now } : {}),
          ...(status === "falhou"
            ? { failed_at: now, error: "O WhatsApp recusou a entrega." }
            : {}),
        })
        .eq("account_id", account.id)
        .eq("provider_message_id", String(providerId));
    }
    return new Response("ok");
  }

  if (event === "MESSAGES_DELETE") {
    const items = Array.isArray(body.data) ? body.data : [body.data];
    for (const item of items) {
      const providerId = item?.keyId ?? item?.key?.id;
      if (!providerId || !(await once(`del:${providerId}`))) continue;
      await admin
        .from("whatsapp_messages")
        .update({ status: "apagada", body: null })
        .eq("account_id", account.id)
        .eq("provider_message_id", String(providerId));
    }
  }
  return new Response("ok");
});
