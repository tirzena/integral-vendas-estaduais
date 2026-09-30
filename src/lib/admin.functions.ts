/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Garante que quem chamou é administrador ou superadministrador. */
async function ensureAdmin(context: any) {
  const { supabase, userId } = context;
  const { data: profile } = await supabase.from("profiles").select("is_active").eq("id", userId).maybeSingle();
  if (profile?.is_active !== true) throw new Error("Conta inativa.");
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const list = (roles ?? []).map((r: any) => r.role);
  if (!list.includes("admin") && !list.includes("superadmin")) {
    throw new Error("Apenas administradores podem acessar a visão interna.");
  }
  return { userId, roles: list };
}

/** Lista todos os membros com os dados de acesso (último login, confirmação, provedores). */
export const adminListMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: profiles }, { data: roles }, { data: users }] = await Promise.all([
      supabaseAdmin.from("profiles").select("*").order("full_name"),
      supabaseAdmin.from("user_roles").select("user_id,role"),
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

    const authById = new Map((users?.users ?? []).map((u: any) => [u.id, u]));
    return (profiles ?? []).map((p: any) => {
      const u: any = authById.get(p.id);
      return {
        ...p,
        roles: (roles ?? []).filter((r: any) => r.user_id === p.id).map((r: any) => r.role),
        auth_email: u?.email ?? p.email ?? null,
        last_sign_in_at: u?.last_sign_in_at ?? null,
        email_confirmed_at: u?.email_confirmed_at ?? null,
        auth_created_at: u?.created_at ?? null,
        providers: u?.app_metadata?.providers ?? (u ? [u.app_metadata?.provider] : []),
        has_account: !!u,
      };
    });
  });

/** Visão interna completa de um membro: dados, acessos, remuneração, resultados e atividade. */
export const adminMemberDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const id = data.userId;

    const [
      profile,
      roles,
      products,
      comps,
      payroll,
      bonuses,
      investments,
      tasks,
      orders,
      quotes,
      opportunities,
      activities,
      conversations,
      authUser,
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("*").eq("id", id).maybeSingle(),
      supabaseAdmin.from("user_roles").select("role").eq("user_id", id),
      supabaseAdmin.from("product_users").select("*, products(name)").eq("user_id", id),
      supabaseAdmin.from("member_compensations").select("*, products(name)").eq("user_id", id),
      supabaseAdmin
        .from("payroll_entries")
        .select("*")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("bonus_awards")
        .select("*")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin.from("investments").select("*").eq("owner_id", id),
      supabaseAdmin
        .from("tasks")
        .select("id,title,status,priority,due_at")
        .eq("assignee_id", id)
        .order("due_at", { ascending: true })
        .limit(50),
      supabaseAdmin
        .from("orders")
        .select("id,number,total,currency,status,created_at,customers(name)")
        .eq("seller_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("quotes")
        .select("id,number,total,currency,status,created_at")
        .eq("seller_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("customer_products")
        .select("id,commercial_status,potential_value,currency,customers(name),products(name)")
        .eq("owner_id", id)
        .limit(100),
      supabaseAdmin
        .from("activities")
        .select("id,type,content,created_at")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(30),
      supabaseAdmin.from("internal_conversation_members").select("conversation_id").eq("user_id", id),
      supabaseAdmin.auth.admin.getUserById(id),
    ]);

    const u: any = authUser?.data?.user ?? null;
    return {
      profile: profile.data,
      roles: (roles.data ?? []).map((r: any) => r.role),
      products: products.data ?? [],
      compensations: comps.data ?? [],
      payroll: payroll.data ?? [],
      bonuses: bonuses.data ?? [],
      investments: investments.data ?? [],
      tasks: tasks.data ?? [],
      orders: orders.data ?? [],
      quotes: quotes.data ?? [],
      opportunities: opportunities.data ?? [],
      activities: activities.data ?? [],
      conversationsCount: (conversations.data ?? []).length,
      account: u
        ? {
            email: u.email,
            phone: u.phone,
            last_sign_in_at: u.last_sign_in_at,
            email_confirmed_at: u.email_confirmed_at,
            created_at: u.created_at,
            providers: u.app_metadata?.providers ?? [u.app_metadata?.provider],
            metadata: u.user_metadata ?? {},
          }
        : null,
    };
  });

/** Atualiza dados do membro e, quando informado, o e-mail e a senha de acesso. */
export const adminUpdateMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
    z
      .object({
        userId: z.string().uuid(),
        profile: z
          .object({
            full_name: z.string().optional(),
            email: z.string().optional().nullable(),
            phone: z.string().optional().nullable(),
            cargo: z.string().optional().nullable(),
            setor: z.string().optional().nullable(),
            is_active: z.boolean().optional(),
          })
          .optional(),
        roles: z.array(z.enum(["superadmin", "admin", "gestor", "vendedor", "financeiro", "estoque", "fornecedor", "entregador"])).min(1).optional(),
        newEmail: z.string().email().optional(),
        newPassword: z.string().min(6).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const caller = await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: currentRoles, error: currentRolesError } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", data.userId);
    if (currentRolesError) throw new Error(currentRolesError.message);
    if (!caller.roles.includes("superadmin") && (currentRoles ?? []).some((r: any) => r.role === "superadmin")) throw new Error("Somente superadmin pode alterar esse membro.");
    if (!caller.roles.includes("superadmin") && data.roles?.includes("superadmin")) throw new Error("Somente superadmin pode conceder esse perfil.");

    if (data.profile && Object.keys(data.profile).length) {
      const { error } = await supabaseAdmin
        .from("profiles")
        .update(data.profile as any)
        .eq("id", data.userId);
      if (error) throw new Error(error.message);
    }

    if (data.roles) {
      const current = currentRoles;
      const selected = [...new Set(data.roles)];
      const additions = selected.filter((role) => !(current ?? []).some((r: any) => r.role === role));
      if (additions.length) {
        const { error } = await supabaseAdmin.from("user_roles").insert(additions.map((role) => ({ user_id: data.userId, role })));
        if (error) throw new Error(error.message);
      }
      for (const existing of current ?? []) if (!selected.includes(existing.role as typeof selected[number])) {
        const { error } = await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId).eq("role", existing.role);
        if (error) throw new Error(error.message);
      }
    }

    if (data.newEmail || data.newPassword) {
      const payload: any = {};
      if (data.newEmail) {
        payload.email = data.newEmail;
        payload.email_confirm = true;
      }
      if (data.newPassword) payload.password = data.newPassword;
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, payload);
      if (error) throw new Error(error.message);
      if (data.newEmail) {
        await supabaseAdmin.from("profiles").update({ email: data.newEmail }).eq("id", data.userId);
      }
    }

    return { ok: true };
  });

/** Bloqueia a conta e seus vínculos divisionais; não apaga dados comerciais. */
export const adminSosDisableAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({ userId: z.string().uuid(), confirmation: z.literal("DESLIGAR") }).parse(data))
  .handler(async ({ data, context }) => {
    const caller = await ensureAdmin(context);
    if (caller.userId === data.userId) throw new Error("Você não pode desligar a própria conta.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: target }, { data: roles }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id,is_active").eq("id", data.userId).maybeSingle(),
      supabaseAdmin.from("user_roles").select("role").eq("user_id", data.userId),
    ]);
    if (!target) throw new Error("Membro não encontrado.");
    if ((roles ?? []).some((r: any) => r.role === "superadmin") && !caller.roles.includes("superadmin"))
      throw new Error("Somente um superadmin pode desligar outro superadmin.");
    const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { ban_duration: "876000h" });
    if (banError) throw new Error(banError.message);
    const { error: profileError } = await supabaseAdmin.from("profiles").update({ is_active: false }).eq("id", data.userId);
    if (profileError) throw new Error(`Conta banida; não foi possível atualizar o perfil: ${profileError.message}`);
    const { error: accessError } = await supabaseAdmin.from("integral_division_access" as never).delete().eq("user_id", data.userId);
    if (accessError) throw new Error(`Conta banida; não foi possível remover os vínculos: ${accessError.message}`);
    const { error: auditError } = await supabaseAdmin.from("integral_sos_events" as never).insert({ actor_id: caller.userId, target_id: data.userId, action: "access_disabled" } as never);
    if (auditError) throw new Error(`Acesso desligado; falha ao registrar auditoria: ${auditError.message}`);
    return { ok: true };
  });
