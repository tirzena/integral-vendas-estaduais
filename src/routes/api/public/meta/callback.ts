import { createFileRoute } from "@tanstack/react-router";
import { safeReturnPath } from "@/lib/meta-paths";

function redirectTo(path: string) {
  return new Response(null, { status: 302, headers: { Location: path } });
}

export const Route = createFileRoute("/api/public/meta/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const {
          adminClient,
          decryptToken,
          discoverAccounts,
          discoverDataset,
          encryptToken,
          exchangeCode,
          graphGet,
          metaConfigured,
          safeMessage,
          toLongLivedToken,
          META_SCOPES,
        } = await import("@/lib/meta.server");

        const url = new URL(request.url);
        const state = url.searchParams.get("state") ?? "";
        const code = url.searchParams.get("code");
        const metaError =
          url.searchParams.get("error_description") ?? url.searchParams.get("error");

        if (!metaConfigured()) return redirectTo("/trafego-pago?meta=nao_configurado");
        if (!state) return redirectTo("/trafego-pago?meta=estado_invalido");

        const admin = adminClient();
        const { data: stateRow } = await admin
          .from("meta_oauth_states")
          .select("state,user_id,redirect_uri,return_path,used_at,expires_at")
          .eq("state", state)
          .maybeSingle();

        if (!stateRow || stateRow.used_at || new Date(stateRow.expires_at) < new Date()) {
          return redirectTo("/trafego-pago?meta=estado_invalido");
        }
        // uso único: marca imediatamente
        const { data: claimed } = await admin
          .from("meta_oauth_states")
          .update({ used_at: new Date().toISOString() })
          .eq("state", state)
          .is("used_at", null)
          .select("state")
          .maybeSingle();
        if (!claimed) return redirectTo("/trafego-pago?meta=estado_invalido");

        const returnPath = safeReturnPath(stateRow.return_path);

        if (metaError || !code) {
          console.error("[meta-oauth] autorização recusada:", safeMessage(metaError));
          return redirectTo(`${returnPath}?meta=recusado`);
        }

        try {
          const short = await exchangeCode(code, stateRow.redirect_uri);
          const long = await toLongLivedToken(short.token);
          const token = long.token;
          const expiresIn = long.expiresIn ?? short.expiresIn;

          const me = await graphGet<{ id: string; name?: string }>("me", token, {
            fields: "id,name",
          });
          const accounts = await discoverAccounts(token);

          const encrypted = await encryptToken(token);
          const expiresAt = expiresIn
            ? new Date(Date.now() + expiresIn * 1000).toISOString()
            : null;

          const { data: upserted, error: upsertError } = await admin
            .from("meta_connections")
            .upsert(
              {
                meta_user_id: me.id,
                meta_user_name: me.name ?? null,
                access_token_encrypted: encrypted,
                token_expires_at: expiresAt,
                scopes: [...META_SCOPES],
                status: "conectado",
                last_error: null,
                last_verified_at: new Date().toISOString(),
                connected_by: stateRow.user_id,
              },
              { onConflict: "meta_user_id" },
            )
            .select("id")
            .single();
          if (upsertError || !upserted) throw new Error("não foi possível guardar a conexão");
          const connectionId: string = upserted.id;

          if (accounts.length) {
            const { data: known } = await admin
              .from("meta_ad_accounts")
              .select("ad_account_id,is_active")
              .eq("connection_id", connectionId);
            const activeMap = new Map((known ?? []).map((k) => [k.ad_account_id, k.is_active]));
            await admin.from("meta_ad_accounts").upsert(
              accounts.map((a) => ({
                connection_id: connectionId,
                ...a,
                is_active: activeMap.get(a.ad_account_id) ?? false,
              })),
              { onConflict: "connection_id,ad_account_id" },
            );
            for (const account of accounts) {
              const dataset = await discoverDataset(token, account.ad_account_id).catch(() => null);
              if (dataset)
                await admin
                  .from("meta_ad_accounts")
                  .update({ dataset_id: dataset.id, dataset_name: dataset.name ?? null })
                  .eq("connection_id", connectionId)
                  .eq("ad_account_id", account.ad_account_id);
            }
          }

          // sanidade: token guardado precisa voltar a abrir
          await decryptToken(encrypted);

          return redirectTo(`${returnPath}?meta=conectado&conexao=${connectionId}`);
        } catch (error) {
          console.error("[meta-oauth] falha na conexão:", safeMessage(error));
          return redirectTo(`${returnPath}?meta=erro`);
        }
      },
    },
  },
});
