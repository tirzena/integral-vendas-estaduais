import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const assignmentInput = z.object({
  contactIds: z.array(z.string().uuid()).min(1).max(1000),
  assignedTo: z.string().uuid().nullable(),
});

/** Salva o responsável com validação de permissão e confirmação da linha alterada. */
export const assignContactLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => assignmentInput.parse(data))
  .handler(async ({ data, context }) => {
    const { data: capabilities, error: capabilitiesError } =
      await context.supabase.rpc("get_my_capabilities");
    if (capabilitiesError || !(capabilities ?? []).includes("admin_area")) {
      throw new Error("Você não tem permissão para direcionar contatos.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.assignedTo) {
      const { data: assignee, error: assigneeError } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("id", data.assignedTo)
        .eq("is_active", true)
        .maybeSingle();
      if (assigneeError || !assignee) {
        throw new Error("O responsável escolhido não está ativo.");
      }
    }

    const contactIds = [...new Set(data.contactIds)];
    const { data: updated, error } = await supabaseAdmin
      .from("contact_leads")
      .update({ assigned_to: data.assignedTo })
      .in("id", contactIds)
      .select("id,assigned_to");
    if (error) throw new Error("Não foi possível salvar o responsável.");
    if ((updated ?? []).length !== contactIds.length) {
      throw new Error("Um ou mais contatos não foram encontrados.");
    }
    return updated ?? [];
  });
