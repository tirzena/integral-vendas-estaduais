import { collectionWorkflow } from "@/lib/payment-delay";
import { SellerApprovalSummary } from "@/components/dashboard/SellerApprovalSummary";
import { scopeOrdersByProduct } from "@/lib/order-product-scope";
import { useEstadualAccess } from "@/hooks/useEstadualAccess";
import { orderReviewStage, usePendingPaymentOrders } from "@/lib/order-review-flow";
import { SellerOrderForm } from "@/components/orders/SellerOrderForm";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FilePenLine, Plus, Trash2, X } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { orderDraftStorageKey, Pdv, type PdvDraft } from "@/components/orders/Pdv";
import { DocsList, OrderHistoryList } from "@/components/orders/DocsList";
import { useProductScope } from "@/hooks/useProductScope";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/pedidos")({
  head: () => ({
    meta: [
      { title: "Pedidos — OS" },
      {
        name: "description",
        content: "Acompanhe cada pedido, do cadastro ao pagamento e entrega.",
      },
    ],
  }),
  component: Pedidos,
});

function Pedidos() {
  const { productId } = useProductScope();
  const estadualAccess = useEstadualAccess();
  const { userId, isAdmin, roles, viewAs } = useCurrentUser();
  const pendingPayments = usePendingPaymentOrders();
  const sellerPortal = !isAdmin && roles.includes("vendedor");
  const [tab, setTab] = useState("pedidos");
  const [draft, setDraft] = useState<PdvDraft | null>(null);
  const [cashOpen, setCashOpen] = useState(false);
  const [savedDraft, setSavedDraft] = useState<PdvDraft | null>(null);
  const returnScrollRef = useRef(0);
  const returnTabRef = useRef("pedidos");

  const openOrderEditor = (next: PdvDraft | null, sourceTab = tab) => {
    returnScrollRef.current = window.scrollY;
    returnTabRef.current = sourceTab;
    setDraft(next ? { ...next } : null);
    setCashOpen(true);
  };

  const closeOrderEditor = () => {
    setDraft(null);
    setCashOpen(false);
    setTab(returnTabRef.current);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: returnScrollRef.current, behavior: "auto" });
      });
    });
  };

  useEffect(() => {
    if (!cashOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [cashOpen]);

  useEffect(() => {
    const loadDraft = () => {
      if (!userId) return setSavedDraft(null);
      try {
        const raw = localStorage.getItem(orderDraftStorageKey(userId));
        setSavedDraft(raw ? (JSON.parse(raw) as PdvDraft) : null);
      } catch {
        setSavedDraft(null);
      }
    };
    loadDraft();
    window.addEventListener("os-order-draft-changed", loadDraft);
    window.addEventListener("storage", loadDraft);
    return () => {
      window.removeEventListener("os-order-draft-changed", loadDraft);
      window.removeEventListener("storage", loadDraft);
    };
  }, [userId]);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("aba");
    const available = new Set([
      "solicitacoes",
      "rascunhos",
      "pedidos",
      "pedido_feito",
      "em_caminho",
      "vendido",
      "pagamento_parcial",
      "esperando_pagamento",
      "perdido",
      "cancelado",
      "historico", "reprovados", "ajustes", "aguardando_financeiro", "em_analise",
    ]);
    if (requested && available.has(requested)) setTab(requested === "em_analise" ? "solicitacoes" : requested);
  }, []);

  const { data: counts } = useQuery({
    queryKey: ["sales-stage-counts", productId, userId, [...(pendingPayments.data ?? [])].sort().join(",")],
    refetchInterval: 60_000,
    queryFn: async () => {
      const ordersQuery = (supabase as any)
        .from("orders")
        .select("id,workflow_stage,status,product_id,origin,kind,stock_state,approval_status,review_outcome,delivered_at,amount_paid,total,fulfillment_status")
        .is("deleted_at", null)
        .is("superseded_at", null);
      const { data: orders, error: ordersError } = await scopeOrdersByProduct(supabase, ordersQuery, productId);
      if (ordersError) throw ordersError;

      const next = {
        solicitacoes: 0,
        reprovados: 0,
        ajustes: 0,
        pedidos: 0,
        aguardando_financeiro: 0,
        pedido_feito: 0,
        em_caminho: 0,
        vendido: 0,
        pagamento_parcial: 0,
        esperando_pagamento: 0,
        perdido: 0,
        cancelado: 0,
      };
      for (const order of orders ?? []) {
        const review = orderReviewStage(order);
        if (order.status !== "cancelado" && review !== "approved") {
          if (review === "pending") next.solicitacoes += 1;
          else if (review === "changes_requested") next.ajustes += 1;
          else next.reprovados += 1;
          continue;
        }
        next["pedidos"] += 1;
        if (pendingPayments.data?.has(order.id)) next.aguardando_financeiro += 1;
        const stage = order.status === "cancelado" ? "cancelado" : (collectionWorkflow(order, pendingPayments.data?.has(order.id)) ?? "pedido_feito");
        if (Object.hasOwn(next, stage)) next[stage as keyof typeof next] += 1;
      }
      return next;
    },
  });

  function editInPdv(next: PdvDraft) {
    openOrderEditor(next, tab);
  }

  return (
    <div>
      <PageHeader
        title="Pedidos"
        description="Crie um pedido e acompanhe todo o histórico até o pagamento, entrega ou cancelamento."
        actions={
          <Button
            disabled={!estadualAccess.canWrite && !cashOpen}
            onClick={() => {
              if (cashOpen) return closeOrderEditor();
              openOrderEditor(savedDraft ? { ...savedDraft } : null, tab);
            }}
          >
            {cashOpen ? <X className="mr-1 size-4" /> : <Plus className="mr-1 size-4" />}
            {cashOpen ? "Fechar pedido" : "Novo pedido"}
          </Button>
        }
      />
      <SellerApprovalSummary />
      {cashOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-card/95 px-4 py-3 backdrop-blur md:px-6">
            <div>
              <p className="text-sm font-semibold">
                {draft?.sourceOrderId ? "Editar pedido" : "Novo pedido"}
              </p>
              <p className="text-xs text-muted-foreground">
                Ao salvar ou fechar, você volta exatamente ao ponto anterior da lista.
              </p>
            </div>
            <Button variant="outline" onClick={closeOrderEditor}>
              <X className="mr-1 size-4" /> Voltar aos pedidos
            </Button>
          </div>
          <div className="mx-auto max-w-[1600px] p-3 md:p-6">
            <Card>
              <CardContent className="pt-5">
                {sellerPortal && !draft?.sourceOrderId ? (
                  <SellerOrderForm onFinished={() => { closeOrderEditor(); setTab("solicitacoes"); }} />
                ) : (
                  <Pdv productId={productId} draft={draft} readOnly={!estadualAccess.canWrite} onFinished={closeOrderEditor} />
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto w-full justify-start overflow-x-auto p-1">
          <TabsTrigger value="solicitacoes">
            Em análise ({counts?.["solicitacoes"] ?? 0})
          </TabsTrigger>
          <TabsTrigger value="ajustes">Ajuste solicitado ({counts?.ajustes ?? 0})</TabsTrigger>
          <TabsTrigger value="reprovados">Reprovados ({counts?.reprovados ?? 0})</TabsTrigger>
          <TabsTrigger value="aguardando_financeiro">Aguardando financeiro ({pendingPayments.isError ? "!" : counts?.aguardando_financeiro ?? 0})</TabsTrigger>
          <TabsTrigger value="rascunhos">Rascunhos ({savedDraft ? 1 : 0})</TabsTrigger>
          <TabsTrigger value="pedidos">Pedidos aprovados ({counts?.["pedidos"] ?? 0})</TabsTrigger>
          <TabsTrigger value="pedido_feito">
            A preparar ({counts?.["pedido_feito"] ?? 0})
          </TabsTrigger>
          <TabsTrigger value="em_caminho">Em caminho ({counts?.["em_caminho"] ?? 0})</TabsTrigger>
          <TabsTrigger value="vendido">Pagos ({counts?.["vendido"] ?? 0})</TabsTrigger>
          <TabsTrigger value="pagamento_parcial">
            Pagamento parcial ({counts?.["pagamento_parcial"] ?? 0})
          </TabsTrigger>
          <TabsTrigger value="esperando_pagamento">
            Pagamento atrasado ({counts?.["esperando_pagamento"] ?? 0})
          </TabsTrigger>
          <TabsTrigger value="perdido">Produtos perdidos ({counts?.["perdido"] ?? 0})</TabsTrigger>
          <TabsTrigger value="cancelado">Cancelados ({counts?.["cancelado"] ?? 0})</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>
        <TabsContent value="solicitacoes" className="pt-4">
          <DocsList kind="pre_pedido" productId={productId} allOrders reviewFilter="pending" onEdit={estadualAccess.canWrite ? editInPdv : undefined} />
        </TabsContent>
        <TabsContent value="ajustes" className="pt-4">
          <DocsList kind="pre_pedido" productId={productId} allOrders reviewFilter="changes_requested" onEdit={editInPdv} />
        </TabsContent>
        <TabsContent value="reprovados" className="pt-4">
          <DocsList kind="pre_pedido" productId={productId} allOrders reviewFilter="rejected" onEdit={editInPdv} />
        </TabsContent>
        <TabsContent value="aguardando_financeiro" className="pt-4">
          <DocsList kind="venda" productId={productId} allOrders reviewFilter="payment_pending" onEdit={editInPdv} />
        </TabsContent>
        <TabsContent value="rascunhos" className="pt-4">
          {savedDraft ? (
            <Card>
              <CardContent className="flex flex-wrap items-center gap-3 pt-6">
                <FilePenLine className="size-5 text-primary" />
                <div className="mr-auto">
                  <p className="font-medium">Pedido em preenchimento</p>
                  <p className="text-sm text-muted-foreground">
                    {savedDraft.lines.length} item(ns). O conteúdo é salvo automaticamente.
                  </p>
                </div>
                <Button variant="outline" onClick={() => openOrderEditor(savedDraft, "rascunhos")}>
                  Continuar pedido
                </Button>
                <Button
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => {
                    if (userId) localStorage.removeItem(orderDraftStorageKey(userId));
                    setSavedDraft(null);
                  }}
                >
                  <Trash2 className="mr-1 size-4" /> Excluir rascunho
                </Button>
              </CardContent>
            </Card>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum pedido em rascunho.</p>
          )}
        </TabsContent>
        <TabsContent value="pedidos" className="pt-4">
          <DocsList
            kind="pre_pedido"
            productId={productId}
            allOrders
            excludeRequests
            reviewFilter="approved"
            onEdit={editInPdv}
          />
        </TabsContent>
        <TabsContent value="pedido_feito" className="pt-4">
          <DocsList kind="venda" productId={productId} stage="pedido_feito" onEdit={editInPdv} />
        </TabsContent>
        <TabsContent value="em_caminho" className="pt-4">
          <DocsList kind="venda" productId={productId} stage="em_caminho" onEdit={editInPdv} />
        </TabsContent>
        <TabsContent value="vendido" className="pt-4">
          <DocsList kind="venda" productId={productId} stage="vendido" onEdit={editInPdv} />
        </TabsContent>
        <TabsContent value="pagamento_parcial" className="pt-4">
          <DocsList
            kind="venda"
            productId={productId}
            stage="pagamento_parcial"
            onEdit={editInPdv}
          />
        </TabsContent>
        <TabsContent value="esperando_pagamento" className="pt-4">
          <DocsList
            kind="venda"
            productId={productId}
            stage="esperando_pagamento"
            onEdit={editInPdv}
          />
        </TabsContent>
        <TabsContent value="cancelado" className="pt-4">
          <DocsList kind="venda" productId={productId} stage="cancelado" />
        </TabsContent>
        <TabsContent value="perdido" className="pt-4">
          <DocsList kind="venda" productId={productId} stage="perdido" onEdit={editInPdv} />
        </TabsContent>
        <TabsContent value="historico" className="pt-4">
          <OrderHistoryList />
        </TabsContent>
      </Tabs>
    </div>
  );
}
