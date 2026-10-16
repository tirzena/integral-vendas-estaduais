/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCanViewFinancialApprovals, useCanViewOrderApprovals } from "@/lib/order-review-flow";
import { Button } from "@/components/ui/button";

const labels: Record<string, string> = {
  approve: "Pedido aprovado", reject: "Pedido reprovado", request_changes: "Ajuste solicitado",
  confirmed: "Pagamento aprovado", rejected: "Pagamento reprovado", changes_requested: "Correção solicitada",
  adjusted: "Pagamento ajustado", closed: "Baixa financeira concluída",
};
const fields: Record<string,string> = { amount: "Valor no pedido", received_amount: "Valor recebido", received_currency: "Moeda recebida", method: "Forma", paid_at: "Data", status: "Situação", financial_closed_at: "Baixa financeira" };
export function ReviewDecisionHistory({ kind }: { kind: "order" | "payment" }) {
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);
  const orderAccess = useCanViewOrderApprovals();
  const financialAccess = useCanViewFinancialApprovals();
  const allowed = kind === "order" ? orderAccess.data : financialAccess.data;
  const query = useQuery({
    queryKey: ["review-decision-history", kind, page],
    enabled: allowed === true && open,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc(
        kind === "order" ? "integral_order_decision_history" : "integral_payment_decision_history",
        { p_offset: page * 25, p_limit: 25 },
      );
      if (error) throw error;
      return data as { total: number; rows: any[] };
    },
  });
  if (!allowed) return null;
  return <section className="space-y-3 border-t pt-5">
    <Button variant="outline" onClick={() => setOpen(!open)}>
      {open ? "Ocultar" : "Ver"} histórico de {kind === "order" ? "decisões dos pedidos" : "decisões financeiras"}
    </Button>
    {open && <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Quem decidiu, quando, a justificativa e as alterações registradas.</p>
      {query.isLoading && <p>Carregando histórico…</p>}
      {query.isError && <p role="alert" className="text-sm text-destructive">Não foi possível carregar o histórico. <button className="underline" onClick={() => query.refetch()}>Tentar novamente</button></p>}
      {query.data?.rows.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma decisão registrada.</p>}
      {query.data?.rows.map(entry => <article key={entry.id} className="surface-card space-y-2 p-4 text-sm">
        <p className="font-semibold">{labels[entry.decision] ?? entry.decision} · Pedido #{entry.number}{Number(entry.revision_no) > 1 ? "." + (Number(entry.revision_no)-1) : ""}</p>
        <p>{entry.customer_name || "Cliente não informado"}</p>
        <p className="text-muted-foreground">{entry.actor_name || "Responsável não informado"} · {new Date(entry.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
        <p>{entry.note}</p>
        {kind === "payment" && Object.entries(fields).filter(([key]) =>
          entry.new_snapshot && key in entry.new_snapshot &&
          JSON.stringify(entry.previous_snapshot?.[key]) !== JSON.stringify(entry.new_snapshot[key])
        ).map(([key,label]) => <p className="text-xs text-muted-foreground" key={key}>{label}: {String(entry.previous_snapshot?.[key] ?? "—")} → {String(entry.new_snapshot[key] ?? "—")}</p>)}
        <a href={"/pedidos?pedido=" + entry.order_id} className="inline-block text-primary underline">Abrir pedido</a>
      </article>)}
      {!!query.data?.total && <div className="flex flex-wrap items-center gap-3">
        <p className="mr-auto text-sm">{query.data.total} decisões · Página {page+1}</p>
        <Button variant="outline" disabled={page===0 || query.isFetching} onClick={() => setPage(page-1)}>Anterior</Button>
        <Button variant="outline" disabled={(page+1)*25 >= query.data.total || query.isFetching} onClick={() => setPage(page+1)}>Próxima</Button>
      </div>}
    </div>}
  </section>;
}
