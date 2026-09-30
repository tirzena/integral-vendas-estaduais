/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
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
import { useEstadualAccess } from "@/hooks/useEstadualAccess";

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
  const { userId } = useCurrentUser();
  const estadualAccess = useEstadualAccess();
  const [tab, setTab] = useState("pedidos");
  const [draft, setDraft] = useState<PdvDraft | null>(null);
  const [cashOpen, setCashOpen] = useState(false);
  const [savedDraft, setSavedDraft] = useState<PdvDraft | null>(null);

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
      "historico",
    ]);
    if (requested && available.has(requested)) setTab(requested);
  }, []);

  const { data: counts = {} } = useQuery({
    queryKey: ["sales-stage-counts", productId],
    queryFn: async () => {
      let ordersQuery = (supabase as any)
        .from("orders")
        .select("workflow_stage,status,product_id,origin,kind,stock_state")
        .is("deleted_at", null)
        .is("superseded_at", null);
      if (productId !== "todos") {
        ordersQuery = ordersQuery.eq("product_id", productId);
      }
      const { data: orders, error: ordersError } = await ordersQuery;
      if (ordersError) throw ordersError;

      const next: Record<string, number> = {
        solicitacoes: 0,
        pedidos: 0,
        pedido_feito: 0,
        em_caminho: 0,
        vendido: 0,
        pagamento_parcial: 0,
        esperando_pagamento: 0,
        perdido: 0,
        cancelado: 0,
      };
      for (const order of orders ?? []) {
        const request =
          order.origin === "catalogo" &&
          order.kind === "pre_pedido" &&
          order.status === "pre_pedido" &&
          order.stock_state === "nenhum";
        if (request) {
          next.solicitacoes += 1;
          continue;
        }
        next.pedidos += 1;
        const stage = order.status === "cancelado" ? "cancelado" : order.workflow_stage;
        if (stage in next) next[stage] += 1;
      }
      return next;
    },
  });

  function editInPdv(next: PdvDraft) {
    setDraft({ ...next });
    setCashOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
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
              if (cashOpen) return setCashOpen(false);
              setDraft(savedDraft ? { ...savedDraft } : null);
              setCashOpen(true);
            }}
          >
            {cashOpen ? <X className="mr-1 size-4" /> : <Plus className="mr-1 size-4" />}
            {cashOpen ? "Fechar pedido" : "Novo pedido"}
          </Button>
        }
      />
      {cashOpen && (
        <Card className="mb-5">
          <CardContent className="pt-5">
            <Pdv
              productId={productId}
              draft={draft}
              readOnly={!estadualAccess.canWrite}
              onFinished={() => {
                setDraft(null);
                setCashOpen(false);
                setTab("pedidos");
              }}
            />
          </CardContent>
        </Card>
      )}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto w-full justify-start overflow-x-auto p-1">
          <TabsTrigger value="solicitacoes">Solicitações ({counts.solicitacoes ?? 0})</TabsTrigger>
          <TabsTrigger value="rascunhos">Rascunhos ({savedDraft ? 1 : 0})</TabsTrigger>
          <TabsTrigger value="pedidos">Pedidos ({counts.pedidos ?? 0})</TabsTrigger>
          <TabsTrigger value="pedido_feito">Pedidos feitos ({counts.pedido_feito ?? 0})</TabsTrigger>
          <TabsTrigger value="em_caminho">Em caminho ({counts.em_caminho ?? 0})</TabsTrigger>
          <TabsTrigger value="vendido">Pagos ({counts.vendido ?? 0})</TabsTrigger>
          <TabsTrigger value="pagamento_parcial">
            Pagamento parcial ({counts.pagamento_parcial ?? 0})
          </TabsTrigger>
          <TabsTrigger value="esperando_pagamento">
            Esperando pagamento ({counts.esperando_pagamento ?? 0})
          </TabsTrigger>
          <TabsTrigger value="perdido">Produtos perdidos ({counts.perdido ?? 0})</TabsTrigger>
          <TabsTrigger value="cancelado">Cancelados ({counts.cancelado ?? 0})</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>
        <TabsContent value="solicitacoes" className="pt-4">
          <DocsList kind="pre_pedido" productId={productId} requestsOnly onEdit={estadualAccess.canWrite ? editInPdv : undefined} />
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
                <Button
                  disabled={!estadualAccess.canWrite}
                  variant="outline"
                  onClick={() => {
                    setDraft({ ...savedDraft });
                    setCashOpen(true);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
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
            onEdit={estadualAccess.canWrite ? editInPdv : undefined}
          />
        </TabsContent>
        <TabsContent value="pedido_feito" className="pt-4">
          <DocsList kind="venda" productId={productId} stage="pedido_feito" onEdit={estadualAccess.canWrite ? editInPdv : undefined} />
        </TabsContent>
        <TabsContent value="em_caminho" className="pt-4">
          <DocsList kind="venda" productId={productId} stage="em_caminho" onEdit={estadualAccess.canWrite ? editInPdv : undefined} />
        </TabsContent>
        <TabsContent value="vendido" className="pt-4">
          <DocsList kind="venda" productId={productId} stage="vendido" onEdit={estadualAccess.canWrite ? editInPdv : undefined} />
        </TabsContent>
        <TabsContent value="pagamento_parcial" className="pt-4">
          <DocsList
            kind="venda"
            productId={productId}
            stage="pagamento_parcial"
            onEdit={estadualAccess.canWrite ? editInPdv : undefined}
          />
        </TabsContent>
        <TabsContent value="esperando_pagamento" className="pt-4">
          <DocsList
            kind="venda"
            productId={productId}
            stage="esperando_pagamento"
            onEdit={estadualAccess.canWrite ? editInPdv : undefined}
          />
        </TabsContent>
        <TabsContent value="cancelado" className="pt-4">
          <DocsList kind="venda" productId={productId} stage="cancelado" />
        </TabsContent>
        <TabsContent value="perdido" className="pt-4">
          <DocsList kind="venda" productId={productId} stage="perdido" onEdit={estadualAccess.canWrite ? editInPdv : undefined} />
        </TabsContent>
        <TabsContent value="historico" className="pt-4">
          <OrderHistoryList />
        </TabsContent>
      </Tabs>
    </div>
  );
}
