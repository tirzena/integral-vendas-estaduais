/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useAuth";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function usePendingFinancialClosures() {
  const { userId, isAdmin, roles, viewAs } = useCurrentUser();
  const allowed = !viewAs && (isAdmin || roles.includes("financeiro"));
  return useQuery({
    queryKey: ["financial-closure-queue", userId],
    enabled: allowed,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("remuneration_pending_closures");
      if (error) throw error;
      return data as any[];
    },
  });
}

export function FinancialClosureQueue() {
  const { userId, isAdmin, roles, viewAs } = useCurrentUser();
  const queue = usePendingFinancialClosures();
  const client = useQueryClient();
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  if (viewAs || (!isAdmin && !roles.includes("financeiro"))) return null;
  async function close(order: any) {
    const reason = reasons[order.id]?.trim() ?? "";
    if (reason.length < 5) return void toast.error("Descreva a conferência realizada.");
    setBusy(order.id);
    try {
      const { error } = await (supabase as any).rpc("remuneration_close_order", {
        p_order: order.id,
        p_reason: reason,
      });
      if (error) throw error;
      await client.invalidateQueries();
      toast.success("Baixa financeira concluída. Envolvidos notificados.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="space-y-3 border-t pt-6">
      <h2 className="text-lg font-semibold">Quitações para conferência final</h2>
      <p className="text-sm text-muted-foreground">
        Pedidos com pagamentos confirmados aguardam a baixa financeira. A entrega continua sendo
        acompanhada no transporte.
      </p>
      {queue.isLoading ? (
        <p>Conferindo quitações…</p>
      ) : queue.error ? (
        <p role="alert">Não foi possível consultar as quitações.</p>
      ) : !queue.data?.length ? (
        <p className="text-sm text-muted-foreground">Nenhuma baixa financeira pendente.</p>
      ) : (
        queue.data.map((order) => (
          <article key={order.id} className="surface-card space-y-3 p-4">
            <p className="font-medium">
              Pedido #{order.number} · {order.customer_name} ·{" "}
              {formatMoney(Number(order.total), order.currency)}
            </p>
            <p className="text-sm text-muted-foreground">Vendedor: {order.seller_name}</p>
            {order.seller_id === userId ? (
              <p className="text-sm text-muted-foreground">
                Outro responsável deve conferir seu pedido.
              </p>
            ) : (
              <>
                <label className="grid gap-1 text-sm">
                  Conferência realizada
                  <Input
                    value={reasons[order.id] ?? ""}
                    disabled={!!busy}
                    onChange={(event) => setReasons({ ...reasons, [order.id]: event.target.value })}
                    placeholder="Descreva a conferência dos pagamentos"
                  />
                </label>
                <Button disabled={!!busy} onClick={() => close(order)}>
                  Concluir baixa financeira
                </Button>
              </>
            )}
          </article>
        ))
      )}
    </section>
  );
}
