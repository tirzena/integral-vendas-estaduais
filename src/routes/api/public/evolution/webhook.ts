/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Recebe os eventos reais da Evolution API. Só aceita chamadas com o segredo
 * combinado no cabeçalho, ignora eventos repetidos e nunca confia em papéis,
 * categorias ou identificadores vindos de fora.
 */
import { createFileRoute } from "@tanstack/react-router";
import { jidToPhone, normalizePhone } from "@/lib/whatsapp";

const MAX_BODY = 1_000_000; // 1 MB

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function realContactJid(...candidates: unknown[]) {
  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (!value || /@(lid|g\.us|broadcast)$/i.test(value) || value === "status@broadcast") continue;
    if (jidToPhone(value)) return value;
  }
  return null;
}

function contactName(item: any) {
  const value = item?.pushName ?? item?.name ?? item?.notify ?? item?.verifiedName ?? item?.contact?.name;
  const name = String(value ?? "").trim();
  return name || null;
}

function textOf(msg: any): string | null {
  const m = msg?.message ?? {};
  return (
    m.conversation ??
    m.extendedTextMessage?.text ??
    m.imageMessage?.caption ??
    m.videoMessage?.caption ??
    m.documentMessage?.caption ??
    m.buttonsResponseMessage?.selectedDisplayText ??
    m.listResponseMessage?.title ??
    null
  );
}

function typeOf(msg: any): { type: string; mime: string | null; meta: any } {
  const m = msg?.message ?? {};
  if (m.imageMessage) return { type: "image", mime: m.imageMessage.mimetype ?? null, meta: { size: m.imageMessage.fileLength ?? null } };
  if (m.videoMessage) return { type: "video", mime: m.videoMessage.mimetype ?? null, meta: { size: m.videoMessage.fileLength ?? null } };
  if (m.audioMessage) return { type: "audio", mime: m.audioMessage.mimetype ?? null, meta: { seconds: m.audioMessage.seconds ?? null } };
  if (m.documentMessage)
    return {
      type: "document",
      mime: m.documentMessage.mimetype ?? null,
      meta: { fileName: m.documentMessage.fileName ?? null, size: m.documentMessage.fileLength ?? null },
    };
  if (m.stickerMessage) return { type: "sticker", mime: m.stickerMessage.mimetype ?? null, meta: {} };
  if (m.locationMessage) return { type: "location", mime: null, meta: {} };
  return { type: "text", mime: null, meta: {} };
}

function statusOf(raw?: string | null) {
  const s = String(raw ?? "").toUpperCase();
  if (s === "DELIVERY_ACK" || s === "DELIVERED") return "entregue";
  if (s === "READ" || s === "PLAYED") return "lida";
  if (s === "SERVER_ACK" || s === "SENT") return "enviada";
  if (s === "ERROR" || s === "FAILED") return "falhou";
  return null;
}

function stateToStatus(state?: string | null) {
  const s = String(state ?? "").toLowerCase();
  if (s === "open") return "conectado";
  if (s === "connecting") return "conectando";
  return "desconectado";
}

export const Route = createFileRoute("/api/public/evolution/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["EVOLUTION_WEBHOOK_SECRET"];
        if (!secret) return new Response("Configuração pendente", { status: 503 });

        const provided = request.headers.get("x-webhook-secret") ?? "";
        if (!provided || !safeEqual(provided, secret)) {
          return new Response("Não autorizado", { status: 401 });
        }

        const raw = await request.text();
        if (!raw || raw.length > MAX_BODY) return new Response("Corpo inválido", { status: 413 });
        let body: any;
        try {
          body = JSON.parse(raw);
        } catch {
          return new Response("JSON inválido", { status: 400 });
        }

        const instance = String(body?.instance ?? body?.instanceName ?? "").trim();
        const event = String(body?.event ?? "").toUpperCase().replace(/\./g, "_");
        if (!instance || !event) return new Response("ok");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: account } = await supabaseAdmin
          .from("whatsapp_accounts")
          .select("id,product_id,instance_name,created_by,deleted_at")
          .eq("instance_name", instance)
          .maybeSingle();
        if (!account || account.deleted_at) {
          return new Response("Instância não reconhecida", { status: 404 });
        }

        const now = new Date().toISOString();

        // limpeza leve do histórico de eventos recebidos (retenção de 30 dias)
        if (Math.random() < 0.02) {
          await supabaseAdmin.rpc("whatsapp_purge_webhook_events", { _days: 30 });
        }

        /** Evento repetido é descartado sem gravar nada duas vezes. */
        async function once(key: string) {
          const { error } = await supabaseAdmin
            .from("whatsapp_webhook_events")
            .insert({ account_id: account!.id, event, event_key: key.slice(0, 200) });
          return !error;
        }

        if (event === "CONNECTION_UPDATE") {
          const state = body?.data?.state ?? body?.data?.connection ?? null;
          const status = stateToStatus(state);
          const ownerJid = body?.data?.wuid ?? body?.sender ?? null;
          const phone = jidToPhone(ownerJid);
          await supabaseAdmin
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
          await supabaseAdmin
            .from("whatsapp_accounts")
            .update({ connection_status: "aguardando_qr", last_seen_at: now })
            .eq("id", account.id);
          return new Response("ok");
        }

        if (event === "MESSAGES_UPSERT" || event === "SEND_MESSAGE") {
          const items = Array.isArray(body?.data) ? body.data : [body?.data];
          for (const item of items) {
            if (!item?.key?.id) continue;
            const providerId = String(item.key.id);
            if (!(await once(providerId))) continue;

            const remoteJid = realContactJid(
              item.key.remoteJidAlt,
              item.remoteJidAlt,
              item.key.participantAlt,
              item.participantAlt,
              item.key.remoteJid,
            );
            if (!remoteJid) continue;
            const fromMe = Boolean(item.key.fromMe);
            const phone = jidToPhone(remoteJid);
            if (!phone) continue;
            const name = contactName(item);
            const info = typeOf(item);
            const text = textOf(item);
            const stamp = item.messageTimestamp
              ? new Date(Number(item.messageTimestamp) * 1000).toISOString()
              : now;

            // conversa da conta (uma por contato)
            let { data: conversation } = await supabaseAdmin
              .from("whatsapp_conversations")
              .select("id,customer_id,unread_count,assignee_id")
              .eq("account_id", account.id)
              .eq("contact_phone", phone)
              .maybeSingle();

            let customerId: string | null = conversation?.customer_id ?? null;
            if (!fromMe && !customerId) {
              // operação única no banco: evita cliente duplicado com mensagens simultâneas
              const { data: upserted } = await (supabaseAdmin as any).rpc("whatsapp_upsert_contact", {
                _account_id: account.id,
                _phone: phone,
                _name: name ?? "",
                _product_id: account.product_id as string,
                _owner_id: conversation?.assignee_id ?? account.created_by,
              });
              customerId = (upserted as string | null) ?? null;
            }

            if (!conversation) {
              const { data: created } = await supabaseAdmin
                .from("whatsapp_conversations")
                .upsert({
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
                  is_demo: false,
                }, { onConflict: "account_id,contact_phone" })
                .select("id,customer_id,unread_count,assignee_id")
                .single();
              conversation = created as any;
            } else {
              await supabaseAdmin
                .from("whatsapp_conversations")
                .update({
                  last_message_at: stamp,
                  ...(fromMe ? {} : { last_inbound_at: stamp, unread_count: (conversation.unread_count ?? 0) + 1 }),
                  ...(customerId && !conversation.customer_id ? { customer_id: customerId } : {}),
                  ...(name ? { contact_name: name } : {}),
                  remote_jid: remoteJid,
                  last_synced_at: now,
                })
                .eq("id", conversation.id);
            }
            if (!conversation) continue;

            await supabaseAdmin.from("whatsapp_messages").insert({
              conversation_id: conversation.id,
              account_id: account.id,
              direction: fromMe ? "outbound" : "inbound",
              from_me: fromMe,
              message_type: info.type,
              body: text,
              mime_type: info.mime,
              media_meta: info.meta ?? {},
              provider_message_id: providerId,
              remote_jid: remoteJid,
              participant_jid: item.key.participant ?? null,
              quoted_message_id:
                item?.message?.extendedTextMessage?.contextInfo?.stanzaId ?? null,
              provider_timestamp: stamp,
              status: fromMe ? "enviada" : "entregue",
              is_internal_note: false,
              is_demo: false,
            });
          }
          return new Response("ok");
        }

        if (event === "MESSAGES_UPDATE") {
          const items = Array.isArray(body?.data) ? body.data : [body?.data];
          for (const item of items) {
            const providerId = item?.keyId ?? item?.key?.id;
            const status = statusOf(item?.status);
            if (!providerId || !status) continue;
            if (!(await once(`${providerId}:${status}`))) continue;
            await supabaseAdmin
              .from("whatsapp_messages")
              .update({
                status,
                ...(status === "entregue" ? { delivered_at: now } : {}),
                ...(status === "lida" ? { read_at: now } : {}),
                ...(status === "falhou" ? { failed_at: now, error: "O WhatsApp recusou a entrega." } : {}),
              })
              .eq("account_id", account.id)
              .eq("provider_message_id", String(providerId));
          }
          return new Response("ok");
        }

        if (event === "MESSAGES_DELETE") {
          const items = Array.isArray(body?.data) ? body.data : [body?.data];
          for (const item of items) {
            const providerId = item?.keyId ?? item?.key?.id;
            if (!providerId) continue;
            if (!(await once(`del:${providerId}`))) continue;
            await supabaseAdmin
              .from("whatsapp_messages")
              .update({ status: "apagada", body: null })
              .eq("account_id", account.id)
              .eq("provider_message_id", String(providerId));
          }
          return new Response("ok");
        }

        return new Response("ok");
      },
    },
  },
});

export const _internal = { normalizePhone };
