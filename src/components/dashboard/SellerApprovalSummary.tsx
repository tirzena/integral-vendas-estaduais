import { useQuery } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney, type Currency } from "@/lib/format";

type Summary = {
  orders: { pending: number; approved: number; changes_requested: number; rejected: number };
  payments: { pending: number; approved: number; rejected: number };
  recent_payments: { id: string; order_id: string; number: number; revision_no: number; amount: number; currency: Currency; review_stage: "pending" | "approved" | "rejected"; review_note: string | null }[];
  balances: { currency: Currency; amount: number }[];
};
const paymentLabels = { pending: "Aguardando financeiro", approved: "Pagamento aprovado", rejected: "Reprovado / corrigir" };

export function SellerApprovalSummary() {
  const { userId, viewAs } = useCurrentUser();
  const query = useQuery({
    queryKey: ["seller-approval-summary", userId],
    enabled: !!userId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: Summary; error: Error | null }> }).rpc(
        "integral_seller_approval_summary", { p_seller_id: viewAs?.userId ?? null },
      );
      if (error) throw error;
      return data;
    },
  });
  if (query.isError) return <div role="alert" className="surface-card mb-5 p-4 text-sm">
    Não foi possível consultar suas aprovações. <button type="button" className="text-primary underline" onClick={() => query.refetch()}>Tentar novamente</button>
  </div>;
  const summary = query.data;
  return <section aria-label="Acompanhamento dos meus pedidos e pagamentos" className="mb-5 grid items-start gap-3 lg:grid-cols-2">
    <details className="surface-card border-l-4 border-l-primary p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold [&::-webkit-details-marker]:hidden">
        <span>Meus pedidos · aprovações</span>
        <span aria-label="Total dos meus pedidos">{query.isLoading ? "…" : Object.values(summary?.orders ?? {}).reduce((total, count) => total + count, 0)}</span>
      </summary>
      <div className="mt-3">
      <a href="/pedidos?aba=solicitacoes" className="mb-3 block text-sm font-medium text-primary">Acompanhar pedidos →</a>
      {query.isLoading ? <p className="text-sm text-muted-foreground">Conferindo seus pedidos…</p> : <div className="grid grid-cols-2 gap-2 text-sm">
        {([
          ["Em análise", "solicitacoes", summary?.orders.pending],
          ["Ajuste solicitado", "ajustes", summary?.orders.changes_requested],
          ["Reprovados", "reprovados", summary?.orders.rejected],
          ["Aprovados", "pedidos", summary?.orders.approved],
        ] as const).map(([label, tab, count]) => <a key={tab} href={`/pedidos?aba=${tab}`} className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 p-3 hover:bg-muted"><span>{label}</span><strong>{count ?? 0}</strong></a>)}
      </div>}
      <p className="mt-3 text-xs text-muted-foreground">Somente seus pedidos. Abra uma situação para consultar o histórico e os ajustes solicitados.</p>
      </div>
    </details>
    <details className="surface-card border-l-4 border-l-amber-500 p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold [&::-webkit-details-marker]:hidden">
        <span>Meus pagamentos · conferência</span>
        <span aria-label="Total dos meus lançamentos">{query.isLoading ? "…" : Object.values(summary?.payments ?? {}).reduce((total, count) => total + count, 0)}</span>
      </summary>
      <div className="mt-3">
      <a href="/pedidos?aba=aguardando_financeiro" className="mb-3 block text-sm font-medium text-primary">Acompanhar pagamentos →</a>
      {query.isLoading ? <p className="text-sm text-muted-foreground">Conferindo seus pagamentos…</p> : <>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <a href="/pedidos?aba=aguardando_financeiro" className="rounded-lg bg-muted/50 p-3 hover:bg-muted"><span className="block text-xs">Em análise</span><strong>{summary?.payments.pending ?? 0}</strong></a>
          <div className="rounded-lg bg-muted/50 p-3"><span className="block text-xs">Aprovados</span><strong>{summary?.payments.approved ?? 0}</strong></div>
          <div className="rounded-lg bg-muted/50 p-3"><span className="block text-xs">Reprovados / corrigir</span><strong>{summary?.payments.rejected ?? 0}</strong></div>
        </div>
        <div className="mt-3 space-y-2 text-sm">
          {summary?.recent_payments.map(payment => <a key={payment.id} href={`/pedidos?aba=${payment.review_stage === "pending" ? "aguardando_financeiro" : "pedidos"}&pedido=${payment.order_id}`} className="block rounded-lg border p-2 hover:bg-muted/50">
            <span className="flex flex-wrap justify-between gap-1"><strong>Pedido #{payment.number}{payment.revision_no > 0 ? `.${payment.revision_no}` : ""}</strong><span>{formatMoney(Number(payment.amount), payment.currency)}</span></span>
            <span className="text-xs text-muted-foreground">{paymentLabels[payment.review_stage]}{payment.review_note ? ` · ${payment.review_note}` : ""}</span>
          </a>)}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Contagem por lançamento. Pagamentos em análise ainda não abatem o saldo para cobrança.</p>
        <div className="mt-2 flex flex-wrap gap-2 text-sm">
          {summary?.balances.map(balance => <a key={balance.currency} href="/pedidos?aba=pedidos" className="rounded-lg bg-muted/50 px-3 py-2">A receber: <strong>{formatMoney(Number(balance.amount), balance.currency)}</strong></a>)}
        </div>
      </>}
      </div>
    </details>
  </section>;
}
