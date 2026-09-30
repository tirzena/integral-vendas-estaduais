/** Helpers puros de WhatsApp, seguros para usar na tela e no servidor. */

export type ConnectionStatus =
  "conectado" | "conectando" | "aguardando_qr" | "desconectado" | "erro";

export const CONNECTION_LABEL: Record<ConnectionStatus, string> = {
  conectado: "Conectado",
  conectando: "Conectando",
  aguardando_qr: "Aguardando leitura do QR Code",
  desconectado: "Desconectado",
  erro: "Com problema",
};

export const MESSAGE_STATUS_LABEL: Record<string, string> = {
  enviando: "Enviando",
  enviada: "Enviada",
  entregue: "Entregue",
  lida: "Lida",
  falhou: "Falhou",
};

export function messageStatusLabel(status?: string | null) {
  if (!status) return "Sem informação";
  return MESSAGE_STATUS_LABEL[status] ?? "Sem informação";
}

/** Deixa o telefone só com dígitos, no formato internacional (padrão Brasil). */
export function normalizePhone(input?: string | null): string | null {
  if (!input) return null;
  let digits = String(input).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  // números brasileiros digitados sem o código do país
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

/** Converte o identificador do WhatsApp (JID/LID) em telefone normalizado. */
export function jidToPhone(jid?: string | null): string | null {
  if (!jid) return null;
  if (/@(lid|g\.us|broadcast)$/i.test(String(jid))) return null;
  const raw = String(jid).split("@")[0]?.split(":")[0] ?? "";
  return normalizePhone(raw);
}

export function phoneToJid(phone: string) {
  return `${phone}@s.whatsapp.net`;
}

/** Mostra só o final do número, para não expor a base inteira na tela. */
export function maskPhone(phone?: string | null) {
  if (!phone) return "Sem número";
  const d = String(phone).replace(/\D/g, "");
  if (d.length < 4) return "•••";
  return `+${d.slice(0, 2)} ••••• ${d.slice(-4)}`;
}

export function formatPhoneBr(phone?: string | null) {
  const d = normalizePhone(phone);
  if (!d) return "Sem número";
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    const ddd = d.slice(2, 4);
    const rest = d.slice(4);
    return `(${ddd}) ${rest.slice(0, rest.length - 4)}-${rest.slice(-4)}`;
  }
  return `+${d}`;
}

export const WHATSAPP_EVENTS = [
  "CONNECTION_UPDATE",
  "QRCODE_UPDATED",
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
  "MESSAGES_DELETE",
  "SEND_MESSAGE",
] as const;

export const MEDIA_MAX_BYTES = 16 * 1024 * 1024;

export function mediaKind(mime?: string | null) {
  const m = (mime ?? "").toLowerCase();
  if (m === "image/webp") return "sticker" as const;
  if (m.startsWith("image/")) return "image" as const;
  if (m.startsWith("video/")) return "video" as const;
  if (m.startsWith("audio/")) return "audio" as const;
  if (m) return "document" as const;
  return null;
}
