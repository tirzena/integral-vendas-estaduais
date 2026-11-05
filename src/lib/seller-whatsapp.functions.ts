/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { invokeEvolution, newWhatsappInstanceName } from "@/lib/supabase-evolution.server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Use the authenticated user's RLS client. Privileged writes are performed by
 * narrow, audited Supabase RPCs that check auth.uid() inside the database. */
async function sellerDatabase(context: any) {
  const { data, error } = await context.supabase.from("user_roles")
    .select("role").eq("user_id", context.userId).eq("role", "vendedor").limit(1);
  if (error || !data?.length)
    throw new Error("Somente vendedores podem vincular o WhatsApp de atendimento.");
  return context.supabase as any;
}

async function callSellerRpc(db: any, name: string, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(error.message || "Não foi possível concluir a operação.");
  return data;
}

export const mySellerWhatsapp = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await sellerDatabase(context);
    const { data, error } = await db.from("whatsapp_accounts")
      .select("id,display_name,phone_e164,connection_status,created_at,product_ids")
      .eq("created_by", context.userId).eq("is_seller_owned", true)
      .is("deleted_at", null).order("created_at", { ascending: false }).limit(1);
    if (error) throw error;
    return data?.[0] ?? null;
  });

export const connectSellerWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { productIds: string[]; audience: "atacado" | "varejo" }) => {
    const productIds = [...new Set(Array.isArray(input?.productIds) ? input.productIds : [])];
    if (!productIds.length || productIds.length > 100 || productIds.some(id => !uuid.test(id)))
      throw new Error("Selecione uma ou mais macroáreas válidas.");
    if (!["atacado", "varejo"].includes(input?.audience))
      throw new Error("Informe Atacado ou Varejo.");
    return { productIds, audience: input.audience };
  })
  .handler(async ({ context, data }) => {
    const db = await sellerDatabase(context);
    const accountId = await callSellerRpc(db, "integral_seller_whatsapp_create", {
      p_products: data.productIds, p_audience: data.audience,
      p_instance: newWhatsappInstanceName(),
    }) as string;
    try {
      const qr = await invokeEvolution(context, "create", { accountId });
      await callSellerRpc(db, "integral_seller_whatsapp_state", {
        p_account: accountId,
        p_status: qr.qrBase64 ? "aguardando_qr" : "conectando",
      });
      return { accountId, qrBase64: qr.qrBase64 ?? null };
    } catch (error) {
      await callSellerRpc(db, "integral_seller_whatsapp_discard", {
        p_account: accountId,
      }).catch(() => undefined);
      throw error;
    }
  });

export const updateSellerWhatsappProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { accountId: string; productIds: string[] }) => {
    if (!uuid.test(input?.accountId ?? "")) throw new Error("Conta inválida.");
    const productIds = [...new Set(Array.isArray(input?.productIds) ? input.productIds : [])];
    if (!productIds.length || productIds.length > 100 || productIds.some(id => !uuid.test(id)))
      throw new Error("Selecione uma ou mais macroáreas válidas.");
    return { accountId: input.accountId, productIds };
  })
  .handler(async ({ context, data }) => {
    const db = await sellerDatabase(context);
    await callSellerRpc(db, "integral_seller_whatsapp_products", {
      p_account: data.accountId, p_products: data.productIds,
    });
    return { ok: true };
  });

export const refreshSellerWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { accountId: string }) => {
    if (!uuid.test(input?.accountId ?? "")) throw new Error("Conta inválida.");
    return input;
  })
  .handler(async ({ context, data }) => {
    const db = await sellerDatabase(context);
    const { data: owned, error } = await db.from("whatsapp_accounts").select("id")
      .eq("id", data.accountId).eq("created_by", context.userId)
      .eq("is_seller_owned", true).is("deleted_at", null).maybeSingle();
    if (error || !owned) throw new Error("WhatsApp não pertence a este vendedor.");

    const check = await invokeEvolution(context, "check", { accountId: data.accountId });
    if (check.status === "conectado" || check.connected) {
      await callSellerRpc(db, "integral_seller_whatsapp_state", {
        p_account: data.accountId, p_status: "conectado",
      });
      return { connected: true, qrBase64: null };
    }
    const qr = await invokeEvolution(context, "qr", { accountId: data.accountId });
    await callSellerRpc(db, "integral_seller_whatsapp_state", {
      p_account: data.accountId,
      p_status: qr.connected ? "conectado" : qr.qrBase64 ? "aguardando_qr" : "conectando",
    });
    return { connected: !!qr.connected, qrBase64: qr.qrBase64 ?? null };
  });

/** Leave the original conversation in the central number and create/open
 * a separate conversation tied to the seller's own connected WhatsApp. */
export const openSellerHandoff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { conversationId: string }) => {
    if (!uuid.test(input?.conversationId ?? "")) throw new Error("Conversa inválida.");
    return input;
  })
  .handler(async ({ context, data }) => {
    const db = await sellerDatabase(context);
    const id = await callSellerRpc(db, "integral_seller_whatsapp_handoff", {
      p_source: data.conversationId,
    });
    return { id: id as string };
  });
