import { ReviewDecisionHistory } from "./ReviewDecisionHistory";
import {
  useCanReviewOrders,
  useCanViewOrderApprovals,
  useCanViewFinancialApprovals,
} from "@/lib/order-review-flow";
import { usePendingReceiptCount } from "./PendingPaymentReceipts";
import { CommissionBreakdown } from "@/components/orders/CommissionBreakdown";
import { OrderApprovals } from "@/components/admin/OrderApprovals";
import { CancellationReviewQueue, usePendingCancellations } from "./CancellationReviewQueue";
import { FinancialClosureQueue, usePendingFinancialClosures } from "./FinancialClosureQueue";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatMoney } from "@/lib/format";

const db = supabase as any;
export function useOrderApprovalQueue() {
  const { userId, isAdmin, roles, viewAs } = useCurrentUser();
  const access = useCanViewOrderApprovals();
  const editAccess = useCanReviewOrders();
  const allowed = !viewAs && access.data === true;
  const query = useQuery({
    queryKey: ["order-approval-queue", userId],
    enabled: allowed,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await db.rpc("remuneration_approval_queue");
      if (error) throw error;
      return data as { pending_count: number; orders: any[]; can_review: boolean };
    },
  });
  return { ...query, allowed, userId, canReview: editAccess.data === true };
}

export function DashboardApprovalNotice() {
  const queue = useOrderApprovalQueue();
  const financialAccess = useCanViewFinancialApprovals();
  const payments = usePendingReceiptCount();
  const closures = usePendingFinancialClosures();
  const cancellations = usePendingCancellations();
  const revisions = useQuery({
    queryKey: ["order-change-requests", "count"],
    enabled: queue.allowed,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count, error } = await db
        .from("order_change_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      if (error) throw error;
      return count ?? 0;
    },
  });
  if (!queue.allowed) return null;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <a
        href="https://login.qrcodevalidacao.com/aprovacoes?aba=pedidos"
        className="surface-card my-4 flex items-center justify-between gap-3 border-l-4 border-l-primary p-4"
      >
        <div>
          <p className="font-semibold">Pedidos em análise</p>
          <p className="text-sm text-muted-foreground">
            {queue.error
              ? "Abra a fila para conferir os pedidos."
              : queue.isLoading
                ? "Conferindo pendências…"
                : `${queue.data?.pending_count ?? 0} pedido(s) aguardando revisão`}
          </p>
          {!!closures.data?.length && (
            <p className="text-sm text-muted-foreground">
              {closures.data.length} quitação(ões) para baixa financeira
            </p>
          )}
        </div>
        {!!revisions.data && (
          <span className="text-sm">{revisions.data} alteração(ões) para revisão</span>
        )}
        {!!cancellations.data?.length && (
          <span className="text-sm">{cancellations.data.length} cancelamento(s) para revisão</span>
        )}
        <span className="text-sm font-medium text-primary">Abrir fila →</span>
      </a>
      {financialAccess.data === true && (
        <a
          href="https://login.qrcodevalidacao.com/aprovacoes?aba=pagamentos"
          className="surface-card my-4 flex items-center justify-between gap-3 border-l-4 border-l-amber-500 p-4"
        >
          <div>
            <p className="font-semibold">Aprovar pagamentos</p>
            <p className="text-sm text-muted-foreground">
              {payments.isError
                ? "Abra a fila para conferir as pendências."
                : payments.isLoading
                  ? "Conferindo pagamentos…"
                  : `${payments.data ?? 0} pagamento(s) aguardando conferência`}
            </p>
          </div>
          <span className="text-sm font-medium text-primary">Revisar pagamentos →</span>
        </a>
      )}
    </div>
  );
}

export function OrderApprovalQueue() {
  const queue = useOrderApprovalQueue();
  const client = useQueryClient();
  const [selected, setSelected] = useState<any>(null);
  const [draft, setDraft] = useState<any>(null);
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState("policy");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const warehouses = useQuery({
    queryKey: ["approval-warehouses"],
    enabled: queue.allowed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id,name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  function open(order: any) {
    setSelected(order);
    setDraft({ ...order, items: order.items.map((i: any) => ({ ...i })) });
    setReason("");
    setMode("policy");
    setAmount("");
  }
  function changes() {
    return {
      notes: draft.notes ?? "",
      shipping_cost: Number(draft.shipping_cost),
      discount: Number(draft.discount),
      warehouse_id: draft.warehouse_id,
      shipping_address: draft.shipping_address ?? "",
      shipping_city: draft.shipping_city ?? "",
      shipping_state: draft.shipping_state ?? "",
      delivery_recipient_name: draft.delivery_recipient_name ?? "",
      items: draft.items.map((i: any) => ({
        id: i.id,
        quantity: Number(i.quantity),
        unit_price: Number(i.unit_price),
        discount: Number(i.discount),
      })),
    };
  }
  async function act(action: "adjust" | "approve" | "reject" | "request_changes") {
    if (!selected || busy || !queue.canReview) return;
    if (reason.trim().length < 5)
      return void toast.error("Descreva a decisão ou o ajuste (mínimo 5 caracteres).");
    if (selected.seller_id === queue.userId)
      return void toast.error("Outro responsável deve revisar seu pedido.");
    if (
      action === "approve" &&
      mode === "exception" &&
      (!amount.trim() || !Number.isFinite(Number(amount)) || Number(amount) < 0)
    )
      return void toast.error("Informe um valor válido para a comissão excepcional.");
    setBusy(true);
    try {
      let savedAdjustments = false;
      if (action === "adjust" || action === "approve") {
        const previous = { ...selected, items: selected.items };
        const changed =
          JSON.stringify(changes()) !==
          JSON.stringify({
            notes: previous.notes ?? "",
            shipping_cost: Number(previous.shipping_cost),
            discount: Number(previous.discount),
            warehouse_id: previous.warehouse_id,
            shipping_address: previous.shipping_address ?? "",
            shipping_city: previous.shipping_city ?? "",
            shipping_state: previous.shipping_state ?? "",
            delivery_recipient_name: previous.delivery_recipient_name ?? "",
            items: previous.items.map((i: any) => ({
              id: i.id,
              quantity: Number(i.quantity),
              unit_price: Number(i.unit_price),
              discount: Number(i.discount),
            })),
          });
        if (changed) {
          const adjusted = await db.rpc("remuneration_adjust_reviewed_order", {
            p_order: selected.id,
            p_changes: changes(),
            p_expected_updated_at: selected.updated_at,
            p_reason: reason,
          });
          if (adjusted.error) throw adjusted.error;
          savedAdjustments = true;
        } else if (action === "adjust") {
          toast.info("Nenhum dado do pedido foi alterado.");
          return;
        }
      }
      if (action !== "adjust" && !savedAdjustments) {
        const result = await db.rpc("integral_decide_order", {
          p_order: selected.id,
          p_expected_updated_at: selected.updated_at,
          p_decision: action,
          p_reason: reason,
          p_commission_mode: mode,
          p_commission_amount: mode === "exception" ? Number(amount) : null,
        });
        if (result.error) throw result.error;
      }
      await client.invalidateQueries();
      if (action === "adjust" || savedAdjustments) {
        const updated = await db.rpc("remuneration_approval_queue", { p_order: selected.id });
        if (updated.error) throw updated.error;
        if (!updated.data.orders?.[0]) throw new Error("O pedido saiu da fila. Atualize a lista.");
        open(updated.data.orders[0]);
      } else {
        setDraft(null);
        setSelected(null);
      }
      toast.success(
        savedAdjustments
          ? "Ajustes salvos. Confira os valores atualizados antes de aprovar. Vendedor notificado."
          : action === "approve"
            ? "Pedido aprovado. Vendedor notificado."
            : action === "reject"
              ? "Pedido reprovado. Vendedor notificado."
              : "Ajuste solicitado. Vendedor notificado para corrigir e reenviar.",
      );
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!queue.allowed) return null;
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Pedidos em análise</h2>
        <p className="text-sm text-muted-foreground">
          Confira os dados e a comissão antes de liberar estoque e transporte. Cada decisão fica
          registrada e é comunicada ao vendedor.
        </p>
      </div>
      {queue.isLoading ? (
        <p>Carregando pedidos…</p>
      ) : queue.error ? (
        <p role="alert">Não foi possível carregar a fila: {(queue.error as Error).message}</p>
      ) : (
        <>
          <p className="text-sm">{queue.data?.pending_count ?? 0} pedido(s) aguardando aprovação</p>
          {!queue.data?.orders.length && (
            <p className="surface-card p-6 text-muted-foreground">Nenhum pedido pendente.</p>
          )}
          {queue.data?.orders.map((o: any) => (
            <article
              key={o.id}
              className="surface-card flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <div>
                <p className="font-semibold">
                  Pedido #{o.number} ·{" "}
                  {o.customer_name || o.delivery_recipient_name || "Cliente não informado"}
                </p>
                <p className="text-sm text-muted-foreground">
                  Vendedor: {o.seller_name} · {new Date(o.created_at).toLocaleString("pt-BR")} ·{" "}
                  {formatMoney(Number(o.total), o.currency)}
                </p>
              </div>
              <Button onClick={() => open(o)}>
                {queue.canReview ? "Revisar pedido" : "Ver pedido"}
              </Button>
            </article>
          ))}
        </>
      )}
      <ReviewDecisionHistory kind="order" />
      {queue.canReview && <CancellationReviewQueue />}
      {queue.canReview && <OrderApprovals />}
      <Dialog
        open={!!selected}
        onOpenChange={(v) => {
          if (!v && !busy) {
            setDraft(null);
            setSelected(null);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Revisar pedido #{selected?.number}</DialogTitle>
          </DialogHeader>
          {selected && draft && (
            <fieldset disabled={!queue.canReview} className="space-y-4">
              {!queue.canReview && (
                <p className="text-sm text-muted-foreground">
                  Acesso de consulta. Somente admin e superadmin podem decidir.
                </p>
              )}
              <p className="text-sm">
                {selected.customer_name} · Vendedor: {selected.seller_name}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ["delivery_recipient_name", "Destinatário"],
                  ["shipping_address", "Endereço"],
                  ["shipping_city", "Cidade"],
                  ["shipping_state", "UF"],
                  ["shipping_cost", "Frete"],
                  ["discount", "Desconto geral"],
                ].map(([key, label]) => (
                  <label key={key} className="grid gap-1 text-sm">
                    {label}
                    <Input
                      type={key === "shipping_cost" || key === "discount" ? "number" : "text"}
                      min={0}
                      step="0.01"
                      value={draft[key!] ?? ""}
                      onChange={(e) => setDraft({ ...draft, [key!]: e.target.value })}
                    />
                  </label>
                ))}
              </div>
              <label className="grid gap-1 text-sm">
                Estoque de origem
                <select
                  className="h-10 rounded-md border bg-background px-3"
                  value={draft.warehouse_id ?? ""}
                  onChange={(e) => setDraft({ ...draft, warehouse_id: e.target.value })}
                >
                  <option value="">Selecione</option>
                  {warehouses.data?.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
              {draft.items.map((line: any, index: number) => (
                <div key={line.id} className="rounded-lg border p-3">
                  <p className="mb-2 font-medium">{line.description}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      ["quantity", "Quantidade"],
                      ["unit_price", "Preço unitário"],
                      ["discount", "Desconto do item"],
                    ].map(([key, label]) => (
                      <label key={key} className="grid gap-1 text-xs">
                        {label}
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={line[key!]}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              items: draft.items.map((v: any, i: number) =>
                                i === index ? { ...v, [key!]: e.target.value } : v,
                              ),
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <label className="grid gap-1 text-sm">
                Observações
                <Input
                  value={draft.notes ?? ""}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                />
              </label>
              <div className="space-y-2 rounded-lg border p-3">
                <p>
                  Comissão prevista:{" "}
                  <strong>
                    {formatMoney(Number(selected.commission_total), selected.currency)}
                  </strong>
                </p>
                <p className="text-xs text-muted-foreground">
                  A apuração considera a política e as metas aplicáveis ao pedido.
                </p>
                <Label>Decisão sobre a comissão</Label>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3"
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                >
                  <option value="policy">Aplicar política do acordo</option>
                  <option value="none">Venda sem comissão</option>
                  <option value="exception">Valor excepcional para esta venda</option>
                </select>
                {mode === "exception" && (
                  <label className="grid gap-1 text-sm">
                    Valor total da comissão ({selected.currency})
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </label>
                )}
              </div>
              <CommissionBreakdown orderId={selected.id} />
              <label className="grid gap-1 text-sm">
                Justificativa da decisão ou dos ajustes
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Descreva o que foi conferido ou alterado"
                />
              </label>
              {selected.seller_id === queue.userId && (
                <p className="text-sm text-destructive">
                  Seu pedido deve ser revisado por outra pessoa.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={busy || selected.seller_id === queue.userId}
                  onClick={() => act("approve")}
                >
                  Aprovar pedido
                </Button>
                <Button
                  disabled={busy || selected.seller_id === queue.userId}
                  variant="outline"
                  onClick={() => act("adjust")}
                >
                  Salvar ajustes e manter na fila
                </Button>
                <Button
                  disabled={busy || selected.seller_id === queue.userId}
                  variant="destructive"
                  onClick={() => act("reject")}
                >
                  Reprovar pedido
                </Button>
              </div>
              <Button
                variant="outline"
                disabled={busy || selected.seller_id === queue.userId}
                onClick={() => act("request_changes")}
              >
                Solicitar ajuste ao vendedor
              </Button>
              <details>
                <summary className="cursor-pointer text-sm font-medium">
                  Histórico de movimentações
                </summary>
                <div className="mt-2 space-y-2">
                  {selected.history?.map((h: any) => (
                    <div key={h.id} className="rounded-md border p-3 text-sm">
                      <p className="font-medium">
                        {h.actor_name || "Sistema"} ·{" "}
                        {new Date(h.created_at).toLocaleString("pt-BR")}
                      </p>
                      <p>{h.note}</p>
                      <HistoryChanges before={h.previous_snapshot} after={h.new_snapshot} />
                    </div>
                  ))}
                </div>
              </details>
            </fieldset>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

const historyLabels: Record<string, string> = {
  total: "Total",
  discount: "Desconto",
  shipping_cost: "Frete",
  commission_total: "Comissão",
  approval_status: "Aprovação",
  warehouse_id: "Estoque",
  shipping_address: "Endereço",
  shipping_city: "Cidade",
  shipping_state: "UF",
  delivery_recipient_name: "Destinatário",
  notes: "Observações",
  workflow_stage: "Etapa",
  status: "Situação",
  quantity: "Quantidade",
  unit_price: "Preço unitário",
  payment_status: "Pagamento",
};
const historyValues: Record<string, string> = {
  pending: "Aguardando aprovação",
  approved: "Aprovado",
  rejected: "Devolvido",
  pedido_feito: "Pedido recebido",
  pagamento_parcial: "Pagamento parcial",
  vendido: "Vendido",
  cancelado: "Cancelado",
  faturado: "Faturado",
  perdido: "Perdido",
};
function HistoryChanges({ before, after }: { before: any; after: any }) {
  const oldOrder = before?.order ?? before ?? {};
  const newOrder = after?.order ?? after ?? {};
  const changed = Object.keys(historyLabels).filter(
    (key) => key in newOrder && JSON.stringify(oldOrder[key]) !== JSON.stringify(newOrder[key]),
  );
  const display = (v: any) =>
    v == null || v === "" ? "Não informado" : (historyValues[String(v)] ?? String(v));
  const oldItems: any[] = Array.isArray(before?.items) ? before.items : [];
  const newItems: any[] = Array.isArray(after?.items) ? after.items : [];
  const itemChanges = newItems.flatMap((item) => {
    const previous = oldItems.find((old) => old.id === item.id);
    if (!previous) return [];
    return ["quantity", "unit_price", "discount", "commission_amount"]
      .filter((key) => JSON.stringify(previous[key]) !== JSON.stringify(item[key]))
      .map((key) => ({
        id: `${item.id}-${key}`,
        label: `${item.description || "Produto"} · ${historyLabels[key] || "Comissão"}`,
        before: previous[key],
        after: item[key],
      }));
  });
  return changed.length || itemChanges.length ? (
    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
      {changed.map((key) => (
        <li key={key}>
          {historyLabels[key]}: {display(oldOrder[key])} → {display(newOrder[key])}
        </li>
      ))}
      {itemChanges.map((change) => (
        <li key={change.id}>
          {change.label}: {display(change.before)} → {display(change.after)}
        </li>
      ))}
    </ul>
  ) : null;
}
