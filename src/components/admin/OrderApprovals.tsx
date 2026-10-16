/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCurrentUser } from "@/hooks/useAuth";
import { useCanReviewOrders } from "@/lib/order-review-flow";
export function OrderApprovals() {
  const { userId, viewAs } = useCurrentUser();
  const access = useCanReviewOrders();
  const client = useQueryClient(),
    [note, setNote] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["order-change-requests", userId],
    enabled: !!userId && !viewAs && access.data === true,
    queryFn: async () => {
      const r = await (supabase as any)
        .from("order_change_requests")
        .select("*")
        .eq("status", "pending")
        .order("created_at");
      if (r.error) throw r.error;
      const requests = (r.data ?? []) as any[];
      if (!requests.length) return requests;
      const orders = await (supabase as any)
        .from("orders")
        .select("id,seller_id")
        .in("id", [...new Set(requests.map((r) => r.order_id))]);
      if (orders.error) throw orders.error;
      return requests.map((r) => ({
        ...r,
        current_seller_id: orders.data?.find((o: any) => o.id === r.order_id)?.seller_id,
      }));
    },
  });
  async function review(id: string, approve: boolean) {
    const request = query.data?.find((r) => r.id === id);
    if (
      !request ||
      request.requested_by === userId ||
      request.current_seller_id === userId ||
      !access.data ||
      viewAs
    ) {
      toast.info(
        "Outro aprovador deve revisar esta solicitação. Você é o solicitante ou vendedor do pedido.",
      );
      return;
    }
    if ((note[id] ?? "").trim().length < 5) {
      toast.error("Informe uma justificativa com pelo menos 5 caracteres.");
      return;
    }
    setBusy(id);
    try {
      const r = await (supabase as any).rpc("integral_review_order_change", {
        p_id: id,
        p_approve: approve,
        p_note: note[id] ?? "",
      });
      if (r.error) throw r.error;
      toast.success(approve ? "Alteração aprovada e aplicada." : "Solicitação rejeitada.");
      await client.invalidateQueries();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  if (!access.data || viewAs) return null;
  return (
    <section className="my-4 space-y-3 rounded-lg border p-4">
      <h2 className="font-semibold">Solicitações de alteração de pedidos</h2>
      {query.isLoading ? (
        <p>Carregando…</p>
      ) : query.error ? (
        <p role="alert">{(query.error as Error).message}</p>
      ) : !query.data?.length ? (
        <p className="text-sm text-muted-foreground">Nenhuma solicitação pendente.</p>
      ) : (
        query.data.map((r) => (
          <article key={r.id} className="space-y-3 rounded-lg border p-3">
            <p className="font-medium">
              Pedido {r.previous_snapshot?.number ?? r.previous_snapshot?.order?.number ?? "—"}
            </p>
            <p>{r.reason}</p>
            <details>
              <summary>Comparar valores anteriores e propostos</summary>
              <table className="mt-3 w-full text-left text-sm">
                <thead>
                  <tr>
                    <th>Campo</th>
                    <th>Anterior</th>
                    <th>Proposto</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ["notes", "Observações"],
                      ["shipping_address", "Endereço"],
                      ["shipping_city", "Cidade"],
                      ["shipping_state", "UF"],
                      ["shipping_cost", "Frete"],
                      ["discount", "Desconto"],
                    ] as [string, string][]
                  ).map(([key, label]) => (
                    <tr key={key} className="border-b">
                      <td className="py-2">{label}</td>
                      <td>{String(r.previous_snapshot?.[key] ?? "—")}</td>
                      <td>{String(r.proposed_args?.[`p_${key}`] ?? "—")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 font-medium">Produtos e quantidades propostas</p>
              {(r.proposed_args?.p_items ?? []).map((item: any, i: number) => (
                <p className="text-sm" key={i}>
                  {item.description} · {item.quantity} un. · preço {item.unit_price} · desconto{" "}
                  {item.discount ?? 0}
                </p>
              ))}
            </details>
            {r.requested_by === userId || r.current_seller_id === userId ? (
              <p role="status" className="rounded-lg bg-muted p-3 text-sm">
                Você solicitou esta alteração ou é o vendedor do pedido. Outro aprovador autorizado
                deve revisar em Aprovações → Pedidos. A solicitação continua em análise.
              </p>
            ) : (
              <>
                <Input
                  placeholder="Justificativa da decisão (mínimo 5 caracteres)"
                  value={note[r.id] ?? ""}
                  onChange={(e) => setNote({ ...note, [r.id]: e.target.value })}
                />
                <div className="flex gap-2">
                  <Button disabled={busy === r.id} onClick={() => review(r.id, true)}>
                    Aprovar e aplicar
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy === r.id}
                    onClick={() => review(r.id, false)}
                  >
                    Rejeitar
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
