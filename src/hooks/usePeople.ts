/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Person = { id: string; name: string; email: string | null; is_active: boolean };

/** Lista de pessoas cadastradas, usada nos seletores de remuneração, folha e bonificação. */
export function usePeople() {
  const query = useQuery({
    queryKey: ["people-options"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id,full_name,email,is_active")
        .order("full_name");
      return (data ?? []).map((p: any) => ({
        id: p.id as string,
        name: (p.full_name || p.email || "Sem nome") as string,
        email: p.email as string | null,
        is_active: p.is_active as boolean,
      }));
    },
  });

  const people = query.data ?? [];
  return {
    people,
    loading: query.isLoading,
    options: people.map((p) => ({ value: p.id, label: p.name })),
    nameOf: (id?: string | null) => people.find((p) => p.id === id)?.name ?? "—",
  };
}
