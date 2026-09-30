import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { safeReturnPath } from "@/lib/meta-paths";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MetaAccount = {
  id: string;
  connection_id: string;
  ad_account_id: string;
  name: string | null;
  business_id: string | null;
  business_name: string | null;
  currency: string | null;
  timezone_name: string | null;
  account_status: number | null;
  is_active: boolean;
  last_synced_at: string | null;
  last_sync_status: string | null;
  last_sync_message: string | null;
  product_ids: string[];
};

export type MetaConnection = {
  id: string;
  meta_user_id: string;
  meta_user_name: string | null;
  status: string;
  scopes: string[];
  token_expires_at: string | null;
  last_verified_at: string | null;
  last_error: string | null;
  created_at: string;
  accounts: MetaAccount[];
};

export type MetaStatus = {
  configured: boolean;
  missingSecrets: string[];
  appId: string | null;
  callbackUrl: string;
  scopes: string[];
  connections: MetaConnection[];
  logs: Array<{
    id: string;
    status: string;
    rows_upserted: number;
    message: string | null;
    finished_at: string | null;
    meta_ad_account_id: string | null;
  }>;
};

function callbackUrlFor(origin: string) {
  return `${origin}/api/public/meta/callback`;
}

function requestOrigin(): string {
  const request = getRequest();
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = forwardedHost ?? url.host;
  return `${proto}://${host}`;
}

async function assertAdmin(context: { supabase: unknown; userId: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = context.supabase as any;
  const { data, error } = await supabase.rpc("is_admin", { _user_id: context.userId });
  if (error || !data) throw new Error("Apenas administradores podem gerenciar a conexão da Meta.");
}

/* ------------------------------- leitura --------------------------------- */

export const getMetaStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MetaStatus> => {
    await assertAdmin(context);
    const { adminClient, META_SCOPES, metaAppId } = await import("@/lib/meta.server");
    const missingSecrets = (
      ["META_APP_ID", "META_APP_SECRET", "META_TOKEN_ENCRYPTION_KEY"] as const
    ).filter((name) => !process.env[name]);

    const admin = adminClient();
    const [{ data: connections }, { data: accounts }, { data: links }, { data: logs }] =
      await Promise.all([
        admin
          .from("meta_connections")
          .select(
            "id,meta_user_id,meta_user_name,status,scopes,token_expires_at,last_verified_at,last_error,created_at",
          )
          .order("created_at", { ascending: true }),
        admin.from("meta_ad_accounts").select("*").order("business_name"),
        admin.from("meta_ad_account_products").select("meta_ad_account_id,product_id"),
        admin
          .from("meta_sync_logs")
          .select("id,status,rows_upserted,message,finished_at,meta_ad_account_id")
          .order("started_at", { ascending: false })
          .limit(20),
      ]);

    const productsByAccount = new Map<string, string[]>();
    for (const l of links ?? []) {
      const list = productsByAccount.get(l.meta_ad_account_id) ?? [];
      list.push(l.product_id);
      productsByAccount.set(l.meta_ad_account_id, list);
    }

    return {
      configured: missingSecrets.length === 0,
      missingSecrets,
      appId: metaAppId(),
      callbackUrl: callbackUrlFor(requestOrigin()),
      scopes: [...META_SCOPES],
      connections: (connections ?? []).map((c) => ({
        ...c,
        scopes: c.scopes ?? [],
        accounts: (accounts ?? [])
          .filter((a) => a.connection_id === c.id)
          .map((a) => ({ ...a, product_ids: productsByAccount.get(a.id) ?? [] })) as MetaAccount[],
      })) as MetaConnection[],
      logs: logs ?? [],
    };
  });

/* -------------------------------- OAuth ---------------------------------- */

export const startMetaOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { returnPath?: string }) => ({
    returnPath: safeReturnPath(input?.returnPath),
  }))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { adminClient, metaAppId, metaConfigured, META_SCOPES } = await import(
      "@/lib/meta.server"
    );
    if (!metaConfigured()) {
      throw new Error(
        "A conexão com a Meta ainda não está configurada no servidor. Cadastre META_APP_ID, META_APP_SECRET e META_TOKEN_ENCRYPTION_KEY.",
      );
    }
    const redirectUri = callbackUrlFor(requestOrigin());
    const state = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
    const admin = adminClient();
    const { error } = await admin.from("meta_oauth_states").insert({
      state,
      user_id: context.userId,
      redirect_uri: redirectUri,
      return_path: data.returnPath,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    if (error) throw new Error("Não foi possível iniciar a autorização. Tente novamente.");

    const url = new URL("https://www.facebook.com/v21.0/dialog/oauth");
    url.searchParams.set("client_id", metaAppId()!);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", META_SCOPES.join(","));
    return { url: url.toString(), callbackUrl: redirectUri };
  });

/* ----------------------------- contas / vínculos -------------------------- */

export const setAccountsActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { accountIds: string[]; active: boolean }) => ({
    accountIds: Array.isArray(input?.accountIds) ? input.accountIds.map(String) : [],
    active: Boolean(input?.active),
  }))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    if (!data.accountIds.length) return { updated: 0 };
    const { adminClient } = await import("@/lib/meta.server");
    const admin = adminClient();
    const { error } = await admin
      .from("meta_ad_accounts")
      .update({ is_active: data.active })
      .in("id", data.accountIds);
    if (error) throw new Error("Não foi possível atualizar as contas selecionadas.");
    return { updated: data.accountIds.length };
  });

export const setAccountProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { accountId: string; productIds: string[] }) => ({
    accountId: String(input?.accountId ?? ""),
    productIds: Array.isArray(input?.productIds) ? input.productIds.map(String) : [],
  }))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { adminClient } = await import("@/lib/meta.server");
    const admin = adminClient();
    await admin.from("meta_ad_account_products").delete().eq("meta_ad_account_id", data.accountId);
    if (data.productIds.length) {
      const { error } = await admin.from("meta_ad_account_products").insert(
        data.productIds.map((product_id) => ({
          meta_ad_account_id: data.accountId,
          product_id,
        })),
      );
      if (error) throw new Error("Não foi possível vincular as categorias.");
      // mantém as métricas já salvas apontando para a primeira categoria vinculada
      await admin
        .from("ad_metrics")
        .update({ product_id: data.productIds[0]! })
        .eq("meta_ad_account_id", data.accountId);
    }
    return { ok: true };
  });

/* ------------------------------ sincronização ----------------------------- */

export const syncMetaNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { connectionId?: string; days?: number }) => ({
    connectionId: input?.connectionId ? String(input.connectionId) : undefined,
    days: Math.min(Math.max(Number(input?.days ?? 30) || 30, 1), 180),
  }))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { adminClient, syncAllAccounts } = await import("@/lib/meta.server");
    const results = await syncAllAccounts(adminClient(), data.days, data.connectionId);
    return {
      accounts: results.length,
      rows: results.reduce((s, r) => s + r.rows, 0),
      errors: results.filter((r) => r.error).map((r) => `${r.ad_account_id}: ${r.error}`),
    };
  });

export const verifyMetaConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { connectionId: string }) => ({
    connectionId: String(input?.connectionId ?? ""),
  }))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { adminClient, decryptToken, graphGet, safeMessage } = await import("@/lib/meta.server");
    const admin = adminClient();
    const { data: conn } = await admin
      .from("meta_connections")
      .select("id,access_token_encrypted")
      .eq("id", data.connectionId)
      .maybeSingle();
    if (!conn) throw new Error("Conexão não encontrada.");
    if (!conn.access_token_encrypted) throw new Error("Conexão desconectada. Conecte novamente.");
    try {
      const token = await decryptToken(conn.access_token_encrypted);

      const me = await graphGet<{ id: string; name?: string }>("me", token, { fields: "id,name" });
      await admin
        .from("meta_connections")
        .update({
          status: "conectado",
          last_error: null,
          last_verified_at: new Date().toISOString(),
          meta_user_name: me.name ?? null,
        })
        .eq("id", conn.id);
      return { status: "conectado" as const };
    } catch (error) {
      const message = safeMessage(error);
      await admin
        .from("meta_connections")
        .update({ status: "expirado", last_error: message })
        .eq("id", conn.id);
      return { status: "expirado" as const, message };
    }
  });

export const disconnectMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { connectionId: string }) => ({
    connectionId: String(input?.connectionId ?? ""),
  }))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { adminClient } = await import("@/lib/meta.server");
    const admin = adminClient();
    await admin
      .from("meta_ad_accounts")
      .update({ is_active: false })
      .eq("connection_id", data.connectionId);
    const { error } = await admin
      .from("meta_connections")
      .update({
        status: "desconectado",
        access_token_encrypted: null,
        token_expires_at: null,
        last_error: null,
      })
      .eq("id", data.connectionId);
    if (error) throw new Error("Não foi possível desconectar.");
    return { ok: true };
  });
