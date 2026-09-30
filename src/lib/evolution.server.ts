/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Conversa com a Evolution API instalada na VPS. Só o servidor usa este
 * arquivo: a URL, a chave e o segredo do webhook nunca chegam ao navegador,
 * e nenhuma resposta bruta do provedor é devolvida para a tela.
 */
import { WHATSAPP_EVENTS } from "@/lib/whatsapp";

const TIMEOUT_MS = 15000;
/** A VPS da LEADinROI só aceita chamadas com esta origem. */
const ORIGIN = "https://app.leadinroi.com";

export type EvolutionConfig = { url: string; key: string; webhookSecret: string };

export function evolutionConfig(): EvolutionConfig | null {
  const url = process.env["EVOLUTION_API_URL"];
  const key = process.env["EVOLUTION_API_KEY"];
  const webhookSecret = process.env["EVOLUTION_WEBHOOK_SECRET"];
  if (!url || !key || !webhookSecret) return null;
  return { url: url.replace(/\/+$/, ""), key, webhookSecret };
}

export function requireEvolution(): EvolutionConfig {
  const cfg = evolutionConfig();
  if (!cfg) {
    throw new Error(
      "Configuração pendente: a conexão com o WhatsApp ainda não foi liberada pelo administrador.",
    );
  }
  return cfg;
}

/** Nunca devolve corpo bruto nem cabeçalhos do provedor para quem chamou. */
function friendlyError(status: number, payload: any) {
  const raw = typeof payload === "string" ? payload : (payload?.message ?? payload?.error);
  const text = Array.isArray(raw) ? raw.join(" ") : typeof raw === "string" ? raw : "";
  const safe = text.replace(/[A-Za-z0-9_-]{24,}/g, "•••").slice(0, 200);
  if (status === 401 || status === 403) return "O servidor de WhatsApp recusou a autenticação.";
  if (status === 404) return "Instância não encontrada no servidor de WhatsApp.";
  if (status === 429)
    return "Muitas chamadas ao servidor de WhatsApp. Tente novamente em instantes.";
  return safe || `O servidor de WhatsApp respondeu com falha (${status}).`;
}

async function call<T = any>(
  cfg: EvolutionConfig,
  path: string,
  init: { method?: string; body?: any } = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${cfg.url}${path}`, {
      method: init.method ?? "GET",
      headers: {
        apikey: cfg.key,
        "Content-Type": "application/json",
        Origin: ORIGIN,
        Referer: `${ORIGIN}/`,
      },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
      signal: controller.signal,
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(friendlyError(res.status, json));
    return json as T;
  } catch (e: any) {
    if (e?.name === "AbortError") throw new Error("O servidor de WhatsApp demorou para responder.");
    throw e instanceof Error ? e : new Error("Falha ao falar com o servidor de WhatsApp.");
  } finally {
    clearTimeout(timer);
  }
}

/** Nome de instância aleatório: não contém telefone, nome nem dado do cliente. */
export function newInstanceName() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const id = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `erp-${id}`;
}

export function webhookUrl() {
  const base = (process.env["PUBLIC_SITE_URL"] || "https://tirzena.vercel.app").replace(/\/+$/, "");
  return `${base}/api/public/evolution/webhook`;
}

function webhookPayload(cfg: EvolutionConfig) {
  return {
    enabled: true,
    url: webhookUrl(),
    webhookByEvents: false,
    webhookBase64: false,
    byEvents: false,
    base64: false,
    headers: { "x-webhook-secret": cfg.webhookSecret, "Content-Type": "application/json" },
    events: [...WHATSAPP_EVENTS],
  };
}

export async function createInstance(cfg: EvolutionConfig, instanceName: string) {
  return call(cfg, "/instance/create", {
    method: "POST",
    body: {
      instanceName,
      integration: "WHATSAPP-BAILEYS",
      qrcode: true,
      webhook: webhookPayload(cfg),
    },
  });
}

export async function setWebhook(cfg: EvolutionConfig, instanceName: string) {
  return call(cfg, `/webhook/set/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: { webhook: webhookPayload(cfg) },
  });
}

export async function findWebhook(cfg: EvolutionConfig, instanceName: string) {
  try {
    return await call(cfg, `/webhook/find/${encodeURIComponent(instanceName)}`);
  } catch {
    return null;
  }
}

export async function connectInstance(cfg: EvolutionConfig, instanceName: string) {
  const json: any = await call(cfg, `/instance/connect/${encodeURIComponent(instanceName)}`);
  const base64: string | null = json?.base64 ?? json?.qrcode?.base64 ?? null;
  return {
    qrBase64: base64
      ? base64.startsWith("data:")
        ? base64
        : `data:image/png;base64,${base64}`
      : null,
    pairingCode: json?.pairingCode ?? json?.code ?? null,
  };
}

export async function connectionState(cfg: EvolutionConfig, instanceName: string) {
  const json: any = await call(
    cfg,
    `/instance/connectionState/${encodeURIComponent(instanceName)}`,
  );
  const state: string = json?.instance?.state ?? json?.state ?? "close";
  return state;
}

export async function fetchInstance(cfg: EvolutionConfig, instanceName: string) {
  try {
    const json: any = await call(
      cfg,
      `/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`,
    );
    const item = Array.isArray(json) ? json[0] : json;
    const inst = item?.instance ?? item;
    return {
      ownerJid: inst?.owner ?? inst?.ownerJid ?? null,
      profileName: inst?.profileName ?? null,
      state: inst?.connectionStatus ?? inst?.status ?? inst?.state ?? null,
    };
  } catch {
    return null;
  }
}

export async function logoutInstance(cfg: EvolutionConfig, instanceName: string) {
  return call(cfg, `/instance/logout/${encodeURIComponent(instanceName)}`, { method: "DELETE" });
}

export async function deleteInstance(cfg: EvolutionConfig, instanceName: string) {
  return call(cfg, `/instance/delete/${encodeURIComponent(instanceName)}`, { method: "DELETE" });
}

export async function sendText(
  cfg: EvolutionConfig,
  instanceName: string,
  number: string,
  text: string,
  quotedId?: string | null,
) {
  const json: any = await call(cfg, `/message/sendText/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: {
      number,
      text,
      ...(quotedId ? { quoted: { key: { id: quotedId } } } : {}),
    },
  });
  return { id: json?.key?.id ?? json?.messageId ?? null };
}

export async function sendMedia(
  cfg: EvolutionConfig,
  instanceName: string,
  number: string,
  opts: {
    mediatype: "image" | "video" | "document" | "audio";
    mimetype: string;
    media: string;
    caption?: string;
    fileName?: string;
  },
) {
  if (opts.mediatype === "audio") {
    const json: any = await call(
      cfg,
      `/message/sendWhatsAppAudio/${encodeURIComponent(instanceName)}`,
      { method: "POST", body: { number, audio: opts.media } },
    );
    return { id: json?.key?.id ?? null };
  }
  const json: any = await call(cfg, `/message/sendMedia/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: {
      number,
      mediatype: opts.mediatype,
      mimetype: opts.mimetype,
      media: opts.media,
      caption: opts.caption ?? "",
      fileName: opts.fileName ?? "arquivo",
    },
  });
  return { id: json?.key?.id ?? null };
}

/** Estado da Evolution traduzido para o vocabulário do sistema. */
export function mapState(state?: string | null) {
  const s = (state ?? "").toLowerCase();
  if (s === "open" || s === "connected") return "conectado" as const;
  if (s === "connecting") return "conectando" as const;
  if (s === "qrcode" || s === "qr") return "aguardando_qr" as const;
  return "desconectado" as const;
}
