import { createFileRoute } from "@tanstack/react-router";

/**
 * Rotina diária de sincronização das contas de anúncios da Meta.
 * Deve ser chamada com o cabeçalho x-cron-secret igual ao segredo LOVABLE_CRON_SECRET.
 */
export const Route = createFileRoute("/api/public/meta/sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["LOVABLE_CRON_SECRET"];
        const provided = request.headers.get("x-cron-secret");
        if (!expected || !provided || provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { adminClient, metaConfigured, syncAllAccounts, safeMessage } = await import(
          "@/lib/meta.server"
        );
        if (!metaConfigured()) {
          return Response.json({ ok: false, reason: "meta_nao_configurada" }, { status: 200 });
        }
        try {
          const results = await syncAllAccounts(adminClient(), 7);
          return Response.json({
            ok: true,
            accounts: results.length,
            rows: results.reduce((s, r) => s + r.rows, 0),
            errors: results.filter((r) => r.error).length,
          });
        } catch (error) {
          console.error("[meta-sync] falha geral:", safeMessage(error));
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
