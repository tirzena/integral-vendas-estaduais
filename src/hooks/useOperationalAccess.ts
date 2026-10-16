import { useQuery } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export function useOperationalAccess() {
  const { userId, viewAs } = useCurrentUser();
  const query = useQuery({
    queryKey: ["my-operational-access", userId, !!viewAs],
    enabled: !!userId && !viewAs,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (
        supabase as unknown as {
          rpc: (name: string) => Promise<{ data: unknown; error: Error | null }>;
        }
      ).rpc("integral_my_operational_access");
      if (error) throw error;
      return data as { company_observer: boolean; logistics: boolean; dispatch: boolean };
    },
  });
  return {
    ...query,
    companyObserver: query.data?.company_observer ?? false,
    logistics: query.data?.logistics ?? false,
    dispatch: query.data?.dispatch ?? false,
  };
}
