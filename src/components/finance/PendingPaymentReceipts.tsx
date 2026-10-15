/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatMoney } from "@/lib/format";
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
  currency: string;
  received_amount: number | null;
  received_currency: string | null;
  method: string;
  paid_at: string | null;
  created_at: string;
  remaining: number;
  proofs: Array<{
    id: string;
    type: string;
    url: string | null;
    name: string | null;
  }>;
};
export function PendingPaymentReceipts({ productId }: { productId: string }) {
  const { userId, isAdmin, roles, viewAs } = useCurrentUser();
  const allowed = isAdmin || roles.includes("financeiro");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Receipt | null>(null);
  const client = useQueryClient();
  useEffect(() => {
    setPage(0);
    setSelected(null);
  }, [productId]);
  const query = useQuery({
    queryKey: ["finance-pending-receipts", userId, productId, page],
    enabled: allowed && !viewAs,
    queryFn: async () => {
      const result = await (supabase as any).rpc(
        "integral_pending_payment_receipts",
        {
          p_product_id: productId === "todos" ? null : productId,
          p_offset: page * 25,
          p_limit: 25,
        },
      );
      if (result.error) throw result.error;
      return result.data as { total: number; rows: Receipt[] };
    },
    staleTime: 30_000,
  });
  const confirm = useMutation({
    mutationFn: async (receipt: Receipt) => {
      const result = await (supabase as any).rpc(
        "finance_confirm_seller_payment",
        {
          p_payment_id: receipt.payment_id,
        },
      );
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
            "finance-summary",
            "my-finance",
            "sales-docs",
            "sales-order-detail",
            "payment-order-context",
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
  if (!allowed) return null;
  if (viewAs)
    return (
      <p className="text-sm text-muted-foreground">
        Saia do modo espelho para conferir pagamentos.
      </p>
    );
  const proofLinks = (receipt: Receipt) =>
    receipt.proofs.map((proof) =>
      proof.url && /^https:\/\//i.test(proof.url) ? (
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
          <h2 className="font-semibold">Pagamentos para conferir</h2>
          <p className="text-sm text-muted-foreground">
            Recebimentos informados pelos vendedores. Confira o comprovante
            antes de confirmar. Esta fila mostra todas as pendências da
            categoria selecionada.
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
      {query.isPending && (
        <p className="text-sm text-muted-foreground">Carregando pendências…</p>
      )}
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
                disabled={confirm.isPending}
                onClick={() => setSelected(receipt)}
              >
                Conferir pagamento
              </Button>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">
                  Recebido · {receipt.method}
                </dt>
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
                <dt className="text-muted-foreground">
                  Saldo antes da confirmação
                </dt>
                <dd>
                  {formatMoney(Number(receipt.remaining), receipt.currency)}
                </dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-3 text-sm">
              {proofLinks(receipt)}
            </div>
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
                (page + 1) * 25 >= query.data.total ||
                query.isFetching ||
                confirm.isPending
              }
              onClick={() => setPage(page + 1)}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open && !confirm.isPending) setSelected(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar recebimento</DialogTitle>
            <DialogDescription>
              A confirmação atualiza o saldo do pedido e a baixa proporcional de
              estoque, quando aplicável.
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
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
              <p>
                Crédito no pedido:{" "}
                {formatMoney(Number(selected.amount), selected.currency)}
              </p>
              <div className="flex flex-wrap gap-3">{proofLinks(selected)}</div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={confirm.isPending}
              onClick={() => setSelected(null)}
            >
              Voltar
            </Button>
            <Button
              disabled={!selected || confirm.isPending}
              onClick={() => selected && confirm.mutate(selected)}
            >
              {confirm.isPending
                ? "Confirmando…"
                : "Conferi e confirmo o recebimento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
