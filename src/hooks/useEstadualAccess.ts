import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useAuth";

export type EstadualGrant = {
  can_view: boolean;
  can_write: boolean;
  own_records_only: boolean;
  region_code: string | null;
  territory_uf: string | null;
  municipality_ibge_id: number | null;
  product_id: string | null;
};

export function useEstadualAccess() {
  const { userId, isAdmin, loading: userLoading } = useCurrentUser();
  const query = useQuery({
    queryKey: ["vendas-estaduais-access", userId],
    enabled: Boolean(userId && !isAdmin && !userLoading),
    retry: false,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("integral_division_access")
        .select(
          "can_view,can_write,own_records_only,region_code,territory_uf,municipality_ibge_id,product_id",
        )
        .eq("user_id", userId!)
        .eq("system_code", "vendas_estaduais");
      if (error) throw error;
      return (data ?? []) as EstadualGrant[];
    },
  });

  const grants = isAdmin ? [] : (query.data ?? []);
  return {
    loading: userLoading || (!isAdmin && query.isLoading),
    error: query.error,
    grants,
    canView: isAdmin || grants.some((grant) => grant.can_view || grant.can_write),
    canWrite: isAdmin || grants.some((grant) => grant.can_write),
    ownRecordsOnly: !isAdmin && grants.length > 0 && grants.every((grant) => grant.own_records_only),
  };
}
