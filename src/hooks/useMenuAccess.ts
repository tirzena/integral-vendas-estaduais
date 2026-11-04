import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useAuth";

export const MENU_SYSTEM = "vendas_estaduais" as const;

/** null = não há restrição; [] = todas as abas bloqueadas. */
export function isMenuRouteAllowed(path: string, routes: string[] | null) {
  if (routes === null) return true;
  const root = "/" + path.split("/").filter(Boolean)[0];
  const route = root === "/aprovacoes" ? "/pedidos" : root;
  return routes.includes(route);
}

export function useMenuAccess() {
  const { userId, roles, loading } = useCurrentUser();
  const isAdmin = roles.includes("admin") || roles.includes("superadmin");
  const query = useQuery({
    queryKey: ["integral-menu-routes", MENU_SYSTEM, userId],
    enabled: !!userId && !loading && !isAdmin,
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("integral_my_menu_routes", { p_system: MENU_SYSTEM });
      if (error) throw error;
      return data as string[] | null;
    },
  });
  const allowedRoutes = isAdmin ? null : query.data ?? (query.isSuccess ? null : []);
  return {
    allowedRoutes,
    loading: loading || (!!userId && !isAdmin && query.isPending),
    error: query.error,
    isAllowed: (path: string) => isMenuRouteAllowed(path, allowedRoutes),
  };
}
