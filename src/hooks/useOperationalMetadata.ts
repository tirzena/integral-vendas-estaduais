import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
export function useOperationalMetadata(enabled: boolean) {
  return useQuery({
    queryKey: ["operational-filter-metadata"],
    enabled,
    queryFn: async () => {
      const results = await Promise.all([
        supabase.from("profiles").select("id,full_name"),
        supabase.from("teams").select("id,name"),
        supabase.from("team_members").select("team_id,user_id"),
        supabase.from("inventory_items").select("id,name,supplier_id"),
        supabase.from("suppliers").select("id,name"),
      ]);
      for (const r of results) if (r.error) throw r.error;
      return {
        people: results[0].data ?? [],
        teams: results[1].data ?? [],
        teamMembers: results[2].data ?? [],
        items: results[3].data ?? [],
        suppliers: results[4].data ?? [],
      };
    },
  });
}
