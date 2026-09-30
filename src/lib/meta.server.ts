/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Camada servidor da integração Meta (tráfego pago).
 * Nunca importe este arquivo no cliente: ele lida com App Secret e tokens.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const GRAPH_VERSION = "v21.0";
export const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
/** Permissões solicitadas nesta etapa. leads_retrieval fica para etapa futura. */
export const META_SCOPES = ["ads_read", "ads_management", "business_management"] as const;

export function metaAppId(): string | null {
  return process.env["META_APP_ID"] ?? null;
}
function metaAppSecret(): string | null {
  return process.env["META_APP_SECRET"] ?? null;
}
export function metaConfigured(): boolean {
  return Boolean(metaAppId() && metaAppSecret() && process.env["META_TOKEN_ENCRYPTION_KEY"]);
}

export function adminClient(): SupabaseClient<Database> {
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

/* ------------------------- criptografia do token ------------------------- */

async function cryptoKey(): Promise<CryptoKey> {
  const secret = process.env["META_TOKEN_ENCRYPTION_KEY"];
  if (!secret) throw new Error("META_TOKEN_ENCRYPTION_KEY ausente");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function fromBase64(value: string): ArrayBuffer {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer as ArrayBuffer;
}

export async function encryptToken(token: string): Promise<string> {
  const key = await cryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(token),
  );
  return `v1.${toBase64(iv)}.${toBase64(new Uint8Array(cipher))}`;
}

export async function decryptToken(payload: string): Promise<string> {
  const [version, ivB64, dataB64] = payload.split(".");
  if (version !== "v1" || !ivB64 || !dataB64) throw new Error("token guardado em formato inválido");
  const key = await cryptoKey();
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivB64) },
    key,
    fromBase64(dataB64),
  );
  return new TextDecoder().decode(plain);
}

/* ------------------------------ Graph API -------------------------------- */

/** Remove qualquer credencial de mensagens que possam ir para logs/banco. */
export function safeMessage(input: unknown): string {
  const text = input instanceof Error ? input.message : String(input ?? "erro desconhecido");
  return text
    .replace(/(access_token|client_secret|code|appsecret_proof)=[^&\s"]+/gi, "$1=***")
    .replace(/EAA[A-Za-z0-9]+/g, "***")
    .slice(0, 500);
}

export class MetaApiError extends Error {
  code: number;
  subcode: number | null;
  isAuthError: boolean;
  constructor(message: string, code: number, subcode: number | null) {
    super(message);
    this.code = code;
    this.subcode = subcode;
    this.isAuthError = code === 190 || code === 102 || code === 10 || code === 200;
  }
}

async function appSecretProof(token: string): Promise<string> {
  const secret = metaAppSecret();
  if (!secret) throw new Error("META_APP_SECRET ausente");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET no Graph com backoff para rate limit e erros temporários. */
export async function graphGet<T>(
  path: string,
  token: string,
  params: Record<string, string> = {},
): Promise<T> {
  const url = new URL(path.startsWith("http") ? path : `${GRAPH}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  url.searchParams.set("appsecret_proof", await appSecretProof(token));

  let lastError: MetaApiError | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const json = (await res.json().catch(() => ({}))) as {
      error?: { message?: string; code?: number; error_subcode?: number };
    };
    if (res.ok && !json.error) return json as T;
    const err = new MetaApiError(
      safeMessage(json.error?.message ?? `HTTP ${res.status}`),
      Number(json.error?.code ?? res.status),
      json.error?.error_subcode ?? null,
    );
    // 4 = rate limit da app, 17 = usuário, 613 = throttling, 1/2 = temporário
    const retryable = [1, 2, 4, 17, 341, 613].includes(err.code) || res.status >= 500;
    if (!retryable) throw err;
    lastError = err;
    await sleep(1000 * 2 ** attempt);
  }
  throw lastError ?? new MetaApiError("falha ao consultar a Meta", 0, null);
}

export async function graphPost<T>(
  path: string,
  token: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const url = new URL(`${GRAPH}/${path.replace(/^\//, "")}`);
  url.searchParams.set("access_token", token);
  url.searchParams.set("appsecret_proof", await appSecretProof(token));
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || data.error)
    throw new Error(safeMessage(data.error?.message ?? `HTTP ${res.status}`));
  return data as T;
}

export async function discoverDataset(token: string, adAccountId: string) {
  const rows = await graphList<{ id: string; name?: string }>(
    `act_${adAccountId}/adspixels`,
    token,
    { fields: "id,name" },
    2,
  );
  return rows[0] ?? null;
}

export async function sendQualifiedLeadEvent(customerProductId: string) {
  const admin = adminClient();
  const { data: opportunity } = (await admin
    .from("customer_products")
    .select("id,customer_id,product_id,customers(phone,whatsapp),products(name)")
    .eq("id", customerProductId)
    .maybeSingle()) as any;
  if (!opportunity) throw new Error("Lead não encontrado.");
  const { data: account } = (await admin
    .from("meta_ad_account_products")
    .select("meta_ad_accounts(id,dataset_id,connection_id)")
    .eq("product_id", opportunity.product_id)
    .limit(1)
    .maybeSingle()) as any;
  const meta = account?.meta_ad_accounts;
  const eventId = `qualified-${customerProductId}`;
  const { data: previousEvent } = await admin
    .from("meta_conversion_events")
    .select("status")
    .eq("event_id", eventId)
    .maybeSingle();
  if (previousEvent?.status === "enviado") {
    return { sent: true, duplicated: true };
  }
  if (!meta?.dataset_id) {
    await admin.from("meta_conversion_events").upsert(
      {
        customer_product_id: customerProductId,
        event_id: eventId,
        event_name: "Lead",
        status: "ignorado",
        error: "Nenhum conjunto de dados da Meta vinculado à categoria.",
      },
      { onConflict: "event_id" },
    );
    return { sent: false, reason: "dataset" };
  }
  const { data: connection } = await admin
    .from("meta_connections")
    .select("access_token_encrypted")
    .eq("id", meta.connection_id)
    .maybeSingle();
  if (!connection?.access_token_encrypted) return { sent: false, reason: "token" };
  const phone = String(
    opportunity.customers?.whatsapp ?? opportunity.customers?.phone ?? "",
  ).replace(/\D/g, "");
  const hash = phone
    ? [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(phone)))]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
    : null;
  try {
    const response = await graphPost<any>(
      `${meta.dataset_id}/events`,
      await decryptToken(connection.access_token_encrypted),
      {
        data: [
          {
            event_name: "Lead",
            event_time: Math.floor(Date.now() / 1000),
            event_id: eventId,
            action_source: "system_generated",
            user_data: hash ? { ph: [hash] } : {},
            custom_data: {
              qualification_status: "qualified",
              product: opportunity.products?.name ?? null,
            },
          },
        ],
      },
    );
    await admin.from("meta_conversion_events").upsert(
      {
        customer_product_id: customerProductId,
        event_id: eventId,
        event_name: "Lead",
        dataset_id: meta.dataset_id,
        status: "enviado",
        response,
        sent_at: new Date().toISOString(),
        error: null,
      },
      { onConflict: "event_id" },
    );
    return { sent: true };
  } catch (error) {
    await admin.from("meta_conversion_events").upsert(
      {
        customer_product_id: customerProductId,
        event_id: eventId,
        event_name: "Lead",
        dataset_id: meta.dataset_id,
        status: "falhou",
        error: safeMessage(error),
      },
      { onConflict: "event_id" },
    );
    return { sent: false, reason: "api" };
  }
}

/** Percorre todas as páginas de um endpoint de lista. */
export async function graphList<T>(
  path: string,
  token: string,
  params: Record<string, string> = {},
  maxPages = 20,
): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    const json: { data?: T[]; paging?: { next?: string } } = next
      ? await graphGet(next, token)
      : await graphGet(path, token, { limit: "100", ...params });
    out.push(...(json.data ?? []));
    next = json.paging?.next ?? null;
    if (!next) break;
  }
  return out;
}

/* ------------------------------- OAuth ----------------------------------- */

export async function exchangeCode(code: string, redirectUri: string) {
  const url = new URL(`${GRAPH}/oauth/access_token`);
  url.searchParams.set("client_id", metaAppId()!);
  url.searchParams.set("client_secret", metaAppSecret()!);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code", code);
  const res = await fetch(url);
  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  };
  if (!res.ok || !json.access_token) {
    throw new Error(safeMessage(json.error?.message ?? "não foi possível validar o código"));
  }
  return { token: json.access_token, expiresIn: json.expires_in ?? null };
}

export async function toLongLivedToken(token: string) {
  const url = new URL(`${GRAPH}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", metaAppId()!);
  url.searchParams.set("client_secret", metaAppSecret()!);
  url.searchParams.set("fb_exchange_token", token);
  const res = await fetch(url);
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!res.ok || !json.access_token) return { token, expiresIn: null as number | null };
  return { token: json.access_token, expiresIn: json.expires_in ?? null };
}

export type DiscoveredAccount = {
  ad_account_id: string;
  name: string | null;
  business_id: string | null;
  business_name: string | null;
  currency: string | null;
  timezone_name: string | null;
  account_status: number | null;
};

export async function discoverAccounts(token: string): Promise<DiscoveredAccount[]> {
  const accounts = await graphList<{
    id: string;
    account_id: string;
    name?: string;
    currency?: string;
    timezone_name?: string;
    account_status?: number;
    business?: { id: string; name: string };
  }>("me/adaccounts", token, {
    fields: "account_id,name,currency,timezone_name,account_status,business{id,name}",
  });
  const seen = new Set<string>();
  const out: DiscoveredAccount[] = [];
  for (const a of accounts) {
    const id = a.account_id ?? a.id?.replace(/^act_/, "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      ad_account_id: id,
      name: a.name ?? null,
      business_id: a.business?.id ?? null,
      business_name: a.business?.name ?? null,
      currency: a.currency ?? null,
      timezone_name: a.timezone_name ?? null,
      account_status: a.account_status ?? null,
    });
  }
  return out;
}

/* ------------------------------ Insights --------------------------------- */

type ActionRow = { action_type: string; value: string };
type InsightRow = {
  date_start: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  frequency?: string;
  clicks?: string;
  unique_clicks?: string;
  inline_link_clicks?: string;
  inline_link_click_ctr?: string;
  cost_per_inline_link_click?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  cpp?: string;
  objective?: string;
  actions?: ActionRow[];
  action_values?: ActionRow[];
  cost_per_action_type?: ActionRow[];
  purchase_roas?: ActionRow[];
};

/** Campos pedidos à Meta. Alimenta o catálogo de métricas do painel. */
export const INSIGHT_FIELDS = [
  "spend",
  "impressions",
  "reach",
  "frequency",
  "clicks",
  "unique_clicks",
  "inline_link_clicks",
  "inline_link_click_ctr",
  "cost_per_inline_link_click",
  "ctr",
  "cpc",
  "cpm",
  "cpp",
  "objective",
  "actions",
  "action_values",
  "cost_per_action_type",
  "purchase_roas",
].join(",");

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const sumActions = (rows: ActionRow[] | undefined, types: string[]) => {
  if (!rows) return null;
  let total = 0;
  let found = false;
  for (const r of rows) {
    if (types.includes(r.action_type)) {
      total += Number(r.value) || 0;
      found = true;
    }
  }
  return found ? total : null;
};
/** Normaliza actions/action_values/cost_per_action_type por action_type. */
const actionMap = (rows: ActionRow[] | undefined): Record<string, number> | null => {
  if (!rows?.length) return null;
  const out: Record<string, number> = {};
  for (const r of rows) {
    const v = num(r.value);
    if (v == null || !r.action_type) continue;
    out[r.action_type] = (out[r.action_type] ?? 0) + v;
  }
  return Object.keys(out).length ? out : null;
};
/** Monta o pacote de métricas sem inventar zeros: chave ausente = dado não veio. */
function buildMetrics(entries: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(entries)) {
    if (v === null || v === undefined) continue;
    out[k] = v;
  }
  return out;
}

const LEAD_TYPES = ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"];
const MSG_TYPES = [
  "onsite_conversion.messaging_conversation_started_7d",
  "onsite_conversion.total_messaging_connection",
];
const PURCHASE_TYPES = ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"];

const CURRENCY_ENUM = new Set(["BRL", "USD", "PYG"]);

export type SyncResult = { rows: number; error: string | null };

/** Sincroniza insights diários de uma conta, de forma idempotente. */
export async function syncAccountInsights(
  supabase: SupabaseClient<Database>,
  account: {
    id: string;
    ad_account_id: string;
    connection_id: string;
    currency: string | null;
    timezone_name: string | null;
  },
  token: string,
  since: string,
  until: string,
): Promise<SyncResult> {
  const startedAt = new Date().toISOString();
  try {
    const rows = await graphList<InsightRow>(`act_${account.ad_account_id}/insights`, token, {
      level: "account",
      time_increment: "1",
      time_range: JSON.stringify({ since, until }),
      fields: INSIGHT_FIELDS,
    });

    const links = await supabase
      .from("meta_ad_account_products")
      .select("product_id")
      .eq("meta_ad_account_id", account.id);
    const productId = links.data?.[0]?.product_id ?? null;

    const currency = (account.currency ?? "USD").toUpperCase();
    const payload = rows.map((r) => {
      const spend = num(r.spend) ?? 0;
      const leads = sumActions(r.actions, LEAD_TYPES);
      const conversas = sumActions(r.actions, MSG_TYPES);
      const purchases = sumActions(r.actions, PURCHASE_TYPES);
      const revenue = sumActions(r.action_values, PURCHASE_TYPES);
      const results = leads ?? conversas ?? purchases;
      const resultType =
        leads != null
          ? "leads"
          : conversas != null
            ? "conversas"
            : purchases != null
              ? "compras"
              : null;
      const actions = actionMap(r.actions);
      const actionValues = actionMap(r.action_values);
      const costPerAction = actionMap(r.cost_per_action_type);
      const metrics = buildMetrics({
        spend: num(r.spend),
        impressions: num(r.impressions),
        reach: num(r.reach),
        frequency: num(r.frequency),
        clicks: num(r.clicks),
        unique_clicks: num(r.unique_clicks),
        link_clicks: num(r.inline_link_clicks) ?? actions?.["link_click"] ?? null,
        link_ctr: num(r.inline_link_click_ctr),
        cost_per_link_click: num(r.cost_per_inline_link_click),
        ctr: num(r.ctr),
        cpc: num(r.cpc),
        cpm: num(r.cpm),
        cpp: num(r.cpp),
        objective: r.objective ?? null,
        landing_page_views: actions?.["landing_page_view"] ?? null,
        post_engagement: actions?.["post_engagement"] ?? null,
        page_engagement: actions?.["page_engagement"] ?? null,
        video_views: actions?.["video_view"] ?? null,
        leads,
        conversations: conversas,
        purchases,
        conversion_value: revenue,
        results,
        result_type: resultType,
        roas: sumActions(r.purchase_roas, ["purchase", "omni_purchase"]),
        actions,
        action_values: actionValues,
        cost_per_action: costPerAction,
      });
      return {
        metrics,
        meta_ad_account_id: account.id,
        integration_id: null,
        product_id: productId,
        metric_date: r.date_start,
        level: "account",
        object_id: account.ad_account_id,
        object_name: null,
        campaign: null,
        source: "meta",
        synced_at: new Date().toISOString(),
        account_currency: currency,
        account_timezone: account.timezone_name,
        currency: (CURRENCY_ENUM.has(currency) ? currency : "USD") as "BRL" | "USD" | "PYG",
        spend,
        impressions: num(r.impressions) ?? 0,
        reach: num(r.reach),
        frequency: num(r.frequency),
        clicks: num(r.clicks) ?? 0,
        ctr: num(r.ctr),
        cpc: num(r.cpc),
        cpm: num(r.cpm),
        leads: leads ?? 0,
        conversions: purchases ?? 0,
        revenue: revenue ?? 0,
        results,
        result_type: resultType,
        cost_per_result: results ? spend / results : null,
        is_demo: false,
      };
    });

    if (payload.length) {
      const { error } = await supabase
        .from("ad_metrics")

        .upsert(payload as any, { onConflict: "meta_ad_account_id,metric_date,level,object_id" });
      if (error) throw new Error(error.message);
    }

    await supabase
      .from("meta_ad_accounts")
      .update({
        last_synced_at: new Date().toISOString(),
        last_sync_status: "ok",
        last_sync_message: null,
      })
      .eq("id", account.id);

    await supabase.from("meta_sync_logs").insert({
      meta_ad_account_id: account.id,
      connection_id: account.connection_id,
      status: "ok",
      rows_upserted: payload.length,
      date_start: since,
      date_stop: until,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
    });

    return { rows: payload.length, error: null };
  } catch (error) {
    const message = safeMessage(error);
    await supabase
      .from("meta_ad_accounts")
      .update({ last_sync_status: "erro", last_sync_message: message })
      .eq("id", account.id);
    await supabase.from("meta_sync_logs").insert({
      meta_ad_account_id: account.id,
      connection_id: account.connection_id,
      status: "erro",
      rows_upserted: 0,
      date_start: since,
      date_stop: until,
      message,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
    });
    if (error instanceof MetaApiError && error.isAuthError) {
      await supabase
        .from("meta_connections")
        .update({ status: "expirado", last_error: message })
        .eq("id", account.connection_id);
    }
    return { rows: 0, error: message };
  }
}

/** Sincroniza todas as contas ativas. Falha de uma conta não interrompe as outras. */
export async function syncAllAccounts(
  supabase: SupabaseClient<Database>,
  days = 30,
  onlyConnectionId?: string,
) {
  const until = new Date().toISOString().slice(0, 10);
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

  let q = supabase
    .from("meta_ad_accounts")
    .select("id,ad_account_id,connection_id,currency,timezone_name")
    .eq("is_active", true);
  if (onlyConnectionId) q = q.eq("connection_id", onlyConnectionId);
  const { data: accounts } = await q;

  const tokens = new Map<string, string | null>();
  const results: Array<{ ad_account_id: string; rows: number; error: string | null }> = [];

  for (const acc of accounts ?? []) {
    let token = tokens.get(acc.connection_id) ?? null;
    if (!tokens.has(acc.connection_id)) {
      const { data: conn } = await supabase
        .from("meta_connections")
        .select("access_token_encrypted,status")
        .eq("id", acc.connection_id)
        .maybeSingle();
      try {
        token = conn?.access_token_encrypted
          ? await decryptToken(conn.access_token_encrypted)
          : null;
      } catch {
        token = null;
      }
      tokens.set(acc.connection_id, token);
    }
    if (!token) {
      results.push({
        ad_account_id: acc.ad_account_id,
        rows: 0,
        error: "conexão sem token válido",
      });
      continue;
    }
    const r = await syncAccountInsights(supabase, acc, token, since, until);
    results.push({ ad_account_id: acc.ad_account_id, ...r });
  }
  return results;
}
