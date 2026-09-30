/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Operações de WhatsApp feitas no servidor. O navegador nunca fala com a
 * Evolution API: toda chamada valida sessão, papel, categoria e conta.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { invokeEvolution, newWhatsappInstanceName } from "@/lib/supabase-evolution.server";
import { mediaKind, MEDIA_MAX_BYTES, normalizePhone, phoneToJid } from "@/lib/whatsapp";

/** Limite por usuário guardado no banco: vale para todos os servidores. */
async function rateLimit(context: any, key: string, max: number, windowSeconds = 60) {
  const { data, error } = await context.supabase.rpc("whatsapp_rate_hit", {
    _key: key,
    _max: max,
    _window_seconds: windowSeconds,
  });
  if (error) return; // limite indisponível não deve travar a operação
  if (data === false) {
    throw new Error("Muitas ações seguidas. Aguarde um instante e tente de novo.");
  }
}

async function assertManager(context: any) {
  const { data } = await context.supabase.rpc("whatsapp_can_manage");
  if (!data) throw new Error("Você não tem permissão para gerenciar contas de WhatsApp.");
}

async function assertAdmin(context: any) {
  const { data } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (!data) throw new Error("Apenas administradores podem executar esta ação.");
}

async function assertProductAccess(context: any, productId: string) {
  const { data } = await context.supabase.rpc("has_product_access", {
    _user_id: context.userId,
    _product_id: productId,
  });
  if (!data) throw new Error("Você não tem acesso a esta categoria.");
}

/** Conta do escopo do usuário; joga erro amigável quando não pode usar. */
async function loadAccount(context: any, accountId: string) {
  const { data: visible } = await context.supabase.rpc("whatsapp_account_visible", {
    _account_id: accountId,
  });
  if (!visible) throw new Error("Conta de WhatsApp não encontrada no seu acesso.");
  const { data } = await (context.supabase as any)
    .from("whatsapp_accounts")
    .select("id,instance_name,display_name,product_id,product_ids,connection_status,deleted_at")
    .eq("id", accountId)
    .maybeSingle();
  if (!data || data.deleted_at) throw new Error("Conta de WhatsApp indisponível.");
  return data as any;
}

/** Situação da integração, sem revelar URL, chave ou segredo. */
export const getWhatsappIntegrationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const status = await invokeEvolution(context, "status");
    return {
      provider: "Evolution API",
      configured: Boolean(status.configured),
      missing: status.configured ? [] : ["Configuração central do WhatsApp"],
    };
  });

/** Cria SEMPRE uma nova conta/instância; nunca substitui as existentes. */
export const createWhatsappAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { displayName: string; productIds: string[] }) => {
    const displayName = String(input?.displayName ?? "").trim();
    const productIds = [...new Set(Array.isArray(input?.productIds) ? input.productIds : [])];
    if (displayName.length < 2 || displayName.length > 60) {
      throw new Error("Informe um nome interno com 2 a 60 caracteres.");
    }
    if (!productIds.length || productIds.length > 100 || productIds.some((id) =>
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
      throw new Error("Escolha uma ou mais categorias válidas.");
    }
    return { displayName, productIds, productId: productIds[0] };
  })
  .handler(async ({ data, context }) => {
    await assertManager(context);
    for (const id of data.productIds) await assertProductAccess(context, id);
    await rateLimit(context, `create:${context.userId}`, 5);

    const instanceName = newWhatsappInstanceName();

    const { data: account, error } = await (context.supabase as any)
      .from("whatsapp_accounts")
      .insert({
        provider: "evolution",
        instance_name: instanceName,
        display_name: data.displayName,
        product_id: data.productId,
        product_ids: data.productIds,
        status: "pendente",
        connection_status: "conectando",
        demo_mode: false,
        created_by: context.userId,
      })
      .select("id,instance_name,display_name,product_id,connection_status")
      .single();
    if (error) throw new Error("Não foi possível registrar a conta.");

    try {
      const qr = await invokeEvolution(context, "create", { accountId: account.id });
      await context.supabase
        .from("whatsapp_accounts")
        .update({
          connection_status: qr.qrBase64 ? "aguardando_qr" : "conectando",
          webhook_configured_at: new Date().toISOString(),
          last_error: null,
          last_seen_at: new Date().toISOString(),
        })
        .eq("id", account.id);
      return { accountId: account.id, ...qr };
    } catch (e: any) {
      await context.supabase
        .from("whatsapp_accounts")
        .update({
          connection_status: "erro",
          last_error: String(e?.message ?? "Falha ao criar instância.").slice(0, 200),
        })
        .eq("id", account.id);
      throw e;
    }
  });

/** QR Code atual da conta escolhida (gerado na hora pelo servidor). */
export const getWhatsappQrCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { accountId: string }) => {
    if (!input?.accountId) throw new Error("Conta inválida.");
    return { accountId: input.accountId };
  })
  .handler(async ({ data, context }) => {
    await assertManager(context);
    const account = await loadAccount(context, data.accountId);
    await rateLimit(context, `qr:${context.userId}`, 30);
    const qr = await invokeEvolution(context, "qr", { accountId: account.id });
    if (qr.connected) {
      await context.supabase
        .from("whatsapp_accounts")
        .update({
          connection_status: "conectado",
          status: "conectado",
          connected_at: new Date().toISOString(),
        })
        .eq("id", account.id);
      return { connected: true, qrBase64: null, pairingCode: null };
    }
    await context.supabase
      .from("whatsapp_accounts")
      .update({
        connection_status: qr.qrBase64 ? "aguardando_qr" : "conectando",
        last_seen_at: new Date().toISOString(),
      })
      .eq("id", account.id);
    return { connected: false, ...qr };
  });

/** Confere no servidor o estado real e o webhook, só da conta escolhida. */
export const checkWhatsappAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { accountId: string; fixWebhook?: boolean }) => {
    if (!input?.accountId) throw new Error("Conta inválida.");
    return { accountId: input.accountId, fixWebhook: input.fixWebhook !== false };
  })
  .handler(async ({ data, context }) => {
    await assertManager(context);
    const account = await loadAccount(context, data.accountId);
    await rateLimit(context, `check:${context.userId}`, 60);
    const result = await invokeEvolution(context, "check", {
      accountId: account.id,
      fixWebhook: data.fixWebhook,
    });
    const state = result.status;
    const hookFixed = Boolean(result.webhookFixed);

    const phone = result.ownerJid ? normalizePhone(String(result.ownerJid).split("@")[0]) : null;
    await context.supabase
      .from("whatsapp_accounts")
      .update({
        connection_status: state,
        status: state === "conectado" ? "conectado" : "pendente",
        owner_jid: result.ownerJid ?? null,
        profile_name: result.profileName ?? null,
        phone_e164: phone,
        display_phone_number: phone,
        last_seen_at: new Date().toISOString(),
        last_error: null,
        ...(state === "conectado" ? { connected_at: new Date().toISOString() } : {}),
        ...(hookFixed ? { webhook_configured_at: new Date().toISOString() } : {}),
      })
      .eq("id", account.id);

    return { status: state, webhookOk: Boolean(result.webhookOk), webhookFixed: hookFixed };
  });

/** Importa para a caixa de entrada o histórico que já existe na instância. */
export const syncWhatsappConversations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { accountId: string }) => {
    if (!input?.accountId) throw new Error("Conta inválida.");
    return { accountId: input.accountId };
  })
  .handler(async ({ data, context }) => {
    await assertManager(context);
    const account = await loadAccount(context, data.accountId);
    await rateLimit(context, `sync:${context.userId}`, 6, 300);
    return invokeEvolution(context, "sync", { accountId: account.id });
  });

/** Desconecta apenas a conta escolhida (a instância continua existindo). */
export const disconnectWhatsappAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { accountId: string }) => {
    if (!input?.accountId) throw new Error("Conta inválida.");
    return { accountId: input.accountId };
  })
  .handler(async ({ data, context }) => {
    await assertManager(context);
    const account = await loadAccount(context, data.accountId);
    await invokeEvolution(context, "disconnect", { accountId: account.id });
    await context.supabase
      .from("whatsapp_accounts")
      .update({
        connection_status: "desconectado",
        status: "pendente",
        disconnected_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      })
      .eq("id", account.id);
    return { ok: true };
  });

/** Remoção administrativa: apaga a instância e faz exclusão lógica local. */
export const removeWhatsappAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { accountId: string }) => {
    if (!input?.accountId) throw new Error("Conta inválida.");
    return { accountId: input.accountId };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const account = await loadAccount(context, data.accountId);
    await invokeEvolution(context, "remove", { accountId: account.id });
    await context.supabase
      .from("whatsapp_accounts")
      .update({
        connection_status: "desconectado",
        status: "removido",
        deleted_at: new Date().toISOString(),
        disconnected_at: new Date().toISOString(),
      })
      .eq("id", account.id);
    // histórico de conversas e mensagens é preservado
    return { ok: true };
  });

/** Envia mensagem real pelo WhatsApp da conta da conversa. */
export const sendWhatsappMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      conversationId: string;
      text?: string;
      mediaPath?: string | null;
      mediaMime?: string | null;
      mediaName?: string | null;
      mediaSize?: number | null;
      idempotencyKey: string;
    }) => {
      if (!input?.conversationId) throw new Error("Conversa inválida.");
      const text = String(input.text ?? "").trim();
      if (!text && !input.mediaPath) throw new Error("Escreva uma mensagem ou anexe um arquivo.");
      if (text.length > 4000) throw new Error("A mensagem pode ter no máximo 4000 caracteres.");
      if (input.mediaSize && input.mediaSize > MEDIA_MAX_BYTES) {
        throw new Error("O arquivo passa do limite de 16 MB.");
      }
      if (input.mediaPath && !mediaKind(input.mediaMime)) {
        throw new Error("Tipo de arquivo não aceito.");
      }
      if (!input.idempotencyKey || input.idempotencyKey.length < 8) {
        throw new Error("Requisição inválida.");
      }
      return {
        conversationId: input.conversationId,
        text,
        mediaPath: input.mediaPath ?? null,
        mediaMime: input.mediaMime ?? null,
        mediaName: input.mediaName ?? null,
        idempotencyKey: input.idempotencyKey,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    await rateLimit(context, `send:${context.userId}`, 60);

    const { data: conversation } = await supabase
      .from("whatsapp_conversations")
      .select("id,account_id,contact_phone,remote_jid,product_id")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (!conversation) throw new Error("Conversa não encontrada no seu acesso.");
    if (!conversation.account_id)
      throw new Error("Esta conversa não está ligada a uma conta conectada.");

    const account = await loadAccount(context, conversation.account_id);
    if (account.connection_status !== "conectado") {
      throw new Error("A conta de WhatsApp desta conversa não está conectada.");
    }

    const phone = normalizePhone(conversation.contact_phone);
    if (!phone) throw new Error("O contato desta conversa não tem número válido.");

    // Gravações do histórico são feitas pelo servidor, já com o acesso validado acima.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // mesma chave: só repete quando o envio anterior deu certo ou ainda está em curso
    const { data: dup } = await supabaseAdmin
      .from("whatsapp_messages")
      .select("id,status")
      .eq("conversation_id", conversation.id)
      .eq("idempotency_key", data.idempotencyKey)
      .maybeSingle();
    if (dup && dup.status !== "falhou") {
      return { ok: true, messageId: dup.id, duplicated: true };
    }

    let pendingId: string = dup?.id ?? "";
    if (pendingId) {
      await supabaseAdmin
        .from("whatsapp_messages")
        .update({ status: "enviando", error: null, failed_at: null })
        .eq("id", pendingId);
    } else {
      const { data: pending, error: insErr } = await supabaseAdmin
        .from("whatsapp_messages")
        .insert({
          conversation_id: conversation.id,
          account_id: account.id,
          direction: "outbound",
          from_me: true,
          message_type: data.mediaPath ? (mediaKind(data.mediaMime) ?? "document") : "text",
          body: data.text || null,
          media_url: data.mediaPath,
          mime_type: data.mediaMime,
          media_meta: data.mediaName ? { fileName: data.mediaName } : {},
          sender_id: context.userId,
          is_internal_note: false,
          status: "enviando",
          idempotency_key: data.idempotencyKey,
        })
        .select("id")
        .single();
      if (insErr || !pending) throw new Error("Não foi possível registrar a mensagem.");
      pendingId = pending.id;
    }

    try {
      let media: Record<string, unknown> | undefined;

      if (data.mediaPath) {
        const { data: signed } = await supabase.storage
          .from("chat-anexos")
          .createSignedUrl(data.mediaPath, 300);
        if (!signed?.signedUrl) throw new Error("Não foi possível preparar o anexo.");
        const kind = mediaKind(data.mediaMime)!;
        media = {
          mediatype: kind,
          mimetype: data.mediaMime ?? "application/octet-stream",
          url: signed.signedUrl,
          fileName: data.mediaName ?? "arquivo",
        };
      }
      const sent = await invokeEvolution(context, "send", {
        accountId: account.id,
        number: phone,
        text: data.text,
        ...(media ? { media } : {}),
      });
      const providerId = sent.id ?? null;

      await supabaseAdmin
        .from("whatsapp_messages")
        .update({
          status: "enviada",
          provider_message_id: providerId,
          remote_jid: conversation.remote_jid,
          provider_timestamp: new Date().toISOString(),
        })
        .eq("id", pendingId);

      await supabaseAdmin
        .from("whatsapp_conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", conversation.id);

      return { ok: true, messageId: pendingId, duplicated: false };
    } catch (e: any) {
      const message = String(e?.message ?? "Falha no envio.").slice(0, 200);
      await supabaseAdmin
        .from("whatsapp_messages")
        .update({ status: "falhou", failed_at: new Date().toISOString(), error: message })
        .eq("id", pendingId);
      throw new Error(message);
    }
  });

export const startWhatsappConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { accountId: string; phone: string; name?: string; productId?: string }) => {
    const phone = normalizePhone(input?.phone);
    if (!input?.accountId) throw new Error("Escolha a conta do WhatsApp.");
    if (!phone) throw new Error("Informe o número com DDD e código do país.");
    return { accountId: input.accountId, phone, name: String(input.name ?? "").trim().slice(0, 100), productId: input.productId };
  })
  .handler(async ({ data, context }) => {
    const account = await loadAccount(context, data.accountId);
    if (account.connection_status !== "conectado") throw new Error("A conta escolhida não está conectada.");
    const chosenProductId = data.productId || account.product_id;
    if (!(account.product_ids?.length ? account.product_ids : [account.product_id]).includes(chosenProductId)) {
      throw new Error("Esta conta não atende à categoria escolhida.");
    }
    await assertProductAccess(context, chosenProductId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("whatsapp_conversations")
      .select("id")
      .eq("account_id", account.id)
      .eq("contact_phone", data.phone)
      .maybeSingle();
    if (existing) return { id: existing.id };
    const { data: created, error } = await supabaseAdmin
      .from("whatsapp_conversations")
      .insert({
        account_id: account.id,
        product_id: chosenProductId,
        contact_phone: data.phone,
        contact_name: data.name || null,
        remote_jid: phoneToJid(data.phone),
        status: "aberta",
        unread_count: 0,
        last_message_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error || !created) throw new Error("Não foi possível iniciar o atendimento.");
    return { id: created.id };
  });

/** Apaga no WhatsApp uma mensagem enviada pela equipe e preserva o registro de auditoria. */
export const deleteWhatsappMessageForEveryone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { messageId: string }) => {
    if (!input?.messageId) throw new Error("Mensagem inválida.");
    return { messageId: input.messageId };
  })
  .handler(async ({ data, context }) => {
    await rateLimit(context, `delete:${context.userId}`, 20);
    const { data: message } = await context.supabase
      .from("whatsapp_messages")
      .select(
        "id,conversation_id,account_id,provider_message_id,remote_jid,participant_jid,from_me,is_internal_note,status",
      )
      .eq("id", data.messageId)
      .maybeSingle();
    if (
      !message ||
      !message.from_me ||
      message.is_internal_note ||
      !message.provider_message_id ||
      !message.remote_jid
    ) {
      throw new Error("Só é possível apagar para todos mensagens enviadas pelo WhatsApp.");
    }
    if (message.status === "apagada") return { ok: true };
    if (!message.account_id) throw new Error("A mensagem não está ligada a uma conta.");
    await loadAccount(context, message.account_id);
    await invokeEvolution(context, "delete", {
      accountId: message.account_id,
      messageId: message.provider_message_id,
      remoteJid: message.remote_jid,
      participant: message.participant_jid,
    });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("whatsapp_messages")
      .update({ status: "apagada", body: null })
      .eq("id", message.id);
    return { ok: true };
  });

export const updateWhatsappConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      conversationId: string;
      action: "archive" | "pin" | "rename" | "delete" | "profile";
      value?: string | boolean;
    }) => {
      if (!input?.conversationId) throw new Error("Conversa inválida.");
      return { conversationId: input.conversationId, action: input.action, value: input.value };
    },
  )
  .handler(async ({ data, context }) => {
    const { data: conversation } = await context.supabase
      .from("whatsapp_conversations")
      .select("id,account_id,contact_phone,customer_id,archived_at,pinned_at")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (!conversation) throw new Error("Conversa não encontrada.");
    if (data.action === "delete") {
      const { error } = await context.supabase
        .from("whatsapp_conversations")
        .delete()
        .eq("id", conversation.id);
      if (error) throw new Error("Apenas administradores podem excluir este atendimento.");
      return { ok: true };
    }
    if (data.action === "profile") {
      if (!conversation.account_id) throw new Error("Conta do WhatsApp indisponível.");
      const result = await invokeEvolution(context, "profile", {
        accountId: conversation.account_id,
        number: conversation.contact_phone,
      });
      await context.supabase
        .from("whatsapp_conversations")
        .update({ profile_picture_url: result.url ?? null })
        .eq("id", conversation.id);
      return { ok: true, url: result.url ?? null };
    }
    const patch: Record<string, unknown> =
      data.action === "archive"
        ? { archived_at: data.value ? new Date().toISOString() : null }
        : data.action === "pin"
          ? { pinned_at: data.value ? new Date().toISOString() : null }
          : {
              contact_name:
                String(data.value ?? "")
                  .trim()
                  .slice(0, 100) || null,
            };
    const { error } = await context.supabase
      .from("whatsapp_conversations")
      .update(patch as any)
      .eq("id", conversation.id);
    if (error) throw new Error("Não foi possível atualizar o atendimento.");
    if (data.action === "rename" && conversation.customer_id && patch["contact_name"]) {
      await context.supabase
        .from("customers")
        .update({ name: patch["contact_name"] as string })
        .eq("id", conversation.customer_id);
    }
    return { ok: true };
  });

export const favoriteWhatsappMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { messageId: string; favorite: boolean }) => input)
  .handler(async ({ data, context }) => {
    const { data: visibleMessage, error: visibilityError } = await context.supabase
      .from("whatsapp_messages")
      .select("id")
      .eq("id", data.messageId)
      .maybeSingle();
    if (visibilityError || !visibleMessage) throw new Error("Mensagem não encontrada.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("whatsapp_messages")
      .update({ is_favorite: data.favorite })
      .eq("id", visibleMessage.id);
    if (error) throw new Error("Não foi possível favoritar a mensagem.");
    return { ok: true };
  });

/** Marca a conversa como lida por uma operação validada no banco. */
export const markWhatsappConversationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { conversationId: string }) => {
    if (!input?.conversationId) throw new Error("Conversa inválida.");
    return { conversationId: input.conversationId };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("whatsapp_mark_read", {
      _conversation_id: data.conversationId,
    });
    if (error) throw new Error("Não foi possível marcar a conversa como lida.");
    return { ok: true };
  });

/** Define o responsável pela conversa (gestores e administradores). */
export const assignWhatsappConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { conversationId: string; assigneeId: string | null }) => {
    if (!input?.conversationId) throw new Error("Conversa inválida.");
    return { conversationId: input.conversationId, assigneeId: input.assigneeId ?? null };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("whatsapp_assign_conversation", {
      _conversation_id: data.conversationId,
      _assignee: data.assigneeId as unknown as string,
    });
    if (error) throw new Error("Não foi possível definir o responsável.");
    return { ok: true };
  });
