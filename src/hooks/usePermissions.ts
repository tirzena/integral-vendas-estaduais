import { useCurrentUser, type AppRole } from "@/hooks/useAuth";
import { useViewAs } from "@/hooks/useImpersonation";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Cada cargo enxerga uma parte diferente do sistema.
 * Sem cargo válido, nenhuma permissão: nunca cai para vendedor.
 * A tela apenas reflete o que o banco já garante (RLS/RPC são a autoridade).
 */
export type Capability =
  | "company_finance" // números financeiros da empresa inteira
  | "company_sales" // vendas de todo mundo (senão, só as próprias)
  | "manage_discounts"
  | "manage_team"
  | "manage_access_vault"
  | "manage_suppliers"
  | "marketing"
  | "admin_area"
  | "inventory_view"
  | "inventory_manage"
  | "deliveries_view"
  | "deliveries_manage"
  | "tracking_share_own"
  | "tracking_view_exact"
  | "tracking_manage";

const ADMIN_CAPS: Capability[] = [
  "company_finance",
  "company_sales",
  "manage_discounts",
  "manage_team",
  "manage_access_vault",
  "manage_suppliers",
  "marketing",
  "admin_area",
  "inventory_view",
  "inventory_manage",
  "deliveries_view",
  "deliveries_manage",
  "tracking_view_exact",
  "tracking_manage",
];

const CAPS: Record<AppRole, Capability[]> = {
  superadmin: ADMIN_CAPS,
  admin: ADMIN_CAPS,
  gestor: [
    "company_sales",
    "manage_discounts",
    "manage_team",
    "manage_suppliers",
    "marketing",
    "inventory_view",
    "deliveries_view",
    "deliveries_manage",
  ],
  financeiro: ["company_finance", "company_sales", "manage_suppliers", "inventory_view"],
  vendedor: ["inventory_view", "deliveries_view"],
  estoque: ["manage_suppliers", "inventory_view", "inventory_manage"],
  fornecedor: [],
  entregador: ["deliveries_view", "tracking_share_own"],
};

/** Rotas que exigem uma permissão específica. */
export const ROUTE_CAPABILITY: Record<string, Capability> = {
  "/investimentos": "company_finance",
  "/trafego-pago": "marketing",
  "/fornecedores": "manage_suppliers",
  "/equipe": "manage_team",
  "/equipe/hierarquia": "manage_team",
  "/admin": "admin_area",
  "/autenticidade": "admin_area",
  "/acessos": "manage_access_vault",
  "/entregas": "deliveries_view",
  "/produtos": "inventory_view",
  "/categorias": "inventory_manage",
  "/categorias": "inventory_manage",
  "/estoque": "inventory_manage",
};

export function usePermissions() {
  const { roles, loading, userId, isAdmin } = useCurrentUser();
  const viewAs = useViewAs();
  const list: AppRole[] = roles;
  const isSuperAdmin = roles.includes("superadmin");
  const dynamicCaps = useQuery({
    queryKey: ["my-capabilities", userId],
    enabled: !!userId && !viewAs && !loading && !isSuperAdmin,
    retry: false,
    queryFn: async () => {
      // The generated database types are updated after the migration is linked to Supabase CLI.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("get_my_capabilities");
      if (error) throw error;
      return (data ?? []) as Capability[];
    },
    staleTime: 30_000,
  });
  // O modo espelho só simula a apresentação. Sessões reais usam a resposta do servidor.
  const previewCaps = list.flatMap((r) => CAPS[r] ?? []);
  const caps = new Set<Capability>(
    isSuperAdmin
      ? [...ADMIN_CAPS, "tracking_share_own"]
      : viewAs
        ? previewCaps
        : dynamicCaps.isError
          ? []
          : (dynamicCaps.data ?? []),
  );

  const can = (c: Capability) => isSuperAdmin || (c === "inventory_manage" ? isAdmin : caps.has(c));
  const canOpen = (route: string) => {
    if (isSuperAdmin) return true;
    const needed = ROUTE_CAPABILITY[route];
    if (!needed) return list.length > 0;
    return can(needed);
  };

  return {
    loading: loading || (!!userId && !viewAs && !isSuperAdmin && dynamicCaps.isLoading),
    error: dynamicCaps.error,
    retryPermissions: dynamicCaps.refetch,
    userId,
    viewAs,
    isAdmin,
    /** Nenhum cargo atribuído: sem acesso a nada. */
    hasRole: list.length > 0,
    roles: list,
    can,
    canOpen,
    /** Quando falso, a pessoa só pode ver os próprios resultados. */
    seesCompanySales: caps.has("company_sales"),
    seesCompanyFinance: caps.has("company_finance"),
  };
}
