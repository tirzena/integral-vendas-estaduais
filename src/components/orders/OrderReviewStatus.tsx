import { usePendingPaymentOrders } from "@/lib/order-review-flow";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function OrderReviewStatus({ order }: { order: any }) {
  const { userId, isAdmin, roles } = useCurrentUser();
  const client = useQueryClient();
  const pendingPayments = usePendingPaymentOrders();
  const [busy, setBusy] = useState(false);
  const [creditReason, setCreditReason] = useState("");
  const query = useQuery({
    queryKey: ["order-review-status", userId, order.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("division_orders_public")
        .select(
          "review_outcome,approval_status,approved_at,seller_id,replacement_for_order_id,workflow_stage,fulfillment_status,customer_resolution,financial_closed_at",
        )
        .eq("id", order.id)
        .single();
      if (error) throw error;
      return data as any;
    },
  });
  const revisions = useQuery({
    queryKey: ["order-change-status", userId, order.id],
    enabled: !!userId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("order_change_requests")
        .select("id,status,reason,created_at,reviewed_at,review_note")
        .eq("order_id", order.id)
        .eq("requested_by", userId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
  const data = query.data ?? order;
  const lost = data.workflow_stage === "perdido" || data.fulfillment_status === "perdido";
  const canReplace = data.seller_id === userId || isAdmin || roles.includes("financeiro");
  async function credit() {
    if (creditReason.trim().length < 5)
      return void toast.error("Informe a justificativa do crédito.");
    setBusy(true);
    try {
      const { error } = await (supabase as any).rpc("customer_credit_resolve_order", {
        p_order_id: order.id,
        p_resolution: "credit",
        p_note: creditReason,
      });
      if (error) throw error;
      await client.invalidateQueries();
      toast.success("Crédito conferido. Cobrança encerrada e comissão recalculada.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function replace() {
    setBusy(true);
    try {
      const { data: result, error } = await (supabase as any).rpc(
        "remuneration_duplicate_lost_order",
        { p_order: order.id },
      );
      if (error) throw error;
      await client.invalidateQueries();
      toast.success(
        `Reposição criada no pedido #${result.number}. Aguardando aprovação, sem nova cobrança ou comissão.`,
      );
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (query.error)
    return (
      <p role="alert" className="text-sm text-destructive">
        Não foi possível conferir a aprovação deste pedido.
      </p>
    );
  return (
    <div className="space-y-3">
      {revisions.isError && (
        <p role="alert">Não foi possível conferir a solicitação de alteração.</p>
      )}
      {revisions.data && (
        <div role="status" className="rounded-lg border bg-muted/40 p-3 text-sm">
          <p className="font-semibold">
            {revisions.data.status === "pending"
              ? "Alteração aguardando aprovação"
              : revisions.data.status === "approved"
                ? "Alteração aprovada"
                : "Alteração rejeitada"}
          </p>
          {revisions.data.status === "pending" && (
            <p>
              A proposta está na fila da Direção Geral. O pedido e os pagamentos permanecem vigentes
              até a decisão.
            </p>
          )}
          {revisions.data.review_note && <p>{revisions.data.review_note}</p>}
        </div>
      )}
      {data.approval_status && (
        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <p className="font-semibold">
            {data.approval_status === "pending"
              ? "Aguardando aprovação"
              : data.approval_status === "approved"
                ? "Pedido aprovado"
                : data.review_outcome === "changes_requested"
                  ? "Ajuste solicitado ao vendedor"
                  : "Pedido reprovado"}
          </p>
          <p>
            {data.approval_status === "pending"
              ? "O responsável precisa conferir os dados e a comissão antes de liberar a operação."
              : data.approval_status === "approved"
                ? `Aprovado em ${new Date(data.approved_at).toLocaleString("pt-BR")}.`
                : "Confira o histórico e a justificativa da revisão."}
          </p>
          {(isAdmin || roles.includes("financeiro")) && data.approval_status === "pending" && (
            <a
              className="mt-2 inline-block text-primary underline"
              href="https://login.qrcodevalidacao.com/aprovacoes?aba=pedidos"
            >
              Abrir fila de aprovações
            </a>
          )}
        </div>
      )}
      {pendingPayments.data?.has(order.id) && (
        <p className="rounded-lg border border-amber-500/40 p-3 text-sm">
          Pagamento registrado. Aguardando confirmação do financeiro; o valor ainda não foi
          contabilizado como pago.
        </p>
      )}
      {data.replacement_for_order_id && (
        <p className="rounded-lg border p-3 text-sm">
          Reposição de mercadoria perdida. A cobrança e os pagamentos permanecem no pedido original;
          esta reposição não gera nova comissão.
        </p>
      )}
      {data.financial_closed_at && (
        <p className="text-sm text-muted-foreground">
          Baixa financeira concluída em {new Date(data.financial_closed_at).toLocaleString("pt-BR")}
          .
        </p>
      )}
      {lost && (
        <div className="space-y-2 rounded-lg border border-destructive/30 p-3 text-sm">
          <p className="font-semibold">Mercadoria perdida</p>
          <p>
            O custo permanece registrado para a empresa. A reposição copia os produtos e a entrega e
            segue para aprovação.
          </p>
          {data.customer_resolution === "credit" && (
            <p>
              Pagamentos convertidos em crédito. A mercadoria perdida permanece como custo da
              empresa.
            </p>
          )}
          {data.customer_resolution === "replacement" && (
            <p>Reposição vinculada. Os pagamentos permanecem no pedido original.</p>
          )}
          {canReplace && data.customer_resolution !== "credit" && (
            <Button disabled={busy} variant="outline" onClick={replace}>
              {busy ? "Preparando reposição…" : "Duplicar nota para reposição"}
            </Button>
          )}
          {(isAdmin || roles.includes("financeiro")) &&
            userId !== data.seller_id &&
            !data.customer_resolution && (
              <div className="space-y-2 border-t pt-3">
                <label className="grid gap-1">
                  Justificativa do crédito
                  <Input
                    value={creditReason}
                    disabled={busy}
                    onChange={(event) => setCreditReason(event.target.value)}
                  />
                </label>
                <Button variant="outline" disabled={busy} onClick={credit}>
                  Encerrar cobrança e gerar crédito do valor pago
                </Button>
              </div>
            )}
        </div>
      )}
    </div>
  );
}
