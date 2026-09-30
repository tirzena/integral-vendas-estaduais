/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Ingestão de posições vindas de rastreadores (tags) da empresa.
 * Autenticado por segredo compartilhado; o dispositivo é resolvido no servidor
 * a partir do provedor + identificador externo já cadastrados.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

const MAX_BODY = 32 * 1024;

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Adaptador genérico: aceita os nomes de campo mais comuns dos provedores. */
function normalize(raw: any) {
  const lat = num(raw?.lat ?? raw?.latitude ?? raw?.location?.lat);
  const lng = num(raw?.lng ?? raw?.lon ?? raw?.longitude ?? raw?.location?.lng);
  const t = raw?.timestamp ?? raw?.device_time ?? raw?.time ?? raw?.gps_time;
  let deviceTime: string | null = null;
  if (typeof t === "number") deviceTime = new Date(t > 1e12 ? t : t * 1000).toISOString();
  else if (typeof t === "string" && !Number.isNaN(Date.parse(t)))
    deviceTime = new Date(t).toISOString();
  return {
    provider: String(raw?.provider ?? "").trim().slice(0, 40),
    deviceId: String(raw?.device_id ?? raw?.deviceId ?? raw?.imei ?? "").trim().slice(0, 80),
    lat,
    lng,
    accuracy: num(raw?.accuracy ?? raw?.accuracy_m ?? raw?.hdop),
    speed: num(raw?.speed ?? raw?.speed_kmh),
    heading: num(raw?.heading ?? raw?.course ?? raw?.bearing),
    deviceTime,
    eventId: String(raw?.event_id ?? raw?.id ?? "").trim().slice(0, 120),
  };
}

export const Route = createFileRoute("/api/public/tracking/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["TRACKING_WEBHOOK_SECRET"];
        if (!secret) return new Response("Configuração pendente", { status: 503 });

        const text = await request.text();
        if (text.length > MAX_BODY) return new Response("Corpo muito grande", { status: 413 });

        // Assinatura HMAC-SHA256 sobre timestamp + corpo bruto, com janela de 5 min.
        const ts = request.headers.get("x-tracking-timestamp") ?? "";
        const sig = (request.headers.get("x-tracking-signature") ?? "").replace(/^sha256=/, "");
        const tsNum = Number(ts);
        if (!ts || !Number.isFinite(tsNum) || !sig) {
          return new Response("Não autorizado", { status: 401 });
        }
        const tsMs = tsNum > 1e12 ? tsNum : tsNum * 1000;
        if (Math.abs(Date.now() - tsMs) > 5 * 60 * 1000) {
          return new Response("Não autorizado", { status: 401 });
        }
        const expected = createHmac("sha256", secret).update(`${ts}.${text}`).digest("hex");
        if (!safeEqual(sig.toLowerCase(), expected)) {
          return new Response("Não autorizado", { status: 401 });
        }

        let raw: any;
        try {
          raw = JSON.parse(text);
        } catch {
          return new Response("JSON inválido", { status: 400 });
        }

        const p = normalize(raw);
        if (!p.provider || !p.deviceId || p.lat === null || p.lng === null) {
          return new Response("Dados incompletos", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: allowed } = await supabaseAdmin.rpc("tracking_rate_hit", {
          _key: `tag:${p.provider}:${p.deviceId}`,
          _max: 120,
          _window_seconds: 60,
        });
        if (allowed === false) return new Response("Muitas requisições", { status: 429 });

        const dedupe = p.eventId
          ? `tag:${p.provider}:${p.deviceId}:${p.eventId}`
          : `tag:${p.provider}:${p.deviceId}:${Math.floor(
              new Date(p.deviceTime ?? new Date().toISOString()).getTime() / 1000,
            )}`;

        // Nonce/idempotência: um mesmo evento nunca é gravado duas vezes.
        const { error: dupErr } = await supabaseAdmin
          .from("tracking_webhook_events")
          .insert({ event_id: dedupe, provider: p.provider });
        if (dupErr) {
          if (dupErr.code === "23505") return Response.json({ received: true, stored: false });
          return new Response("Falha ao registrar", { status: 500 });
        }

        const { data, error } = await supabaseAdmin.rpc("tracking_ingest_point", {
          _provider: p.provider,
          _external_device_id: p.deviceId,
          _lat: p.lat,
          _lng: p.lng,
          _accuracy: p.accuracy as unknown as number,
          _speed: p.speed as unknown as number,
          _heading: p.heading as unknown as number,
          _device_time: p.deviceTime ?? new Date().toISOString(),
          _dedupe: dedupe,
        });
        if (error) return new Response("Falha ao registrar", { status: 500 });

        // limpeza leve conforme a retenção configurada
        if (Math.random() < 0.02) await supabaseAdmin.rpc("tracking_purge_points", {});

        const ok = (data as any)?.ok === true;
        return Response.json(
          { received: true, stored: ok },
          {
            status: ok ? 200 : 202,
            headers: {
              "X-Content-Type-Options": "nosniff",
              "Referrer-Policy": "no-referrer",
              "Cache-Control": "no-store",
            },
          },
        );
      },
    },
  },
});
