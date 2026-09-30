/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const systems = ["captacao", "vendas_estaduais", "lideranca_regional", "distribuidores_municipais", "estoques", "fornecedores", "transportes"] as const;
const access = z.object({
  system_code: z.enum(systems),
  region_code: z.enum(["norte", "nordeste", "centro-oeste", "sudeste", "sul"]).nullable(),
  territory_uf: z.string().regex(/^[A-Z]{2}$/).nullable(),
  own_records_only: z.boolean(),
  can_write: z.boolean(),
}).refine((v) => !v.region_code || !v.territory_uf, "Escolha região ou estado.");

export const createMemberWithDivisionAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({
    full_name: z.string().trim().min(1),
    email: z.string().email(),
    phone: z.string().optional(),
    cargo: z.string().optional(),
    setor: z.string().optional(),
    roles: z.array(z.enum(["superadmin", "admin", "gestor", "vendedor", "financeiro", "estoque", "fornecedor", "entregador"])).min(1).max(8),
    access: z.array(access).max(30),
  }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: callerRoles, error: roleError } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (roleError || !(callerRoles ?? []).some((r: any) => r.role === "admin" || r.role === "superadmin")) throw new Error("Somente administradores podem cadastrar membros.");
    if (data.roles.includes("superadmin") && !(callerRoles ?? []).some((r: any) => r.role === "superadmin")) throw new Error("Somente superadmin pode conceder esse perfil.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invitation, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email.trim().toLowerCase(), { data: { full_name: data.full_name } });
    if (inviteError || !invitation.user) throw new Error(inviteError?.message ?? "Falha ao convidar o membro.");
    const id = invitation.user.id;
    const { error: profileError } = await supabaseAdmin.from("profiles").upsert({ id, full_name: data.full_name, email: data.email.trim().toLowerCase(), phone: data.phone || null, cargo: data.cargo || null, setor: data.setor || null });
    if (profileError) throw new Error(`Conta convidada, mas o perfil não foi salvo: ${profileError.message}`);
    const { error: roleInsertError } = await supabaseAdmin.from("user_roles").upsert([...new Set(data.roles)].map((role) => ({ user_id: id, role })), { onConflict: "user_id,role" });
    if (roleInsertError) throw new Error(`Conta convidada, mas o perfil de acesso não foi salvo: ${roleInsertError.message}`);
    if (data.access.length) {
      const { error: accessError } = await (supabaseAdmin as any).from("integral_division_access").insert(data.access.map((grant) => ({ ...grant, user_id: id, can_view: true })));
      if (accessError) throw new Error(`Conta convidada, mas as permissões divisionais não foram salvas: ${accessError.message}`);
    }
    return { id };
  });
