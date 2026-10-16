/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useAuth";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function usePendingCancellations() {
  const { userId, isAdmin, roles, viewAs } = useCurrentUser();
  return useQuery({
    queryKey: ["cancellation-review-queue", userId],
    enabled: !viewAs && (isAdmin || roles.includes("financeiro")),
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("remuneration_pending_cancellations");
      if (error) throw error;
      return data as any[];
    },
  });
}

export function CancellationReviewQueue() {
  const queue = usePendingCancellations();
  const { userId, isAdmin, roles, viewAs } = useCurrentUser();
  const client = useQueryClient();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [destinations, setDestinations] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  if (viewAs || (!isAdmin && !roles.includes("financeiro"))) return null;
  async function decide(request: any, approve: boolean) {
    const reason = notes[request.id]?.trim() ?? "";
    if (reason.length < 5 || (approve && !destinations[request.id]))
      return void toast.error("Informe a justificativa e, para aprovar, o destino da mercadoria.");
    setBusy(request.id);
    try {
      const { error } = await (supabase as any).rpc("remuneration_review_cancellation", {
        p_request: request.id,
        p_approve: approve,
        p_reason: reason,
        p_disposition: destinations[request.id] || null,
        p_expected_updated_at: request.updated_at,
      });
      if (error) throw error;
      await client.invalidateQueries();
      toast.success(
        approve
          ? "Cancelamento aprovado. Crédito, estoque e comissão conferidos. Vendedor notificado."
          : "Solicitação recusada. Vendedor notificado.",
      );
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="space-y-3 border-t pt-6">
      <h2 className="text-lg font-semibold">Cancelamentos para revisão</h2>
      {queue.isLoading ? (
        <p>Carregando solicitações…</p>
      ) : queue.error ? (
        <p role="alert">Não foi possível consultar os cancelamentos.</p>
      ) : !queue.data?.length ? (
        <p className="text-sm text-muted-foreground">Nenhuma solicitação pendente.</p>
      ) : (
        queue.data.map((request) => (
          <article key={request.id} className="surface-card space-y-3 p-4">
            <p className="font-semibold">
              Pedido #{request.number} · {request.customer_name} ·{" "}
              {formatMoney(Number(request.total), request.currency)}
            </p>
            <p className="text-sm">
              Solicitado por {request.requested_name}, em{" "}
              {new Date(request.requested_at).toLocaleString("pt-BR")}: {request.reason}
            </p>
            <p className="text-sm text-muted-foreground">
              Vendedor: {request.seller_name}. Os pagamentos confirmados serão convertidos em
              crédito se o cancelamento for aprovado.
            </p>
            {request.requested_by === userId || request.seller_id === userId ? (
              <p>Você solicitou este cancelamento ou é o vendedor do pedido. Outro aprovador autorizado deve revisar em Aprovações → Pedidos. O cancelamento continua em análise.</p>
            ) : (
              <>
                <label className="grid gap-1 text-sm">
                  Destino da mercadoria
                  <select
                    className="h-10 rounded-md border bg-background px-3"
                    value={destinations[request.id] ?? ""}
                    disabled={!!busy}
                    onChange={(event) =>
                      setDestinations({ ...destinations, [request.id]: event.target.value })
                    }
                  >
                    <option value="">Selecione após conferir</option>
                    {request.workflow_stage !== "perdido" &&
                      request.fulfillment_status !== "perdido" && (
                        <option value="return">Mercadoria conferida: devolver ao estoque</option>
                      )}
                    <option value="loss">
                      Mercadoria perdida: custo da empresa, sem retorno ao estoque
                    </option>
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  Justificativa da decisão
                  <Input
                    value={notes[request.id] ?? ""}
                    disabled={!!busy}
                    onChange={(event) => setNotes({ ...notes, [request.id]: event.target.value })}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={!!busy}
                    variant="destructive"
                    onClick={() => decide(request, true)}
                  >
                    Aprovar cancelamento
                  </Button>
                  <Button
                    disabled={!!busy}
                    variant="outline"
                    onClick={() => decide(request, false)}
                  >
                    Recusar solicitação
                  </Button>
                </div>
              </>
            )}
          </article>
        ))
      )}
    </section>
  );
}
