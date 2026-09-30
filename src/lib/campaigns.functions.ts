/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { invokeEvolution } from "@/lib/supabase-evolution.server";

/**
 * Envio real das campanhas. Nada é simulado: quando o provedor não está
 * configurado, o disparo é recusado com uma mensagem clara.
 */

type Channel = "whatsapp" | "email" | "sms";

async function providerStatus(context: any) {
  const env = process.env;
  let whatsappConfigured = false;
  try {
    const whatsapp = await invokeEvolution(context, "status");
    whatsappConfigured = Boolean(whatsapp.configured);
  } catch {
    whatsappConfigured = false;
  }
  return {
    whatsapp: {
      configured: whatsappConfigured,
      provider: "WhatsApp (Evolution API)",
      secrets: ["Configuração central do WhatsApp"],
    },
    email: {
      configured: Boolean(env["RESEND_API_KEY"] && env["CAMPAIGNS_EMAIL_FROM"]),
      provider: "Resend",
      secrets: ["RESEND_API_KEY", "CAMPAIGNS_EMAIL_FROM"],
    },
    sms: {
      configured: Boolean(
        env["TWILIO_ACCOUNT_SID"] && env["TWILIO_AUTH_TOKEN"] && env["TWILIO_FROM_NUMBER"],
      ),
      provider: "Twilio",
      secrets: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"],
    },
  } as Record<Channel, { configured: boolean; provider: string; secrets: string[] }>;
}

async function assertManager(context: any) {
  const { data } = await context.supabase.rpc("campaigns_can_manage", {
    _user_id: context.userId,
  });
  if (!data) throw new Error("Você não tem permissão para disparar campanhas.");
}

/** Situação de cada provedor (sem expor nenhum segredo). */
export const getProviderStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const s = await providerStatus(context);
    return {
      whatsapp: { configured: s.whatsapp.configured, provider: s.whatsapp.provider },
      email: { configured: s.email.configured, provider: s.email.provider },
      sms: { configured: s.sms.configured, provider: s.sms.provider },
    };
  });

type SendResult = { ok: true; id: string | null } | { ok: false; error: string };

type WhatsappOptions = {
  mediaUrl?: string | null;
  mediaMime?: string | null;
  mediaName?: string | null;
};

/**
 * Envio pelo WhatsApp conectado na Evolution API. O navegador nunca fala com
 * o servidor de WhatsApp: só este código, com a conta já conectada.
 */
async function sendWhatsapp(
  context: any,
  accountId: string,
  to: string,
  body: string,
  opts: WhatsappOptions = {},
): Promise<SendResult> {
  try {
    const { mediaKind } = await import("@/lib/whatsapp");
    const kind = opts.mediaUrl ? mediaKind(opts.mediaMime) : null;
    const res = await invokeEvolution(context, "send", {
      accountId,
      number: to,
      text: body,
      ...(kind
        ? {
            media: {
              mediatype: kind,
              mimetype: opts.mediaMime ?? "",
              url: opts.mediaUrl!,
              fileName: opts.mediaName ?? "arquivo",
            },
          }
        : {}),
    });
    if (!res.id) return { ok: false, error: "O WhatsApp não confirmou o envio." };
    return { ok: true, id: res.id };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? "Falha ao enviar pelo WhatsApp.") };
  }
}

async function sendEmail(
  to: string,
  subject: string,
  body: string,
  unsubscribeUrl: string,
): Promise<SendResult> {
  const key = process.env["RESEND_API_KEY"];
  const from = process.env["CAMPAIGNS_EMAIL_FROM"];
  if (!key || !from) return { ok: false, error: "E-mail não configurado." };
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6">${body
    .split("\n")
    .map((l) => `<p>${l.replace(/</g, "&lt;")}</p>`)
    .join("")}<hr /><p style="font-size:12px;color:#777">Para não receber mais estas mensagens, <a href="${unsubscribeUrl}">clique aqui para descadastrar</a>.</p></div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: json?.message ?? `Falha ${res.status}` };
  return { ok: true, id: json?.id ?? null };
}

async function sendSms(to: string, body: string): Promise<SendResult> {
  const sid = process.env["TWILIO_ACCOUNT_SID"];
  const token = process.env["TWILIO_AUTH_TOKEN"];
  const from = process.env["TWILIO_FROM_NUMBER"];
  if (!sid || !token || !from) return { ok: false, error: "SMS não configurado." };
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: json?.message ?? `Falha ${res.status}` };
  return { ok: true, id: json?.sid ?? null };
}

function rateLimitMs(channel: Channel) {
  const env = process.env;
  const custom = Number(env[`CAMPAIGNS_RATE_MS_${channel.toUpperCase()}`]);
  if (Number.isFinite(custom) && custom > 0) return Math.min(custom, 5000);
  return { whatsapp: 120, email: 60, sms: 250 }[channel];
}
const MAX_ATTEMPTS = 5;

/** Horário silencioso do fuso da campanha. */
function inQuietHours(now: Date, start: string, end: string, timeZone: string) {
  const hhmm = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  const s = (start ?? "21:00").slice(0, 5);
  const e = (end ?? "08:00").slice(0, 5);
  if (s === e) return false;
  return s < e ? hhmm >= s && hhmm < e : hhmm >= s || hhmm < e;
}

/**
 * Processa um lote da fila da campanha. Cada mensagem é reservada de forma
 * atômica no banco (nenhum outro processador pega a mesma), tem consentimento
 * e supressão revalidados na hora, respeita limite de taxa e horário
 * silencioso, e só conta como enviada com o identificador do provedor.
 */
export const runCampaignBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { campaignId: string; batchSize?: number }) => {
    if (!input?.campaignId) throw new Error("Campanha inválida.");
    const size = Math.floor(Number(input.batchSize ?? 50));
    if (!Number.isFinite(size) || size < 1 || size > 100) {
      throw new Error("O tamanho do lote precisa ficar entre 1 e 100.");
    }
    return { campaignId: input.campaignId, batchSize: size };
  })
  .handler(async ({ data, context }) => {
    await assertManager(context);
    const supabase = context.supabase;
    const status = await providerStatus(context);

    const { data: campaign, error: cErr } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", data.campaignId)
      .single();
    if (cErr || !campaign) throw new Error("Campanha não encontrada.");
    if (!["agendada", "executando"].includes(campaign.status)) {
      throw new Error("A campanha precisa estar agendada ou executando.");
    }
    if (campaign.scheduled_at && new Date(campaign.scheduled_at) > new Date()) {
      throw new Error("A campanha ainda não chegou no horário agendado.");
    }
    if (
      inQuietHours(
        new Date(),
        campaign.quiet_start,
        campaign.quiet_end,
        campaign.timezone || "America/Sao_Paulo",
      )
    ) {
      throw new Error("Estamos no horário silencioso desta campanha. Tente mais tarde.");
    }

    const channels: Channel[] = (campaign.channels ?? []) as Channel[];
    const missing = channels.filter((c) => !status[c]?.configured);
    if (missing.length) {
      throw new Error(
        `Provedor não configurado para: ${missing.join(", ")}. Configure em Configurações antes de disparar.`,
      );
    }

    // reserva atômica com lease: nenhum outro processador pega os mesmos envios
    const worker = `web-${crypto.randomUUID().slice(0, 8)}`;
    const { data: claimed, error: claimErr } = await supabase.rpc("campaigns_claim_jobs", {
      p_campaign_id: data.campaignId,
      p_limit: data.batchSize,
      p_worker: worker,
    });
    if (claimErr) throw new Error(claimErr.message);

    const queue = (claimed ?? []) as any[];
    if (!queue.length) {
      const { count } = await supabase
        .from("message_jobs")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", data.campaignId)
        .in("status", ["na_fila", "falhou", "processando"]);
      if (!count) {
        await supabase.rpc("campaigns_set_status", {
          p_campaign_id: data.campaignId,
          p_status: "concluida",
        });
        return { processed: 0, sent: 0, failed: 0, finished: true };
      }
      return { processed: 0, sent: 0, failed: 0, finished: false };
    }

    if (campaign.status !== "executando") {
      await supabase.rpc("campaigns_set_status", {
        p_campaign_id: data.campaignId,
        p_status: "executando",
      });
    }

    const origin = process.env["PUBLIC_SITE_URL"] ?? "";
    const { signUnsubscribeToken } = await import("@/lib/campaign-tokens.server");
    let sent = 0;
    let failed = 0;

    for (const job of queue) {
      let result: SendResult;
      try {
        // link de mídia assinado só no servidor, com validade curta
        let mediaUrl: string | null = job.media_url ?? null;
        if (!mediaUrl && job.media_path) {
          const { data: signed } = await supabase.storage
            .from("chat-anexos")
            .createSignedUrl(job.media_path, 900);
          mediaUrl = signed?.signedUrl ?? null;
        }

        if (job.channel === "whatsapp") {
          const accountId = job.whatsapp_account_id ?? campaign.whatsapp_account_id ?? null;
          if (!accountId) {
            result = { ok: false, error: "Escolha a conta de WhatsApp que vai enviar a campanha." };
          } else {
            const { data: acc } = await supabase
              .from("whatsapp_accounts")
              .select("instance_name,connection_status")
              .eq("id", accountId)
              .is("deleted_at", null)
              .maybeSingle();
            if (!acc?.instance_name || acc.connection_status !== "conectado") {
              result = { ok: false, error: "A conta de WhatsApp escolhida não está conectada." };
            } else {
              result = await sendWhatsapp(context, accountId, job.to_address, job.body, {
                mediaUrl,
                mediaMime: job.media_mime,
                mediaName: job.media_name ?? null,
              });
            }
          }
        } else if (job.channel === "email") {
          const token = await signUnsubscribeToken(job.id);
          result = await sendEmail(
            job.to_address,
            job.subject ?? campaign.subject ?? campaign.name,
            job.body,
            `${origin}/api/public/descadastro?job=${job.id}&t=${token}`,
          );
        } else {
          result = await sendSms(job.to_address, job.body);
        }
      } catch (e: any) {
        result = { ok: false, error: e?.message ?? "Falha inesperada no envio." };
      }

      const ok = result.ok && Boolean(result.id);
      if (ok) sent += 1;
      else failed += 1;

      await supabase.rpc("campaigns_finish_job", {
        p_job_id: job.id,
        p_ok: ok,
        p_provider: status[job.channel as Channel].provider,
        p_message_id: (result.ok ? result.id : null) ?? "",
        p_error: result.ok
          ? ok
            ? ""
            : "Provedor não devolveu identificador da mensagem."
          : result.error,
        p_max_attempts: MAX_ATTEMPTS,
      });

      await new Promise((r) => setTimeout(r, rateLimitMs(job.channel as Channel)));
    }

    return { processed: queue.length, sent, failed, finished: false };
  });

/** Mensagem de teste — exige provedor configurado e confirmação explícita. */
export const sendTestMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      channel: Channel;
      to: string;
      subject?: string;
      body: string;
      confirm: boolean;
    }) => {
      if (!input?.to || !input?.body) throw new Error("Informe o destino e o texto.");
      if (input.body.length > 4000) throw new Error("Texto muito longo.");
      if (!input.confirm) throw new Error("Confirme o envio do teste.");
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    await assertManager(context);
    const status = await providerStatus(context);
    if (!status[data.channel]?.configured) {
      throw new Error(`${data.channel} não configurado. Configure o provedor antes de testar.`);
    }
    if (data.channel === "whatsapp") {
      throw new Error(
        "O teste por WhatsApp é feito pela Caixa de entrada, com a conta conectada escolhida.",
      );
    }
    const result =
      data.channel === "email"
        ? await sendEmail(data.to, data.subject ?? "Teste", data.body, "")
        : await sendSms(data.to, data.body);
    if (!result.ok) throw new Error(result.error);
    return { ok: true };
  });
