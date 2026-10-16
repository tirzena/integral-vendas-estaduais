import { useQuery } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export function useSalesCatalog(enabled = true) {
  const { userId, viewAs } = useCurrentUser();
  return useQuery({
    queryKey: ["sales-catalog-readonly", userId],
    enabled: enabled && !!userId,
    staleTime: 15_000,
    queryFn: async () => {
      const result = await (supabase as any).rpc("integral_sales_catalog", {
        p_user_id: viewAs?.userId ?? null,
      });
      if (result.error) throw result.error;
      return result.data as { items: any[]; products: any[]; categories: any[]; catalogs: any[] };
    },
  });
}
