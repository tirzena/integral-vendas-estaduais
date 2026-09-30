/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Catálogo de métricas do tráfego pago (Meta).
 * Só existem aqui métricas que a própria Meta devolve: nada é inventado nem zerado
 * quando o dado não veio — nesses casos o valor fica nulo e a tela mostra "Sem dados".
 */
import { formatMoney, formatNumber } from "@/lib/format";

export type MetricKind = "currency" | "number" | "percent" | "decimal";

export type MetricDef = {
  key: string;
  label: string;
  kind: MetricKind;
  /** soma direta de um campo por linha */
  base?: string;
  /** métrica calculada a partir das somas */
  needs?: string[];
  derive?: (b: Record<string, number | null>) => number | null;
};

const div = (a: number | null, b: number | null) =>
  a == null || b == null || !b ? null : a / b;

/** Bases somáveis + derivadas. A ordem define a ordem padrão do catálogo. */
export const METRIC_CATALOG: MetricDef[] = [
  { key: "spend", label: "Valor investido", kind: "currency", base: "spend" },
  { key: "impressions", label: "Impressões", kind: "number", base: "impressions" },
  { key: "reach", label: "Alcance", kind: "number", base: "reach" },
  {
    key: "frequency",
    label: "Frequência",
    kind: "decimal",
    needs: ["impressions", "reach"],
    derive: (b) => div(b["impressions"] ?? null, b["reach"] ?? null),
  },
  { key: "clicks", label: "Cliques", kind: "number", base: "clicks" },
  { key: "link_clicks", label: "Cliques no link", kind: "number", base: "link_clicks" },
  {
    key: "cpc",
    label: "CPC (custo por clique)",
    kind: "currency",
    needs: ["spend", "clicks"],
    derive: (b) => div(b["spend"] ?? null, b["clicks"] ?? null),
  },
  {
    key: "cost_per_link_click",
    label: "Custo por clique no link",
    kind: "currency",
    needs: ["spend", "link_clicks"],
    derive: (b) => div(b["spend"] ?? null, b["link_clicks"] ?? null),
  },
  {
    key: "cpm",
    label: "CPM (custo por mil impressões)",
    kind: "currency",
    needs: ["spend", "impressions"],
    derive: (b) => {
      const v = div(b["spend"] ?? null, b["impressions"] ?? null);
      return v == null ? null : v * 1000;
    },
  },
  {
    key: "ctr",
    label: "CTR (cliques ÷ impressões)",
    kind: "percent",
    needs: ["clicks", "impressions"],
    derive: (b) => {
      const v = div(b["clicks"] ?? null, b["impressions"] ?? null);
      return v == null ? null : v * 100;
    },
  },
  {
    key: "link_ctr",
    label: "CTR do link",
    kind: "percent",
    needs: ["link_clicks", "impressions"],
    derive: (b) => {
      const v = div(b["link_clicks"] ?? null, b["impressions"] ?? null);
      return v == null ? null : v * 100;
    },
  },
  {
    key: "landing_page_views",
    label: "Visualizações da página de destino",
    kind: "number",
    base: "landing_page_views",
  },
  { key: "leads", label: "Leads", kind: "number", base: "leads" },
  {
    key: "cost_per_lead",
    label: "Custo por lead",
    kind: "currency",
    needs: ["spend", "leads"],
    derive: (b) => div(b["spend"] ?? null, b["leads"] ?? null),
  },
  {
    key: "conversations",
    label: "Conversas iniciadas",
    kind: "number",
    base: "conversations",
  },
  {
    key: "cost_per_conversation",
    label: "Custo por conversa",
    kind: "currency",
    needs: ["spend", "conversations"],
    derive: (b) => div(b["spend"] ?? null, b["conversations"] ?? null),
  },
  { key: "purchases", label: "Compras", kind: "number", base: "purchases" },
  {
    key: "cost_per_purchase",
    label: "Custo por compra",
    kind: "currency",
    needs: ["spend", "purchases"],
    derive: (b) => div(b["spend"] ?? null, b["purchases"] ?? null),
  },
  {
    key: "conversion_value",
    label: "Valor de conversão",
    kind: "currency",
    base: "conversion_value",
  },
  {
    key: "roas",
    label: "ROAS (retorno sobre investimento)",
    kind: "decimal",
    needs: ["conversion_value", "spend"],
    derive: (b) => div(b["conversion_value"] ?? null, b["spend"] ?? null),
  },
  { key: "results", label: "Resultados", kind: "number", base: "results" },
  {
    key: "cost_per_result",
    label: "Custo por resultado",
    kind: "currency",
    needs: ["spend", "results"],
    derive: (b) => div(b["spend"] ?? null, b["results"] ?? null),
  },
  { key: "post_engagement", label: "Envolvimento com a publicação", kind: "number", base: "post_engagement" },
  { key: "page_engagement", label: "Envolvimento com a página", kind: "number", base: "page_engagement" },
  { key: "video_views", label: "Visualizações de vídeo", kind: "number", base: "video_views" },
  { key: "unique_clicks", label: "Pessoas que clicaram", kind: "number", base: "unique_clicks" },
];

/** Rótulos amigáveis para tipos de ação da Meta que aparecerem além do catálogo fixo. */
export const ACTION_LABELS: Record<string, string> = {
  link_click: "Cliques no link",
  landing_page_view: "Visualizações da página de destino",
  lead: "Leads",
  post_engagement: "Envolvimento com a publicação",
  page_engagement: "Envolvimento com a página",
  post_reaction: "Reações",
  comment: "Comentários",
  onsite_conversion: "Conversões no app da Meta",
  video_view: "Visualizações de vídeo",
  purchase: "Compras",
  add_to_cart: "Adições ao carrinho",
  initiate_checkout: "Finalizações de compra iniciadas",
  complete_registration: "Cadastros concluídos",
};

export function humanizeActionType(type: string): string {
  if (ACTION_LABELS[type]) return ACTION_LABELS[type]!;
  const short = type.split(".").pop() ?? type;
  const cleaned = short.replace(/^fb_pixel_/, "").replace(/_/g, " ");
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Valores por linha. Usa o pacote completo salvo na sincronização (coluna metrics)
 * e, para linhas antigas, cai nas colunas já existentes — sem perder compatibilidade.
 */
export function rowBases(row: any): Record<string, number | null> {
  const m = (row?.metrics ?? {}) as Record<string, unknown>;
  const pick = (key: string, fallback?: unknown) =>
    key in m ? numOrNull(m[key]) : numOrNull(fallback);
  return {
    spend: pick("spend", row.spend),
    impressions: pick("impressions", row.impressions),
    reach: pick("reach", row.reach),
    clicks: pick("clicks", row.clicks),
    link_clicks: pick("link_clicks"),
    unique_clicks: pick("unique_clicks"),
    landing_page_views: pick("landing_page_views"),
    leads: pick("leads", row.leads),
    conversations: pick("conversations"),
    purchases: pick("purchases", row.conversions),
    conversion_value: pick("conversion_value", row.revenue),
    results: pick("results", row.results),
    post_engagement: pick("post_engagement"),
    page_engagement: pick("page_engagement"),
    video_views: pick("video_views"),
    ...extraActionBases(m),
  };
}

/** Ações extras devolvidas pela Meta viram bases dinâmicas (action:<tipo>). */
function extraActionBases(m: Record<string, unknown>): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  const actions = (m["actions"] ?? null) as Record<string, unknown> | null;
  const values = (m["action_values"] ?? null) as Record<string, unknown> | null;
  if (actions) for (const [k, v] of Object.entries(actions)) out[`action:${k}`] = numOrNull(v);
  if (values) for (const [k, v] of Object.entries(values)) out[`value:${k}`] = numOrNull(v);
  return out;
}

export type Totals = {
  bases: Record<string, number | null>;
  value: (key: string) => number | null;
  definitions: MetricDef[];
};

/** Catálogo efetivo: fixo + métricas dinâmicas presentes nos dados. */
export function catalogFor(rows: any[]): MetricDef[] {
  const dynamic = new Map<string, MetricDef>();
  for (const r of rows) {
    const bases = rowBases(r);
    for (const [key, v] of Object.entries(bases)) {
      if (v == null) continue;
      if (key.startsWith("action:")) {
        const type = key.slice("action:".length);
        if (METRIC_CATALOG.some((d) => d.label === humanizeActionType(type))) continue;
        dynamic.set(key, {
          key,
          label: humanizeActionType(type),
          kind: "number",
          base: key,
        });
        dynamic.set(`cost:${type}`, {
          key: `cost:${type}`,
          label: `Custo por ${humanizeActionType(type).toLowerCase()}`,
          kind: "currency",
          needs: ["spend", key],
          derive: (b) => div(b["spend"] ?? null, b[key] ?? null),
        });
      } else if (key.startsWith("value:")) {
        const type = key.slice("value:".length);
        dynamic.set(key, {
          key,
          label: `Valor de ${humanizeActionType(type).toLowerCase()}`,
          kind: "currency",
          base: key,
        });
      }
    }
  }
  return [...METRIC_CATALOG, ...dynamic.values()];
}

/** Soma as bases das linhas informadas e devolve um leitor por métrica. */
export function totalsFor(rows: any[], defs: MetricDef[]): Totals {
  const bases: Record<string, number | null> = {};
  for (const r of rows) {
    for (const [key, v] of Object.entries(rowBases(r))) {
      if (v == null) continue;
      bases[key] = (bases[key] ?? 0) + v;
    }
  }
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const value = (key: string): number | null => {
    const def = byKey.get(key);
    if (!def) return null;
    if (def.base) return bases[def.base] ?? null;
    if (def.needs?.some((n) => bases[n] == null)) return null;
    return def.derive ? def.derive(bases) : null;
  };
  return { bases, value, definitions: defs };
}

export function isAvailable(key: string, defs: MetricDef[], bases: Record<string, number | null>) {
  const def = defs.find((d) => d.key === key);
  if (!def) return false;
  if (def.base) return bases[def.base] != null;
  return (def.needs ?? []).every((n) => bases[n] != null);
}

export function formatMetric(value: number | null, kind: MetricKind, currency: string): string {
  if (value == null || !Number.isFinite(value)) return "Sem dados";
  if (kind === "currency") return formatMoney(value, currency as any);
  if (kind === "percent") return `${formatNumber(value, 2)}%`;
  if (kind === "decimal") return formatNumber(value, 2);
  return formatNumber(value);
}

export const DEFAULT_CARDS = [
  "spend",
  "impressions",
  "clicks",
  "ctr",
  "cpc",
  "cpm",
  "leads",
  "cost_per_lead",
];
export const DEFAULT_CHART = ["spend", "clicks", "impressions"];

export const SERIES_COLORS = [
  "#6366f1",
  "#d946ef",
  "#0ea5e9",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#8b5cf6",
  "#14b8a6",
];
