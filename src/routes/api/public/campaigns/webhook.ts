/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";

/**
 * Recebe os avisos dos provedores (entregue, falhou, lido, respondido,
 * descadastro) e atualiza a fila de envios. Só aceita chamadas assinadas.
 */

type Update = {
  providerMessageId: string;
  status?: string | undefined;
  error?: string | null | undefined;
  optOut?: { channel: string; address: string } | null | undefined;
};

function parseEvents(body: any): Update[] {
  const out: Update[] = [];
  // Meta WhatsApp Cloud API
  for (const entry of body?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      for (const s of change?.value?.statuses ?? []) {
        const map: Record<string, string> = {
          sent: "enviado",
          delivered: "entregue",
          read: "lido",
          failed: "falhou",
        };
        out.push({
          providerMessageId: s.id,
          status: map[s.status] ?? undefined,
          error: s.errors?.[0]?.title ?? null,
        });
      }
      for (const m of change?.value?.messages ?? []) {
        if (m?.context?.id) out.push({ providerMessageId: m.context.id, status: "respondido" });
      }
    }
  }
  // Resend
  if (body?.type && body?.data?.email_id) {
    const map: Record<string, string> = {
      "email.delivered": "entregue",
      "email.opened": "lido",
      "email.bounced": "falhou",
      "email.complained": "falhou",
    };
    const status = map[body.type];
    out.push({
      providerMessageId: body.data.email_id,
      status,
      error: status === "falhou" ? body.type : null,
      optOut:
        body.type === "email.complained" || body.type === "email.bounced"
          ? { channel: "email", address: String(body.data.to?.[0] ?? "") }
          : null,
    });
  }
  // Twilio
  if (body?.MessageSid) {
    const map: Record<string, string> = {
      delivered: "entregue",
      failed: "falhou",
      undelivered: "falhou",
      read: "lido",
    };
    out.push({
      providerMessageId: body.MessageSid,
      status: map[String(body.MessageStatus ?? "").toLowerCase()],
      error: body.ErrorMessage ?? null,
    });
  }
  return out.filter((u) => u.providerMessageId);
}

export const Route = createFileRoute("/api/public/campaigns/webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // verificação inicial do WhatsApp Cloud API
        const url = new URL(request.url);
        const verify = process.env["CAMPAIGNS_WEBHOOK_SECRET"];
        if (!verify) return new Response("Webhook não configurado", { status: 503 });
        if (url.searchParams.get("hub.verify_token") === verify) {
          return new Response(url.searchParams.get("hub.challenge") ?? "ok");
        }
        return new Response("Assinatura inválida", { status: 401 });
      },
      POST: async ({ request }) => {
        const raw = await request.text();
        if (raw.length > 200_000) return new Response("Payload muito grande", { status: 413 });

        const { safeEqual, hmacHex, hmacSha1Base64 } = await import("@/lib/campaign-tokens.server");
        const h = request.headers;
        let provider: string | null = null;

        // Meta (WhatsApp Cloud API): X-Hub-Signature-256 sobre o corpo cru
        const metaSig = h.get("x-hub-signature-256");
        if (metaSig) {
          const appSecret = process.env["META_APP_SECRET"];
          if (!appSecret) return new Response("Webhook não configurado", { status: 503 });
          const expected = `sha256=${await hmacHex(appSecret, raw)}`;
          if (!safeEqual(expected, metaSig)) {
            return new Response("Assinatura inválida", { status: 401 });
          }
          provider = "meta";
        }

        // Resend (Svix): assinatura com id + timestamp, com janela de 5 minutos
        const svixSig = h.get("svix-signature");
        if (!provider && svixSig) {
          const key = process.env["RESEND_WEBHOOK_SECRET"];
          if (!key) return new Response("Webhook não configurado", { status: 503 });
          const id = h.get("svix-id") ?? "";
          const ts = Number(h.get("svix-timestamp") ?? 0);
          if (!id || !Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
            return new Response("Evento expirado", { status: 401 });
          }
          const secretBytes = key.replace(/^whsec_/, "");
          const expected = await hmacHex(atob(secretBytes), `${id}.${ts}.${raw}`);
          const provided = svixSig
            .split(" ")
            .map((p) => p.split(",")[1] ?? "")
            .filter(Boolean);
          const hexProvided = provided.map((p) =>
            Array.from(atob(p))
              .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
              .join(""),
          );
          if (!hexProvided.some((p) => safeEqual(p, expected))) {
            return new Response("Assinatura inválida", { status: 401 });
          }
          provider = "resend";
        }

        // Twilio: HMAC-SHA1 da URL + parâmetros ordenados
        const twilioSig = h.get("x-twilio-signature");
        if (!provider && twilioSig) {
          const token = process.env["TWILIO_AUTH_TOKEN"];
          if (!token) return new Response("Webhook não configurado", { status: 503 });
          const params = new URLSearchParams(raw);
          const sorted = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
          const base =
            request.url.split("?")[0] + sorted.map(([k, v]) => `${k}${v}`).join("");
          const expected = await hmacSha1Base64(token, base);
          if (!safeEqual(expected, twilioSig)) {
            return new Response("Assinatura inválida", { status: 401 });
          }
          provider = "twilio";
        }

        if (!provider) return new Response("Assinatura ausente", { status: 401 });

        let body: any;
        try {
          body = JSON.parse(raw);
        } catch {
          body = Object.fromEntries(new URLSearchParams(raw));
        }


        const updates = parseEvents(body);
        if (!updates.length) return new Response("ok");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const stamp = new Date().toISOString();
        for (const u of updates) {
          // cada evento é aplicado uma única vez
          const eventId = `${u.providerMessageId}:${u.status ?? "evento"}`;
          const { error: dupErr } = await supabaseAdmin
            .from("message_webhook_events")
            .insert({ provider, event_id: eventId });
          if (dupErr) continue;

          const patch: any = { error: u.error ?? null };
          if (u.status) patch.status = u.status;
          if (u.status === "entregue") patch.delivered_at = stamp;
          if (u.status === "lido") patch.read_at = stamp;
          if (u.status === "respondido") patch.replied_at = stamp;
          const { data: job } = await supabaseAdmin
            .from("message_jobs")
            .update(patch)
            .eq("provider_message_id", u.providerMessageId)
            .select("id")
            .maybeSingle();
          if (job) {
            // guarda só o resumo do evento, sem os dados pessoais do payload
            await supabaseAdmin.from("message_attempts").insert({
              job_id: job.id,
              attempt_no: 0,
              status: u.status ?? "evento",
              provider_response: { provider, event: u.status ?? "evento", at: stamp },
            });
          }
          if (u.optOut?.address) {
            await supabaseAdmin
              .from("message_suppression")
              .upsert(
                { channel: u.optOut.channel, address: u.optOut.address, reason: "retorno do provedor" },
                { onConflict: "channel,address" },
              );
          }
        }
        return new Response("ok");
      },
    },
  },
});
