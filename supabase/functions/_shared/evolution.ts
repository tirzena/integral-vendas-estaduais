export const WHATSAPP_EVENTS = [
  "CONNECTION_UPDATE",
  "QRCODE_UPDATED",
  "MESSAGES_SET",
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
  "MESSAGES_DELETE",
  "SEND_MESSAGE",
] as const;

const TIMEOUT_MS = 15_000;
const ORIGIN = "https://app.leadinroi.com";

export type EvolutionConfig = {
  url: string;
  key: string;
  webhookSecret: string;
};

export function evolutionConfig(): EvolutionConfig | null {
  const url = Deno.env.get("EVOLUTION_API_URL");
  const key = Deno.env.get("EVOLUTION_API_KEY");
  const webhookSecret = Deno.env.get("EVOLUTION_WEBHOOK_SECRET");
  if (!url || !key || !webhookSecret) return null;
  return { url: url.replace(/\/+$/, ""), key, webhookSecret };
}

export function requireEvolution() {
  const config = evolutionConfig();
  if (!config) {
    throw new Error("Configuração pendente: cadastre os secrets da Evolution API no Supabase.");
  }
  return config;
}

function friendlyError(status: number, payload: unknown) {
  const value = payload as { message?: unknown; error?: unknown } | null;
  const nested = payload as { response?: { message?: unknown } } | null;
  const raw = typeof payload === "string" ? payload : nested?.response?.message ?? value?.message ?? value?.error;
  const text = Array.isArray(raw) ? raw.join(" ") : typeof raw === "string" ? raw : "";
  const safe = text.replace(/[A-Za-z0-9_-]{24,}/g, "•••").slice(0, 200);
  if (status === 401 || status === 403) return "O servidor de WhatsApp recusou a autenticação.";
  if (status === 404) return "Instância não encontrada no servidor de WhatsApp.";
  if (status === 429) return "Muitas chamadas ao servidor de WhatsApp. Tente novamente em instantes.";
  return safe || `O servidor de WhatsApp respondeu com falha (${status}).`;
}

export async function evolutionCall<T = unknown>(
  config: EvolutionConfig,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${config.url}${path}`, {
      method: init.method ?? "GET",
      headers: {
        apikey: config.key,
        "Content-Type": "application/json",
        Origin: ORIGIN,
        Referer: `${ORIGIN}/`,
      },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(friendlyError(response.status, payload));
    return payload as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("O servidor de WhatsApp demorou para responder.");
    }
    throw error instanceof Error ? error : new Error("Falha ao falar com o servidor de WhatsApp.");
  } finally {
    clearTimeout(timer);
  }
}

export function webhookUrl() {
  const base = Deno.env.get("SUPABASE_URL")?.replace(/\/+$/, "");
  if (!base) throw new Error("SUPABASE_URL não configurada.");
  return `${base}/functions/v1/whatsapp-webhook`;
}

export function webhookPayload(config: EvolutionConfig) {
  return {
    enabled: true,
    url: webhookUrl(),
    webhookByEvents: false,
    webhookBase64: false,
    byEvents: false,
    base64: false,
    headers: {
      "x-webhook-secret": config.webhookSecret,
      "Content-Type": "application/json",
    },
    events: [...WHATSAPP_EVENTS],
  };
}

export function mapState(state?: string | null) {
  const value = (state ?? "").toLowerCase();
  if (value === "open" || value === "connected") return "conectado";
  if (value === "connecting") return "conectando";
  if (value === "qrcode" || value === "qr") return "aguardando_qr";
  return "desconectado";
}
