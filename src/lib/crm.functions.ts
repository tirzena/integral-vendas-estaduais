import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const moveCrmOpportunity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { cardId: string; stageId: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: stage } = await context.supabase
      .from("pipeline_stages")
      .select("id,name")
      .eq("id", data.stageId)
      .maybeSingle();
    if (!stage) throw new Error("Etapa inválida.");
    const { error } = await context.supabase
      .from("customer_products")
      .update({ stage_id: stage.id, entered_at: new Date().toISOString() })
      .eq("id", data.cardId);
    if (error) throw new Error("Não foi possível mover a oportunidade.");
    await context.supabase.from("opportunity_history").insert({
      customer_product_id: data.cardId,
      event_type: "mudanca_etapa",
      description: stage.name,
      user_id: context.userId,
    });
    const qualified = stage.name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .includes("qualific");
    if (qualified) {
      const { sendQualifiedLeadEvent } = await import("@/lib/meta.server");
      return { ok: true, meta: await sendQualifiedLeadEvent(data.cardId) };
    }
    return { ok: true, meta: null };
  });
