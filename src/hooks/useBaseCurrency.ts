import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Currency } from "@/hooks/useRates";

const db = supabase as any;

/** Moeda padrão do sistema, definida na aba Cotações e usada em todo o app. */
export function useBaseCurrency() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["base-currency"],
    queryFn: async () => {
      const { data } = await db
        .from("company_settings")
        .select("id,base_currency,exchange_markup_brl")
        .limit(1)
        .maybeSingle();
      return data as { id: string; base_currency: Currency; exchange_markup_brl: number } | null;
    },
    staleTime: 60_000,
  });

  const save = useMutation({
    mutationFn: async (currency: Currency) => {
      const row = query.data;
      if (row?.id) {
        const { error } = await db
          .from("company_settings")
          .update({ base_currency: currency })
          .eq("id", row.id);
        if (error) throw error;
      } else {
        const { error } = await db
          .from("company_settings")
          .insert({ base_currency: currency });
        if (error) throw error;
      }
      return currency;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["base-currency"] });
    },
  });

  const saveMarkup = useMutation({
    mutationFn: async (markup: number) => {
      if (!Number.isFinite(markup) || markup < 0 || markup > 10) {
        throw new Error("Ajuste cambial inválido.");
      }
      const row = query.data;
      const result = row?.id
        ? await db.from("company_settings").update({ exchange_markup_brl: markup }).eq("id", row.id)
        : await db.from("company_settings").insert({ exchange_markup_brl: markup });
      if (result.error) throw result.error;
      return markup;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["base-currency"] });
      queryClient.invalidateQueries({ queryKey: ["live-rates"] });
      queryClient.invalidateQueries({ queryKey: ["live-rates-shared"] });
    },
  });

  return {
    currency: (query.data?.base_currency ?? "BRL") as Currency,
    markup: Number(query.data?.exchange_markup_brl ?? 0.12),
    loading: query.isLoading,
    save,
    saveMarkup,
  };
}
