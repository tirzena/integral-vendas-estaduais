import { ReviewDecisionHistory } from "./ReviewDecisionHistory";
import { useCanReviewFinancial, useCanViewFinancialApprovals } from "@/lib/order-review-flow";
import { PaymentProofLink } from "@/components/orders/PaymentProofFile";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatMoney } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
type Receipt = {
  payment_id: string;
  order_id: string;
  order_number: number;
  customer_name: string | null;
  seller_name: string | null;
  amount: number;
  currency: "BRL" | "USD" | "PYG";
  received_amount: number | null;
  received_currency: "BRL" | "USD" | "PYG" | null;
  method: string;
  paid_at: string | null;
  created_at: string;
  remaining: number;
  proofs: Array<{
    id: string;
    type: string;
    url: string | null;
    path?: string | null;
    name: string | null;
  }>;
};
export function usePendingReceiptCount(productId = "todos") {
  const { userId, isAdmin, roles, viewAs } = useCurrentUser();
  const access = useCanViewFinancialApprovals();
  return useQuery({
    queryKey: ["finance-pending-receipt-count", userId, productId],
    enabled: !!userId && !viewAs && access.data === true,
    refetchInterval: 60_000,
    queryFn: async () => {
      const result = await (supabase as any).rpc("integral_pending_payment_receipts", {
        p_product_id: productId === "todos" ? null : productId,
        p_offset: 0,
        p_limit: 1,
      });
      if (result.error) throw result.error;
      return Number(result.data.total);
    },
  });
}
export function PendingPaymentReceipts({ productId }: { productId: string }) {
  const { userId, isAdmin, roles, viewAs } = useCurrentUser();
  const access = useCanViewFinancialApprovals();
  const editAccess = useCanReviewFinancial();
  const canDecide = editAccess.data === true;
  const allowed = access.data === true;
  const [selected, setSelected] = useState<Receipt | null>(null);
  const [reason, setReason] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editMethod, setEditMethod] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  useEffect(() => {
    setReason("");
    setEditAmount(String(selected?.amount ?? ""));
    setEditDate(selected?.paid_at?.slice(0, 10) ?? "");
    setEditMethod(selected?.method ?? "");
  }, [selected]);
  const [page, setPage] = useState(0);
  const client = useQueryClient();
  useEffect(() => {
    setPage(0);
    setSelected(null);
  }, [productId]);
  const query = useQuery({
    queryKey: ["finance-pending-receipts", userId, productId, page],
    enabled: allowed && !viewAs,
    queryFn: async () => {
      const result = await (supabase as any).rpc("integral_pending_payment_receipts", {
        p_product_id: productId === "todos" ? null : productId,
        p_offset: page * 25,
        p_limit: 25,
      });
      if (result.error) throw result.error;
      return result.data as { total: number; rows: Receipt[] };
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const confirm = useMutation({
    mutationFn: async (receipt: Receipt) => {
      if (!canDecide)
        throw new Error(
          "Acesso de consulta. Apenas os responsáveis financeiros autorizados podem confirmar.",
        );
      const result = await (supabase as any).rpc("finance_confirm_seller_payment", {
        p_payment_id: receipt.payment_id,
      });
      if (result.error) throw result.error;
      return result.data;
    },
    onSuccess: async () => {
      setSelected(null);
      toast.success("Pagamento confirmado. Saldo e estoque atualizados.");
      await client.invalidateQueries({
        predicate: (q) =>
          [
            "finance-pending-receipts",
            "finance-pending-receipt-count",
            "pending-payment-orders",
            "order-review-status",
            "finance-summary",
            "financial-closure-queue",
            "order-approval-queue",
            "cancellation-review-queue",
            "my-finance",
            "sales-docs",
            "sales-order-detail",
            "payment-order-context",
            "order-credit-context",
            "orders-history-feed",
            "warehouse_inventory",
            "inventory_items",
            "sales-stage-counts",
          ].includes(String(q.queryKey[0])),
      });
      if ((query.data?.rows.length ?? 0) === 1 && page > 0) setPage(page - 1);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  async function review(decision: "reject" | "request_changes" | "adjust") {
    if (!selected || reviewBusy || confirm.isPending || !canDecide) return;
    if (reason.trim().length < 5)
      return void toast.error("Informe a justificativa (mínimo 5 caracteres).");
    setReviewBusy(true);
    try {
      const result = await (supabase as any).rpc("integral_review_payment", {
        p_payment: selected.payment_id,
        p_decision: decision,
        p_reason: reason.trim(),
        p_expected_amount: Number(selected.amount),
        p_amount: decision === "adjust" ? Number(editAmount) : null,
        p_paid_at: decision === "adjust" ? editDate || null : null,
        p_method: decision === "adjust" ? editMethod : null,
      });
      if (result.error) throw result.error;
      setSelected(null);
      await client.invalidateQueries();
      toast.success(
        decision === "adjust"
          ? "Ajuste salvo. Revise o comprovante antes de confirmar. Vendedor notificado."
          : decision === "reject"
            ? "Pagamento reprovado. Vendedor notificado."
            : "Correção solicitada. Vendedor notificado para registrar novamente com comprovante.",
      );
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setReviewBusy(false);
    }
  }
  if (!allowed) return null;
  if (viewAs)
    return (
      <p className="text-sm text-muted-foreground">
        Saia do modo espelho para conferir pagamentos.
      </p>
    );
  const proofLinks = (receipt: Receipt) =>
    receipt.proofs.map((proof) =>
      proof.type === "credito_cliente" ? (
        <span key={proof.id}>{proof.name || "Solicitação de uso de crédito do cliente"}</span>
      ) : proof.path && proof.type !== "recibo_sistema" ? (
        <PaymentProofLink key={proof.id} path={proof.path} name={proof.name} />
      ) : proof.url && /^https:\/\//i.test(proof.url) ? (
        <a
          key={proof.id}
          href={proof.url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          {proof.name || "Abrir comprovante"}
        </a>
      ) : (
        <span key={proof.id}>
          {proof.type === "recibo_sistema"
            ? "Recibo do sistema"
            : proof.name || "Comprovante registrado"}
        </span>
      ),
    );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Aprovar pagamentos ({query.data?.total ?? 0})</h2>
          <p className="text-sm text-muted-foreground">
            Recebimentos informados pelos vendedores. Confira o comprovante antes de confirmar. Esta
            fila mostra todas as pendências da categoria selecionada.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={query.isFetching || confirm.isPending}
          onClick={() => void query.refetch()}
        >
          Atualizar fila
        </Button>
      </div>
      {query.isPending && <p className="text-sm text-muted-foreground">Carregando pendências…</p>}
      {query.isError && (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível carregar as pendências. Tente atualizar a fila.
        </p>
      )}
      {query.isSuccess && !query.data.rows.length && (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nenhum pagamento pendente de conferência.
        </p>
      )}
      {(query.data?.rows ?? []).map((receipt) => (
        <Card key={receipt.payment_id}>
          <CardContent className="space-y-3 pt-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-medium">
                  Pedido #{receipt.order_number} ·{" "}
                  {receipt.customer_name || "Cliente não informado"}
                </p>
                <p className="text-sm text-muted-foreground">
                  Vendedor: {receipt.seller_name || "Não informado"} ·{" "}
                  {formatDate(receipt.paid_at || receipt.created_at)}
                </p>
              </div>
              <Button
                disabled={confirm.isPending || reviewBusy}
                onClick={() => setSelected(receipt)}
              >
                {canDecide ? "Conferir pagamento" : "Ver pagamento"}
              </Button>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Recebido · {receipt.method}</dt>
                <dd>
                  {formatMoney(
                    Number(receipt.received_amount ?? receipt.amount),
                    receipt.received_currency || receipt.currency,
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Crédito no pedido</dt>
                <dd>{formatMoney(Number(receipt.amount), receipt.currency)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Saldo antes da confirmação</dt>
                <dd>{formatMoney(Number(receipt.remaining), receipt.currency)}</dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-3 text-sm">{proofLinks(receipt)}</div>
          </CardContent>
        </Card>
      ))}
      {!!query.data?.total && (
        <div className="flex items-center justify-between gap-3 text-sm">
          <p>
            {query.data.total} pendências · Página {page + 1}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={!page || query.isFetching || confirm.isPending}
              onClick={() => setPage(page - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              disabled={
                (page + 1) * 25 >= query.data.total || query.isFetching || confirm.isPending
              }
              onClick={() => setPage(page + 1)}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}
      <ReviewDecisionHistory kind="payment" />
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open && !confirm.isPending && !reviewBusy) setSelected(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revisar pagamento</DialogTitle>
            <DialogDescription>
              A confirmação atualiza o saldo do pedido e a baixa proporcional de estoque, quando
              aplicável.
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <fieldset disabled={!canDecide} className="space-y-3 text-sm">
              {!canDecide && (
                <p>Acesso de consulta. Somente Zé e Bia podem decidir sobre pagamentos.</p>
              )}
              <p>
                Pedido #{selected.order_number} ·{" "}
                {selected.customer_name || "Cliente não informado"}
              </p>
              <p>
                Recebido:{" "}
                <strong>
                  {formatMoney(
                    Number(selected.received_amount ?? selected.amount),
                    selected.received_currency || selected.currency,
                  )}
                </strong>{" "}
                · {selected.method}
              </p>
              <p>Crédito no pedido: {formatMoney(Number(selected.amount), selected.currency)}</p>
              <div className="flex flex-wrap gap-3">{proofLinks(selected)}</div>
              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer font-medium">
                  Ajustar os dados antes da confirmação
                </summary>
                <div className="mt-3 grid gap-3">
                  <label>
                    Valor creditado no pedido ({selected.currency})
                    <Input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                    />
                  </label>
                  <label>
                    Data do pagamento
                    <Input
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                    />
                  </label>
                  <label>
                    Forma de pagamento
                    <Input value={editMethod} onChange={(e) => setEditMethod(e.target.value)} />
                  </label>
                  <p className="text-xs text-muted-foreground">
                    O câmbio do pedido é preservado. Salvar ajustes mantém o pagamento pendente para
                    nova conferência do comprovante.
                  </p>
                  <Button
                    variant="outline"
                    disabled={reviewBusy || confirm.isPending}
                    onClick={() => review("adjust")}
                  >
                    Salvar ajuste e conferir novamente
                  </Button>
                </div>
              </details>
              <label className="grid gap-1">
                Justificativa para ajuste, recusa ou devolução
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Descreva o que precisa ser corrigido"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={reviewBusy || confirm.isPending}
                  onClick={() => review("request_changes")}
                >
                  Solicitar correção
                </Button>
                <Button
                  variant="destructive"
                  disabled={reviewBusy || confirm.isPending}
                  onClick={() => review("reject")}
                >
                  Reprovar pagamento
                </Button>
              </div>
            </fieldset>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={confirm.isPending || reviewBusy}
              onClick={() => setSelected(null)}
            >
              Voltar
            </Button>
            <Button
              disabled={!canDecide || !selected || confirm.isPending || reviewBusy}
              onClick={() => selected && confirm.mutate(selected)}
            >
              {confirm.isPending ? "Confirmando…" : "Conferi e confirmo o recebimento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
