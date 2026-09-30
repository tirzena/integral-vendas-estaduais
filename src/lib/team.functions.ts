import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Exclui definitivamente um membro (perfil, papéis e conta de acesso). Apenas administradores. */
export const deleteMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    if (data.userId === userId) throw new Error("Você não pode excluir a sua própria conta.");

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isAdmin = (roles ?? []).some((r: any) => r.role === "superadmin" || r.role === "admin");
    if (!isAdmin) throw new Error("Apenas administradores podem excluir membros.");

    // Não permitir excluir o último superadministrador
    const { data: targetRoles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId);
    if ((targetRoles ?? []).some((r: any) => r.role === "superadmin")) {
      const { data: supers } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "superadmin");
      if ((supers ?? []).length <= 1)
        throw new Error("Não é possível excluir o único superadministrador.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);

    // Garante a remoção dos dados do membro mesmo sem cascade no banco
    await supabaseAdmin.from("product_users").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .delete()
      .eq("id", data.userId);
    if (profileError) throw new Error(profileError.message);
    return { ok: true };
  });
