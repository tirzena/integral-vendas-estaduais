/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const id = z.string().uuid();
const access = z
  .object({
    system_code: z.enum([
      "captacao",
      "vendas_estaduais",
      "lideranca_regional",
      "distribuidores_municipais",
      "estoques",
      "fornecedores",
      "transportes",
    ]),
    region_code: z.enum(["norte", "nordeste", "centro-oeste", "sudeste", "sul"]).nullable(),
    territory_uf: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .nullable(),
    own_records_only: z.boolean(),
    can_write: z.boolean(),
  })
  .refine((v) => !v.region_code || !v.territory_uf, "Escolha região ou estado.");
const payload = z.object({
  full_name: z.string().trim().min(1).max(150),
  email: z.string().email(),
  phone: z.string().max(80).optional(),
  cargo: z.string().max(500).optional(),
  setor: z.string().max(500).optional(),
  roles: z
    .array(
      z.enum([
        "superadmin",
        "admin",
        "gestor",
        "vendedor",
        "financeiro",
        "estoque",
        "fornecedor",
        "entregador",
      ]),
    )
    .min(1)
    .max(8),
  general_access: z.boolean(),
  access: z.array(access).max(30),
  product_ids: z.array(id).max(500),
  warehouse_ids: z.array(id).max(500),
  excluded_category_ids: z.array(id).max(3000),
  excluded_item_ids: z.array(id).max(10000),
  permission_overrides: z.record(z.string(), z.boolean()),
  jobs: z.array(z.object({ job_role_id: id, job_level_id: id.nullable() })).max(100),
  deals: z
    .array(
      z.object({
        label: z.string().max(200),
        product_id: z.string(),
        category_id: z.string(),
        item_id: z.union([id, z.literal("")]).optional(),
        notes: z.string().max(2000).optional(),
        comp_type: z.enum(["percent", "fixed"]),
        amount: z.number().positive().finite(),
        currency: z.enum(["USD", "BRL", "PYG"]),
        period: z.enum(["day", "week", "month", "per_sale"]),
      }),
    )
    .max(100),
});

export const createMemberWithDivisionAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => payload.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roles, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (error || !roles?.some((r) => r.role === "admin" || r.role === "superadmin"))
      throw new Error("Somente administradores podem cadastrar membros.");
    if (data.roles.includes("superadmin") && !roles.some((r) => r.role === "superadmin"))
      throw new Error("Somente superadmin pode conceder esse cargo.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.trim().toLowerCase();
    const initial = await (supabaseAdmin as any).rpc("integral_initial_member_password");
    if (initial.error || typeof initial.data !== "string" || initial.data.length < 6)
      throw new Error("A senha inicial dos membros ainda não foi configurada pelo administrador.");
    const secret = initial.data;
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: secret,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
      app_metadata: { initial_setup_suggested: true },
    });
    if (createError || !created.user)
      throw new Error(createError?.message ?? "Falha ao criar a conta.");
    const memberId = created.user.id;
    try {
      const configured = await (supabaseAdmin as any).rpc("integral_configure_new_member", {
        p_actor: userId,
        p_user: memberId,
        p_payload: { ...data, email },
      });
      if (configured.error) throw configured.error;
      return { id: memberId, activationLink: "", initialAccessReady: true };
    } catch (failure) {
      const cleanup = await supabaseAdmin.auth.admin.deleteUser(memberId);
      if (cleanup.error)
        throw new Error(
          `Cadastro não concluído. Conta ${memberId} requer recuperação administrativa: ${cleanup.error.message}`,
        );
      throw new Error("Cadastro desfeito com segurança: " + (failure as Error).message);
    }
  });
