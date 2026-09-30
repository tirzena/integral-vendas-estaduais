/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";

/**
 * Descadastro real de e-mail. O link vem assinado e com validade; um clique
 * (ou o botão do próprio provedor de e-mail) coloca o endereço na lista de
 * supressão e revoga o consentimento do canal.
 */

function page(title: string, message: string, ok = true) {
  return new Response(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" /><title>${title}</title></head>
<body style="font-family:system-ui,sans-serif;background:#0f1020;color:#f4f4f8;display:grid;place-items:center;min-height:100vh;margin:0">
<main style="max-width:520px;padding:32px;text-align:center">
<h1 style="font-size:22px;margin-bottom:12px">${title}</h1>
<p style="opacity:.8;line-height:1.6">${message}</p></main></body></html>`,
    { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

async function unsubscribe(jobId: string, token: string) {
  const { verifyUnsubscribeToken } = await import("@/lib/campaign-tokens.server");
  if (!jobId || !(await verifyUnsubscribeToken(jobId, token))) return false;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: job } = await supabaseAdmin
    .from("message_jobs")
    .select("id,channel,to_address,recipient_id")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return false;

  await supabaseAdmin.from("message_suppression").upsert(
    {
      channel: job.channel,
      address: job.to_address,
      reason: "descadastro solicitado pelo destinatário",
    },
    { onConflict: "channel,address" },
  );

  const { data: recipient } = await supabaseAdmin
    .from("campaign_recipients")
    .select("customer_id")
    .eq("id", job.recipient_id as string)
    .maybeSingle();

  if (recipient?.customer_id) {
    await supabaseAdmin.from("message_consents").upsert(
      {
        customer_id: recipient.customer_id,
        channel: job.channel,
        status: "opt_out",
        source: "link de descadastro",
        legal_basis: "revogação do titular (LGPD art. 8º, §5º)",
        evidence: `Descadastro pelo link do e-mail em ${new Date().toISOString()}`,
        revoked_at: new Date().toISOString(),
      },
      { onConflict: "customer_id,channel" },
    );
  }

  await supabaseAdmin
    .from("message_jobs")
    .update({ status: "cancelado", error: "Descadastro solicitado" })
    .eq("recipient_id", job.recipient_id as string)
    .in("status", ["na_fila", "falhou"]);

  return true;
}

export const Route = createFileRoute("/api/public/descadastro")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const ok = await unsubscribe(
          url.searchParams.get("job") ?? "",
          url.searchParams.get("t") ?? "",
        );
        return ok
          ? page("Descadastro concluído", "Você não receberá mais mensagens desta lista.")
          : page("Link inválido", "Este link de descadastro expirou ou não é válido.", false);
      },
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const ok = await unsubscribe(
          url.searchParams.get("job") ?? "",
          url.searchParams.get("t") ?? "",
        );
        return new Response(ok ? "ok" : "invalid", { status: ok ? 200 : 400 });
      },
    },
  },
});
