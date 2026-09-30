/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Regras compartilhadas do Disparador de mensagens.
 * Tudo aqui é seguro para rodar no navegador: nenhum segredo de provedor.
 */

export type Channel = "whatsapp" | "email" | "sms";

export const CHANNELS: Channel[] = ["whatsapp", "email", "sms"];

export const CHANNEL_LABELS: Record<Channel, string> = {
  whatsapp: "WhatsApp",
  email: "E-mail",
  sms: "SMS",
};

export const CAMPAIGN_STATUS = [
  "rascunho",
  "aguardando_aprovacao",
  "agendada",
  "executando",
  "pausada",
  "concluida",
  "cancelada",
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUS)[number];

export const STATUS_LABELS: Record<CampaignStatus, string> = {
  rascunho: "Rascunho",
  aguardando_aprovacao: "Aguardando aprovação",
  agendada: "Agendada",
  executando: "Executando",
  pausada: "Pausada",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

export const OCCASIONS = [
  { value: "pontual", label: "Campanha pontual" },
  { value: "aniversario", label: "Aniversário do cliente" },
  { value: "dia_das_maes", label: "Dia das Mães" },
  { value: "dia_dos_pais", label: "Dia dos Pais" },
  { value: "personalizada", label: "Data personalizada" },
] as const;

/** Modelos prontos de texto por ocasião. */
export const OCCASION_TEMPLATES: Record<string, { subject: string; body: string }> = {
  aniversario: {
    subject: "Feliz aniversário, {{primeiro_nome}}! 🎉",
    body:
      "Oi {{primeiro_nome}}, feliz aniversário! 🎉\n\nA equipe {{empresa}} preparou um presente para você em {{produto}}. " +
      "Fale com {{vendedor}} e aproveite: {{link}}",
  },
  dia_das_maes: {
    subject: "Dia das Mães com condições especiais",
    body:
      "Oi {{primeiro_nome}}! O Dia das Mães está chegando e separamos ofertas especiais em {{produto}}.\n\n" +
      "Veja aqui: {{link}}",
  },
  dia_dos_pais: {
    subject: "Dia dos Pais chegando",
    body:
      "Oi {{primeiro_nome}}! Preparamos condições especiais de Dia dos Pais em {{produto}}.\n\n" +
      "Confira: {{link}}",
  },
  personalizada: {
    subject: "Novidades da {{empresa}}",
    body: "Oi {{primeiro_nome}}, temos uma novidade em {{produto}} para você. {{link}}",
  },
  pontual: {
    subject: "Novidades da {{empresa}}",
    body: "Oi {{primeiro_nome}}, temos uma novidade em {{produto}} para você. {{link}}",
  },
};

export const VARIABLES = [
  { key: "nome", label: "Nome completo" },
  { key: "primeiro_nome", label: "Primeiro nome" },
  { key: "produto", label: "Produto / área" },
  { key: "vendedor", label: "Vendedor responsável" },
  { key: "empresa", label: "Nome da empresa" },
  { key: "cidade", label: "Cidade" },
  { key: "link", label: "Link da campanha" },
];

export type AudienceFilters = {
  productId?: string | null;
  gender?: string;
  ageMin?: number | null;
  ageMax?: number | null;
  birthday?: "todos" | "hoje" | "mes";
  country?: string;
  state?: string;
  city?: string;
  sellerId?: string;
  tags?: string[];
  status?: string;
  origin?: string;
};

export type AudienceContact = {
  customerId: string;
  name: string;
  firstName: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  productName: string | null;
  sellerName: string | null;
  birthDate: string | null;
  blockedReason: string | null;
  channels: Channel[];
};

export function firstNameOf(name: string) {
  return (name || "").trim().split(/\s+/)[0] || name || "cliente";
}

export function ageFromBirthDate(birth?: string | null) {
  if (!birth) return null;
  const d = new Date(birth + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age -= 1;
  return age;
}

/** Substitui as variáveis do texto pelos dados do contato. */
export function renderMessage(
  template: string,
  contact: Partial<AudienceContact>,
  extra: { empresa?: string; link?: string } = {},
) {
  const map: Record<string, string> = {
    nome: contact.name ?? "",
    primeiro_nome: contact.firstName ?? firstNameOf(contact.name ?? ""),
    produto: contact.productName ?? "",
    vendedor: contact.sellerName ?? "",
    cidade: contact.city ?? "",
    empresa: extra.empresa ?? "",
    link: extra.link ?? "",
  };
  return (template || "").replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_all, key: string) => {
    const value = map[key.toLowerCase()];
    return value === undefined ? "" : value;
  });
}

const DIGITS = /\D+/g;

export function normalizePhone(value?: string | null) {
  if (!value) return null;
  const digits = value.replace(DIGITS, "");
  if (digits.length < 10) return null;
  return digits.startsWith("55") || digits.length > 11 ? `+${digits}` : `+55${digits}`;
}

export function normalizeEmail(value?: string | null) {
  const v = (value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? v : null;
}

/** Horário silencioso: verdadeiro quando o envio deve esperar. */
export function isQuietHour(date: Date, start: string, end: string, timeZone = "America/Sao_Paulo") {
  const hhmm = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  const s = start.slice(0, 5);
  const e = end.slice(0, 5);
  if (s === e) return false;
  return s < e ? hhmm >= s && hhmm < e : hhmm >= s || hhmm < e;
}

/** Próximo horário permitido, respeitando o silêncio noturno. */
export function nextAllowedSend(from: Date, start: string, end: string) {
  const d = new Date(from);
  for (let i = 0; i < 48; i += 1) {
    if (!isQuietHour(d, start, end)) return d;
    d.setMinutes(d.getMinutes() + 30);
  }
  return d;
}

export function idempotencyKey(campaignId: string, customerId: string, channel: Channel, step = 1) {
  return `${campaignId}:${customerId}:${channel}:${step}`;
}
