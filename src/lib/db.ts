import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type Row = Record<string, any>;

type ListOptions = {
  select?: string;
  filter?: Record<string, any>;
  inFilter?: { column: string; values: any[] } | null;
  orderBy?: { column: string; ascending?: boolean };
  limit?: number;
  enabled?: boolean;
};

export function useRows<T = Row>(table: string, options: ListOptions = {}) {
  const {
    select = "*",
    filter = {},
    inFilter = null,
    orderBy = { column: "created_at", ascending: false },
    limit = 500,
    enabled = true,
  } = options;

  return useQuery({
    queryKey: [table, select, filter, inFilter, orderBy, limit],
    enabled,
    queryFn: async () => {
      let query = (supabase.from(table as any) as any).select(select);
      Object.entries(filter).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "" || value === "todos") return;
        query = query.eq(key, value);
      });
      if (inFilter && inFilter.values.length) {
        query = query.in(inFilter.column, inFilter.values);
      }
      query = query.order(orderBy.column, { ascending: orderBy.ascending ?? false }).limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as T[];
    },
  });
}

/** Cria várias linhas de uma vez (usado para parcelamentos). */
export function useSaveRows(table: string, onDone?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Row[]) => {
      const { error } = await (supabase.from(table as any) as any).insert(rows);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries();
      toast.success(`${count} parcelas criadas com sucesso.`);
      onDone?.();
    },
    onError: (error: any) => {
      toast.error(error?.message ?? "Não foi possível salvar. Tente novamente.");
    },
  });
}

export function useSaveRow(table: string, onDone?: () => void) {

  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: Row) => {
      const payload = { ...values };
      const id = payload["id"];
      delete payload["id"];
      if (id) {
        const { error } = await (supabase.from(table as any) as any).update(payload).eq("id", id);
        if (error) throw error;
        return { id, created: false };
      }
      const { data, error } = await (supabase.from(table as any) as any)
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      return { id: data?.id, created: true };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries();
      toast.success(result.created ? "Registro criado com sucesso." : "Alterações salvas.");
      onDone?.();
    },
    onError: (error: any) => {
      toast.error(error?.message ?? "Não foi possível salvar. Tente novamente.");
    },
  });
}

export function useDeleteRow(table: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from(table as any) as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast.success("Registro excluído.");
    },
    onError: (error: any) => {
      toast.error(error?.message ?? "Não foi possível excluir este registro.");
    },
  });
}

export async function logAudit(entity: string, action: string, entityId?: string, details?: Row) {
  const { data } = await supabase.auth.getUser();
  await (supabase.from("audit_logs") as any).insert({
    user_id: data.user?.id ?? null,
    entity,
    action,
    entity_id: entityId ?? null,
    details: details ?? null,
  });
}
