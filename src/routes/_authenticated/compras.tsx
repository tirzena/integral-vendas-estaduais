import { getPurchasePositions } from "@/lib/purchase-position.functions";
import { isConsolidatedPurchase } from "@/lib/purchase-position";
import { getSupplierStock, receiveSupplierLots } from "@/lib/supplier-stock.functions";
import { OperationalFilters, useOperationalFilters } from "@/components/common/OperationalFilters";
import { enrichOperationalRow, filterOperationalRows } from "@/lib/operational-filters";
import { useOperationalMetadata } from "@/hooks/useOperationalMetadata";
import { ReportButton } from "@/components/common/ReportButton";
import { PaymentMeter } from "@/components/common/PaymentMeter";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileDown, PackagePlus, Plus, ReceiptText, Trash2, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useAuth";
import { useRates } from "@/hooks/useRates";
import { downloadPurchasePdf } from "@/lib/purchase-pdf";
import { CURRENCIES, formatDate, formatMoney, type Currency } from "@/lib/format";
import { PageHeader } from "@/components/common/PageHeader";
import { CurrencyValues } from "@/components/common/CurrencyValues";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/compras")({ component: PurchasesPage });

type Options = {
  suppliers: any[];
  warehouses: any[];
  items: any[];
};
type Line = {
  key: string;
  lotId: string;
  itemId: string;
  quantity: string;
  bonus: string;
  unitCost: string;
};

const today = () => new Date().toISOString().slice(0, 10);
const newLine = (): Line => ({
  key: crypto.randomUUID(),
  lotId: "",
  itemId: "",
  quantity: "",
  bonus: "0",
  unitCost: "",
});
const blankPurchase = () => ({
  supplierId: "",
  warehouseId: "",
  currency: "USD" as Currency,
  purchaseDate: today(),
  dueDate: "",
  freightCost: "0",
  variableCost: "0",
  notes: "",
  lines: [newLine()],
});

const paymentLabel: Record<string, string> = {
  pendente: "Pendente",
  parcial: "Pagamento parcial",
  pago: "Pago",
  cancelado: "Cancelado",
};

function PurchasesPage() {
  const { isAdmin, loading } = useCurrentUser();
  const rates = useRates();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [filters, setFilters] = useOperationalFilters();
  const metadata = useOperationalMetadata(isAdmin);
  const [purchaseTab, setPurchaseTab] = useState("ativas");
  const [form, setForm] = useState(blankPurchase);
  const [purchaseMode, setPurchaseMode] = useState<"produtos" | "lotes">("produtos");
  useEffect(() => {
    const fase = new URLSearchParams(window.location.search).get("fase");
    if (
      fase &&
      [
        "ativas",
        "trajeto",
        "pagos",
        "parcial",
        "pendentes",
        "perdidas",
        "canceladas",
        "consolidadas",
      ].includes(fase)
    )
      setPurchaseTab(fase);
  }, []);
  const [payment, setPayment] = useState({
    amount: "",
    method: "PIX",
    paidAt: today(),
    reference: "",
    notes: "",
  });

  const optionsQuery = useQuery({
    queryKey: ["purchase-management-options"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("purchase_management_options");
      if (error) throw error;
      return data as Options;
    },
  });
  const purchasesQuery = useQuery({
    queryKey: ["purchases-management"],
    enabled: isAdmin,
    queryFn: async () => {
      const positions = await getPurchasePositions();
      const { data, error } = await (supabase as any).rpc("purchases_for_management");
      if (error) throw error;
      const purchases = (data ?? []) as any[];
      const ids = [...new Set(purchases.map((p) => p.source_order_id).filter(Boolean))];
      const orders: any[] = [];
      for (let offset = 0; offset < ids.length; offset += 100) {
        const result = await (supabase as any)
          .from("orders")
          .select(
            "id,number,revision_no,seller_id,origin,status,workflow_stage,fulfillment_status,tracking_status,delivered_at,total,currency,amount_paid,amount_receivable",
          )
          .in("id", ids.slice(offset, offset + 100));
        if (result.error) throw result.error;
        orders.push(...(result.data ?? []));
      }
      return purchases
        .map((p) => ({
          ...p,
          position: positions.find((position) => position.id === p.id),
          source_order: orders.find((o) => o.id === p.source_order_id) ?? p.source_order,
        }))
        .sort((a, b) => Number(a.number) - Number(b.number));
    },
  });

  const options = optionsQuery.data ?? { suppliers: [], warehouses: [], items: [] };
  const supplierItems = options.items.filter((item) => item.supplier_id === form.supplierId);
  const stockQuery = useQuery({
    queryKey: ["supplier-stock", form.supplierId],
    enabled: isAdmin && !!form.supplierId,
    queryFn: () => getSupplierStock({ data: { supplierId: form.supplierId } }),
  });
  const supplierLots = (stockQuery.data?.lots ?? []).filter(
    (lot: any) =>
      Number(lot.available) > 0 && lot.currency === form.currency && lot.expiry_date >= today(),
  );
  const updateLine = (key: string, patch: Partial<Line>) =>
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    }));
  const merchandiseTotal = form.lines.reduce((sum, line) => {
    const quantity = Math.max(0, Number(line.quantity) || 0);
    const bonus = Math.min(quantity, Math.max(0, Number(line.bonus) || 0));
    return sum + (quantity - bonus) * Math.max(0, Number(line.unitCost) || 0);
  }, 0);
  const purchaseTotal =
    merchandiseTotal + Number(form.freightCost || 0) + Number(form.variableCost || 0);

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["purchases-management"] });
    qc.invalidateQueries({ queryKey: ["finance"] });
    qc.invalidateQueries({ queryKey: ["inventory"] });
    await Promise.all(
      [
        "inventory_items",
        "warehouse_inventory",
        "inventory_movements",
        "warehouses",
        "dashboard-data",
        "supplier-stock",
        "authenticity-admin",
      ].map((key) => qc.invalidateQueries({ queryKey: [key] })),
    );
  };

  const createPurchase = useMutation({
    mutationFn: async () => {
      if (!form.supplierId || !form.warehouseId)
        throw new Error("Escolha o fornecedor e o estoque principal.");
      if (
        form.lines.some(
          (line) =>
            !line.itemId ||
            (purchaseMode === "lotes" && !line.lotId) ||
            !Number.isInteger(Number(line.quantity)) || Number(line.quantity) <= 0 ||
            !Number.isInteger(Number(line.bonus)) || Number(line.bonus) < 0 ||
            Number(line.bonus) > Number(line.quantity) ||
            Number(line.unitCost) <= 0,
        )
      )
        throw new Error("Preencha produto, quantidade, bonificação e custo unitário de todos os itens.");
      if (purchaseMode === "produtos") {
        const { data, error } = await (supabase as any).rpc("purchase_create", {
          p_supplier_id: form.supplierId,
          p_warehouse_id: form.warehouseId,
          p_currency: form.currency,
          p_purchase_date: form.purchaseDate,
          p_due_date: form.dueDate || null,
          p_items: form.lines.map((line) => ({
            item_id: line.itemId,
            quantity: Number(line.quantity),
            bonus_quantity: Number(line.bonus || 0),
            unit_cost: Number(line.unitCost),
          })),
          p_freight_cost: Number(form.freightCost || 0),
          p_variable_cost: Number(form.variableCost || 0),
          p_notes: form.notes || null,
        });
        if (error) throw error;
        return data;
      }
      return receiveSupplierLots({
        data: {
          supplierId: form.supplierId,
          warehouseId: form.warehouseId,
          currency: form.currency,
          purchaseDate: form.purchaseDate,
          dueDate: form.dueDate || null,
          items: form.lines.map((line) => ({
            lot_id: line.lotId,
            quantity: Number(line.quantity),
            bonus_quantity: Number(line.bonus || 0),
            unit_cost: Number(line.unitCost),
          })),
          freight: Number(form.freightCost || 0),
          variable: Number(form.variableCost || 0),
          notes: form.notes || null,
        },
      });
    },
    onSuccess: async (created) => {
      toast.success(`Ordem de compra #OC-${String(created.number).padStart(2, "0")} registrada.`);
      setCreateOpen(false);
      setForm(blankPurchase());
      await refresh();
    },
    onError: (error: any) => toast.error(error?.message ?? "Não foi possível registrar a compra."),
  });

  const registerPayment = useMutation({
    mutationFn: async () => {
      if (!detail) throw new Error("Compra não selecionada.");
      const { error } = await (supabase as any).rpc("purchase_register_payment", {
        p_purchase_order_id: detail.id,
        p_amount: Number(payment.amount),
        p_method: payment.method,
        p_paid_at: payment.paidAt,
        p_reference: payment.reference || null,
        p_notes: payment.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Pagamento registrado e saldo atualizado.");
      setPayment({ amount: "", method: "PIX", paidAt: today(), reference: "", notes: "" });
      await refresh();
      setDetail(null);
    },
    onError: (error: any) =>
      toast.error(error?.message ?? "Não foi possível registrar o pagamento."),
  });

  const filterRows = useMemo(
    () =>
      (purchasesQuery.data ?? []).map((p) => ({
        ...enrichOperationalRow(p, metadata.data ?? {}, p.items ?? [], true),
        filterStatus: p.payment_status,
        filterStatuses: [
          p.payment_status,
          ...(p.status === "cancelada" ? ["cancelado"] : []),
          ...(p.status === "perdida" || p.source_order?.fulfillment_status === "perdido"
            ? ["perdido"]
            : []),
          ...(p.source_order?.fulfillment_status === "a_caminho" && !p.source_order?.delivered_at
            ? ["em_caminho"]
            : []),
          ...(p.source_order?.fulfillment_status === "entregue" || p.source_order?.delivered_at
            ? ["entregue"]
            : []),
        ],
      })),
    [purchasesQuery.data, metadata.data],
  );
  const globalRows = useMemo(
    () => filterOperationalRows(filterRows, filters),
    [filterRows, filters],
  );
  const filtered = useMemo(() => {
    return globalRows.filter((purchase) => {
      const consolidated = isConsolidatedPurchase(purchase);
      if (purchaseTab === "consolidadas") return consolidated;
      if (consolidated) return false;
      const cancelled = purchase.status === "cancelada";
      const lost =
        purchase.source_order?.fulfillment_status === "perdido" || purchase.status === "perdida";
      if (purchaseTab === "canceladas" ? !cancelled : cancelled) return false;
      if (purchaseTab === "perdidas" ? !lost : purchaseTab === "ativas" && lost) return false;
      if (
        purchaseTab === "trajeto" &&
        (lost ||
          purchase.source_order?.delivered_at ||
          purchase.source_order?.fulfillment_status !== "a_caminho")
      )
        return false;
      const tabPayment = { pagos: "pago", parcial: "parcial", pendentes: "pendente" }[purchaseTab];
      if (tabPayment && purchase.payment_status !== tabPayment) return false;
      return true;
    });
  }, [purchaseTab, globalRows]);

  const summaries = useMemo(() => {
    return globalRows.reduce(
      (total, row) => {
        if (row.status === "cancelada") return total;
        total.purchased += rates.convert(Number(row.total || 0), row.currency, "BRL") ?? 0;
        total.paid += rates.convert(Number(row.amount_paid || 0), row.currency, "BRL") ?? 0;
        if (row.source_order?.fulfillment_status === "perdido" || row.status === "perdida")
          total.lost += rates.convert(Number(row.total || 0), row.currency, "BRL") ?? 0;
        else if (
          !row.source_order?.delivered_at &&
          row.source_order?.fulfillment_status === "a_caminho"
        )
          total.transit += rates.convert(Number(row.total || 0), row.currency, "BRL") ?? 0;
        total.payable += rates.convert(Number(row.position?.debt || 0), row.currency, "BRL") ?? 0;
        return total;
      },
      { purchased: 0, paid: 0, payable: 0, transit: 0, lost: 0 },
    );
  }, [globalRows, rates]);

  const productSummaries = useMemo(() => {
    const groups: Record<
      string,
      Map<string, { description: string; quantity: number }>
    > = Object.fromEntries(
      ["purchased", "paid", "payable", "transit", "lost"].map((key) => [key, new Map()]),
    );
    for (const purchase of globalRows) {
      if (purchase.status === "cancelada") continue;
      const total = Math.max(0, Number(purchase.total || 0));
      const paidRatio =
        total > 0 ? Math.min(1, Math.max(0, Number(purchase.amount_paid || 0) / total)) : 0;
      const pendingRatio =
        total > 0 ? Math.min(1, Math.max(0, Number(purchase.position?.debt || 0) / total)) : 0;
      const lost =
        purchase.source_order?.fulfillment_status === "perdido" || purchase.status === "perdida";
      const transit =
        !lost &&
        !purchase.source_order?.delivered_at &&
        purchase.source_order?.fulfillment_status === "a_caminho";
      for (const item of purchase.items ?? []) {
        const quantity = Math.max(0, Number(item.quantity || 0));
        const description = item.description || "Produto sem nome";
        const key = item.item_id || description;
        for (const [group, ratio] of Object.entries({
          purchased: 1,
          paid: paidRatio,
          payable: pendingRatio,
          transit: transit ? 1 : 0,
          lost: lost ? 1 : 0,
        })) {
          if (quantity * ratio <= 0) continue;
          const previous = groups[group].get(key);
          groups[group].set(key, {
            description,
            quantity: (previous?.quantity ?? 0) + quantity * ratio,
          });
        }
      }
    }
    return Object.fromEntries(
      Object.entries(groups).map(([key, products]) => [
        key,
        [...products.values()].sort((a, b) => a.description.localeCompare(b.description, "pt-BR")),
      ]),
    );
  }, [globalRows]);

  const pdf = async (purchase: any) => {
    const money = (value: number) =>
      (["BRL", "USD", "PYG"] as Currency[])
        .map((currency) => rates.money(value, purchase.currency, currency))
        .join(" · ");
    await downloadPurchasePdf({
      number: purchase.number,
      status: `${purchase.status === "cancelada" ? "Cancelada" : "Confirmada"} · ${paymentLabel[purchase.payment_status]}`,
      supplier: purchase.supplier,
      buyer: purchase.buyer,
      warehouse: purchase.warehouse,
      purchaseDate: purchase.purchase_date,
      dueDate: purchase.due_date,
      currency: purchase.currency,
      sourceOrder: purchase.source_order,
      items: purchase.items.map((item: any) => ({
        description: item.description,
        sku: item.sku,
        quantity: Number(item.quantity),
        bonusQuantity: Number(item.bonus_quantity),
        payableQuantity: Number(item.payable_quantity),
        unitCost: Number(item.unit_cost),
        total: Number(item.total),
      })),
      merchandiseTotal: Number(purchase.merchandise_total),
      freightCost: Number(purchase.freight_cost),
      variableCost: Number(purchase.variable_cost),
      total: Number(purchase.total),
      amountPaid: Number(purchase.amount_paid),
      amountPayable: Number(purchase.amount_payable),
      payments: purchase.payments.map((entry: any) => ({
        installment: entry.installment,
        paidAt: entry.paid_at,
        method: entry.method,
        amount: Number(entry.amount),
        registeredBy: entry.created_by_name,
        reference: entry.reference,
      })),
      notes: purchase.notes,
      money,
    });
  };

  if (loading) return <p className="text-sm text-muted-foreground">Carregando permissões...</p>;
  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="p-10 text-center">
          Somente administradores podem acessar as compras da empresa.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Compras"
        description="Cada pedido confirmado gera a compra do fornecedor. Compras manuais registram reposições independentes no estoque principal."
        actions={
          <Button
            onClick={() => {
              const initial = blankPurchase();
              initial.warehouseId = options.warehouses[0]?.id ?? "";
              setForm(initial);
              setPurchaseMode("produtos");
              setCreateOpen(true);
            }}
          >
            <Plus className="mr-2 size-4" /> Nova compra
          </Button>
        }
      />

      <div className="grid gap-3 md:grid-cols-3">
        <Summary
          label="Total comprado"
          value={summaries.purchased}
          products={productSummaries.purchased}
          equivalent={false}
          currency="BRL"
          icon={<PackagePlus className="size-5 text-primary" />}
        />
        <Summary
          label="Total pago"
          value={summaries.paid}
          products={productSummaries.paid}
          equivalent={true}
          currency="BRL"
          icon={<WalletCards className="size-5 text-emerald-600" />}
        />
        <Summary
          label="Custo faturado a pagar"
          value={summaries.payable}
          products={productSummaries.payable}
          equivalent={true}
          currency="BRL"
          icon={<ReceiptText className="size-5 text-amber-600" />}
        />
        <Summary
          label="Total em trajeto"
          value={summaries.transit}
          products={productSummaries.transit}
          equivalent={false}
          currency="BRL"
          icon={<PackagePlus className="size-5" />}
        />
        <Summary
          label="Total perdido"
          value={summaries.lost}
          products={productSummaries.lost}
          equivalent={false}
          currency="BRL"
          icon={<ReceiptText className="size-5 text-destructive" />}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        O lote em estoque fica separado da dívida. Apenas o custo dos produtos faturados fica a
        pagar, abatido pelos repasses já registrados. Compras consolidadas preservam o histórico sem
        repetir a cobrança.
      </p>
      <Tabs
        value={purchaseTab}
        onValueChange={(value) => {
          setPurchaseTab(value);
          setFilters({ ...filters, status: "todos" });
        }}
      >
        <TabsList className="h-auto w-full justify-start overflow-x-auto p-1">
          <TabsTrigger value="ativas">
            Compras ({globalRows.filter((p) => p.status !== "cancelada").length})
          </TabsTrigger>
          <TabsTrigger value="trajeto">Em caminho</TabsTrigger>
          <TabsTrigger value="pagos">Pagos</TabsTrigger>
          <TabsTrigger value="parcial">Pagamento parcial</TabsTrigger>
          <TabsTrigger value="pendentes">Esperando pagamento</TabsTrigger>
          <TabsTrigger value="perdidas">Produtos perdidos</TabsTrigger>
          <TabsTrigger value="consolidadas">
            Compras consolidadas ({globalRows.filter(isConsolidatedPurchase).length})
          </TabsTrigger>
          <TabsTrigger value="canceladas">
            Compras canceladas (
            {
              globalRows.filter((p) => p.status === "cancelada" && !isConsolidatedPurchase(p))
                .length
            }
            )
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <OperationalFilters
        rows={filterRows}
        value={filters}
        phase={purchaseTab}
        onChange={(next) => {
          setFilters(next);
          const tab = (
            {
              cancelado: "canceladas",
              perdido: "perdidas",
              em_caminho: "trajeto",
              pago: "pagos",
              parcial: "parcial",
              pendente: "pendentes",
            } as Record<string, string>
          )[next.status];
          if (tab) setPurchaseTab(tab);
        }}
        statuses={{
          ...paymentLabel,
          perdido: "Perdido",
          em_caminho: "Em caminho",
          entregue: "Entregue",
        }}
        actions={
          <ReportButton
            label="Exportar relatório"
            title="Relatório de compras"
            filename="compras"
            build={() => {
              if (
                purchasesQuery.isLoading ||
                metadata.isLoading ||
                purchasesQuery.isError ||
                metadata.isError
              )
                throw new Error("Aguarde o carregamento das compras e dos filtros.");
              return {
                headers: [
                  "Compra",
                  "Fornecedor",
                  "Vendedor / comprador",
                  "Unidades",
                  "Produtos e quantidades",
                  "Valor",
                  "Pago %",
                ],
                rows: filtered.map((p) => [
                  `#OC-${String(p.number).padStart(2, "0")}`,
                  p.supplier?.name,
                  p.filterSeller?.name,
                  (p.items ?? []).reduce((n: number, i: any) => n + Number(i.quantity || 0), 0),
                  (p.items ?? [])
                    .map(
                      (i: any) =>
                        `${i.description} — ${Number(i.quantity || 0).toLocaleString("pt-BR")} unidades`,
                    )
                    .join("; "),
                  (["BRL", "USD", "PYG"] as Currency[])
                    .map((c) => rates.money(Number(p.total), p.currency, c))
                    .join(" · "),
                  Number(p.total) > 0
                    ? Math.min(100, (Number(p.amount_paid || 0) / Number(p.total)) * 100).toFixed(
                        1,
                      ) + "%"
                    : "0%",
                ]),
              };
            }}
          />
        }
      />
      {metadata.isError && (
        <p role="alert" className="text-destructive">
          Não foi possível carregar os filtros de vendedor, equipe, produto e fornecedor.
        </p>
      )}

      {purchasesQuery.isError ? (
        <Card>
          <CardContent className="p-10 text-center text-destructive">
            Não foi possível carregar as compras.
          </CardContent>
        </Card>
      ) : purchasesQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando compras...</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            Nenhuma ordem de compra encontrada.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((purchase) => (
            <Card
              key={purchase.id}
              className="cursor-pointer hover:border-primary/40"
              onClick={() => setDetail(purchase)}
            >
              <CardContent className="flex flex-col justify-between gap-4 p-5 md:flex-row md:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>#OC-{String(purchase.number).padStart(2, "0")}</strong>
                    {isConsolidatedPurchase(purchase) && (
                      <Badge variant="outline">Consolidada no lote · sem cobrança duplicada</Badge>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Link to="/fornecedores/$id" params={{ id: purchase.supplier.id }}>
                        Ver lotes do fornecedor
                      </Link>
                    </Button>
                    <Badge variant={purchase.payment_status === "pago" ? "default" : "secondary"}>
                      Pagamento:{" "}
                      {isConsolidatedPurchase(purchase)
                        ? "Incorporado ao lote"
                        : paymentLabel[purchase.payment_status]}
                    </Badge>
                    <Badge variant="outline">
                      {purchase.source_type === "sales_order"
                        ? `Pedido #${String(purchase.source_order?.number ?? "").padStart(2, "0")}${
                            Number(purchase.source_order?.revision_no ?? 1) > 1
                              ? `.${Number(purchase.source_order.revision_no) - 1}`
                              : ""
                          }`
                        : "Compra manual"}
                    </Badge>
                    {purchase.source_order && (
                      <Badge variant="outline">
                        Entrega:{" "}
                        {purchase.source_order.fulfillment_status === "perdido"
                          ? "Perdida"
                          : purchase.source_order.delivered_at ||
                              purchase.source_order.fulfillment_status === "entregue"
                            ? "Entregue"
                            : purchase.source_order.fulfillment_status === "a_caminho"
                              ? "Em trajeto"
                              : "Em ajuste"}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm">
                    Fornecedor: {purchase.supplier.name} ·{" "}
                    {purchase.items
                      .reduce((total: number, item: any) => total + Number(item.quantity || 0), 0)
                      .toLocaleString("pt-BR")}{" "}
                    unidades · {purchase.items.length} produtos diferentes
                  </p>
                  <p className="mt-3 text-xs font-medium">Pagamento ao fornecedor</p>
                  <PaymentMeter
                    paid={Number(purchase.amount_paid || 0)}
                    total={Number(purchase.total || 0)}
                    outgoing
                  />
                  {purchase.source_order && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 dark:border-emerald-900 dark:bg-emerald-950/20">
                      <p className="text-xs font-medium">
                        Recebimento do cliente · pedido vinculado
                      </p>
                      <div className="mt-2 flex flex-wrap gap-4 text-xs">
                        <span className="text-emerald-700 dark:text-emerald-400">
                          Recebido:{" "}
                          <CurrencyValues
                            value={Number(purchase.source_order.amount_paid || 0)}
                            currency={purchase.source_order.currency}
                            layout="inline"
                          />
                        </span>
                        <span>
                          A receber:{" "}
                          <CurrencyValues
                            value={Number(
                              purchase.source_order.amount_receivable ??
                                Math.max(
                                  0,
                                  Number(purchase.source_order.total || 0) -
                                    Number(purchase.source_order.amount_paid || 0),
                                ),
                            )}
                            currency={purchase.source_order.currency}
                            layout="inline"
                          />
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Recebimento do cliente aplicado proporcionalmente ao custo da compra,
                        conforme a regra de repasse automático.
                      </p>
                    </div>
                  )}
                  <ul className="my-2 space-y-1 text-sm">
                    {purchase.items.map((item: any) => (
                      <li key={item.id ?? item.item_id}>
                        {item.description} —{" "}
                        <strong>
                          {Number(item.quantity || 0).toLocaleString("pt-BR")} unidades
                        </strong>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">
                    {purchase.source_type === "sales_order" ? "Solicitado" : "Comprado"} por{" "}
                    {purchase.buyer?.name ?? "Sistema"} em {formatDate(purchase.purchase_date)}
                  </p>
                </div>
                <div className="md:text-right">
                  <CurrencyValues value={purchase.total} currency={purchase.currency} emphasize />
                  <div className="mt-1 text-xs text-muted-foreground">
                    Custo faturado a pagar:
                    <CurrencyValues
                      value={purchase.position?.debt ?? 0}
                      currency={purchase.currency}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Nova ordem de compra</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Fornecedor">
              <Select
                value={form.supplierId}
                onValueChange={(supplierId) =>
                  setForm((current) => ({ ...current, supplierId, lines: [newLine()] }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {options.suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Estoque principal">
              <Select
                value={form.warehouseId}
                onValueChange={(warehouseId) => setForm((current) => ({ ...current, warehouseId }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {options.warehouses.map((warehouse) => (
                    <SelectItem key={warehouse.id} value={warehouse.id}>
                      {warehouse.name} · {warehouse.city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Moeda da compra">
              <Select
                value={form.currency}
                onValueChange={(currency: Currency) =>
                  setForm((current) => ({
                    ...current,
                    currency,
                    lines: current.lines.map((line) => ({ ...line, lotId: "", unitCost: "" })),
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((currency) => (
                    <SelectItem key={currency.value} value={currency.value}>
                      {currency.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Data da compra">
              <Input
                type="date"
                value={form.purchaseDate}
                onChange={(e) =>
                  setForm((current) => ({ ...current, purchaseDate: e.target.value }))
                }
              />
            </Field>
            <Field label="Vencimento">
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm((current) => ({ ...current, dueDate: e.target.value }))}
              />
            </Field>
          </div>

          <Tabs
            value={purchaseMode}
            onValueChange={(mode) => {
              setPurchaseMode(mode as "produtos" | "lotes");
              setForm((current) => ({ ...current, lines: [newLine()] }));
            }}
          >
            <TabsList>
              <TabsTrigger value="produtos">Produtos cadastrados</TabsTrigger>
              <TabsTrigger value="lotes">Lotes do fornecedor</TabsTrigger>
            </TabsList>
          </Tabs>
          <p className="text-xs text-muted-foreground">
            {purchaseMode === "produtos"
              ? "Compra por produto registra a entrada no estoque sem vincular códigos de lote. Para produtos rastreados, use a compra por lote."
              : "Compra por lote recebe unidades já cadastradas no estoque do fornecedor."}
          </p>
          <div className="space-y-3 rounded-xl border p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">
                {purchaseMode === "produtos" ? "Produtos do fornecedor" : "Lotes disponíveis no estoque do fornecedor"}
              </h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!form.supplierId}
                onClick={() =>
                  setForm((current) => ({ ...current, lines: [...current.lines, newLine()] }))
                }
              >
                <Plus className="mr-1 size-4" /> Produto
              </Button>
            </div>
            {optionsQuery.isError && <p role="alert">Não foi possível carregar os produtos: {optionsQuery.error.message}</p>}
            {purchaseMode === "lotes" && stockQuery.isError && <p role="alert">{stockQuery.error.message}</p>}
            {purchaseMode === "produtos" && form.supplierId && !optionsQuery.isPending && !supplierItems.length && (
              <p className="text-sm text-muted-foreground">
                Este fornecedor ainda não tem produtos vinculados ao cadastro de estoque.
              </p>
            )}
            {purchaseMode === "lotes" && form.supplierId && !stockQuery.isPending && !supplierLots.length && (
              <p className="text-sm text-muted-foreground">
                Nenhum lote disponível nesta moeda. Registre a compra do lote na ficha do
                fornecedor.
              </p>
            )}
            {form.lines.map((line, index) => (
              <div
                key={line.key}
                className="grid gap-3 rounded-lg bg-muted/30 p-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]"
              >
                <Field label={`Produto ${index + 1}`}>
                  <Select
                    value={purchaseMode === "lotes" ? line.lotId : line.itemId}
                    onValueChange={(id) => {
                      if (purchaseMode === "lotes") {
                        const lot = supplierLots.find((row: any) => row.id === id);
                        updateLine(line.key, {
                          itemId: lot?.item_id ?? "", lotId: id, quantity: "",
                          unitCost: String(lot?.unit_cost ?? ""),
                        });
                      } else {
                        const item = supplierItems.find((row) => row.id === id);
                        updateLine(line.key, {
                          itemId: id, lotId: "", quantity: "",
                          unitCost: item?.currency === form.currency ? String(item.cost ?? "") : "",
                        });
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={form.supplierId ? "Selecione" : "Escolha o fornecedor"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {purchaseMode === "lotes"
                        ? supplierLots.map((item: any) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.inventory_items?.name} · Lote {item.lot_number} ·{" "}
                              {Number(item.available).toLocaleString("pt-BR")} disponíveis
                            </SelectItem>
                          ))
                        : supplierItems.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.name}{item.sku ? ` · ${item.sku}` : ""}
                            </SelectItem>
                          ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Qtd. recebida">
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    max={purchaseMode === "lotes" ? supplierLots.find((lot: any) => lot.id === line.lotId)?.available : undefined}
                    value={line.quantity}
                    onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                  />
                </Field>
                <Field label="Qtd. bonificada">
                  <Input
                    type="number"
                    min="0"
                    step="0.001"
                    value={line.bonus}
                    onChange={(e) => updateLine(line.key, { bonus: e.target.value })}
                  />
                </Field>
                <Field label={`Custo unit. (${form.currency})`}>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={line.unitCost}
                    onChange={(e) => updateLine(line.key, { unitCost: e.target.value })}
                  />
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="self-end"
                  disabled={form.lines.length === 1}
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      lines: current.lines.filter((item) => item.key !== line.key),
                    }))
                  }
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`Frete (${form.currency})`}>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.freightCost}
                onChange={(e) =>
                  setForm((current) => ({ ...current, freightCost: e.target.value }))
                }
              />
            </Field>
            <Field label={`Outros custos (${form.currency})`}>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.variableCost}
                onChange={(e) =>
                  setForm((current) => ({ ...current, variableCost: e.target.value }))
                }
              />
            </Field>
            <div className="sm:col-span-2">
              <Label>Observações</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))}
              />
            </div>
          </div>
          <div className="rounded-xl border bg-muted/20 p-4 text-right">
            <p className="text-sm text-muted-foreground">
              Produtos: {formatMoney(merchandiseTotal, form.currency)}
            </p>
            <CurrencyValues value={purchaseTotal} currency={form.currency} emphasize />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => createPurchase.mutate()} disabled={createPurchase.isPending}>
              {createPurchase.isPending ? "Registrando..." : "Confirmar compra e dar entrada"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        {detail && (
          <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle>
                Ordem de compra #OC-{String(detail.number).padStart(2, "0")}
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-wrap justify-between gap-3 rounded-xl border p-4">
              <div>
                <strong>Fornecedor: {detail.supplier.name}</strong>
                <p className="text-sm text-muted-foreground">
                  Comprado por {detail.buyer.name} · {formatDate(detail.purchase_date)}
                </p>
              </div>
              <Badge>Pagamento: {paymentLabel[detail.payment_status]}</Badge>
            </div>
            {detail.source_order && (
              <div className="rounded-xl border p-4">
                <p className="font-medium">Recebimento do cliente · pedido vinculado</p>
                <PaymentMeter
                  paid={Number(detail.source_order.amount_paid || 0)}
                  total={Number(detail.source_order.total || 0)}
                />
                <p className="text-sm text-emerald-600">
                  Recebido:{" "}
                  <CurrencyValues
                    value={Number(detail.source_order.amount_paid || 0)}
                    currency={detail.source_order.currency}
                    layout="inline"
                  />
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Este valor representa o recebimento total do pedido, não um pagamento realizado ao
                  fornecedor.
                </p>
              </div>
            )}
            <div className="rounded-xl border bg-muted/30 p-4 text-sm">
              <p className="font-medium">Percurso dos produtos</p>
              <p className="mt-1">
                Fornecedor: {detail.supplier.name} →{" "}
                {detail.warehouse?.name ?? "Estoque não informado"}
                {detail.source_order
                  ? ` → Pedido #${String(detail.source_order.number).padStart(2, "0")}`
                  : " → Destino dos pedidos"}
              </p>
              {detail.source_order && (
                <p className="mt-1 text-muted-foreground">
                  Entrega:{" "}
                  {detail.source_order.fulfillment_status === "perdido"
                    ? "Perdida"
                    : detail.source_order.fulfillment_status === "entregue"
                      ? "Entregue"
                      : detail.source_order.fulfillment_status === "a_caminho"
                        ? "Em trajeto"
                        : "Em ajuste"}
                </p>
              )}
            </div>
            <div className="space-y-2">
              {detail.items.map((item: any) => (
                <div
                  key={item.id}
                  className="flex flex-col justify-between gap-2 rounded-lg border p-3 sm:flex-row"
                >
                  <div>
                    <strong>{item.description}</strong>
                    <p className="text-xs text-muted-foreground">
                      Recebido: {Number(item.quantity).toLocaleString("pt-BR")} · Bônus:{" "}
                      {Number(item.bonus_quantity).toLocaleString("pt-BR")} · Cobrado:{" "}
                      {Number(item.payable_quantity).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <CurrencyValues value={item.total} currency={detail.currency} />
                </div>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Summary
                label="Total"
                value={detail.total}
                currency={detail.currency}
                icon={<ReceiptText className="size-4" />}
              />
              <Summary
                label="Pago"
                value={detail.amount_paid}
                currency={detail.currency}
                icon={<WalletCards className="size-4" />}
              />
              <Summary
                label="A pagar"
                value={detail.amount_payable}
                currency={detail.currency}
                icon={<WalletCards className="size-4" />}
              />
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold">Pagamentos</h3>
              {detail.payments.length ? (
                detail.payments.map((entry: any) => (
                  <div key={entry.id} className="rounded-lg border p-3 text-sm">
                    <strong>
                      Parcela {entry.installment} · {formatDate(entry.paid_at)} · {entry.method}
                    </strong>
                    <CurrencyValues
                      value={entry.amount}
                      currency={entry.currency}
                      layout="inline"
                      className="mt-1 block"
                    />
                    <p className="text-xs text-muted-foreground">
                      Registrado por {entry.created_by_name}
                      {entry.reference ? ` · Ref.: ${entry.reference}` : ""}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum pagamento registrado.</p>
              )}
            </div>
            {detail.status !== "cancelada" && detail.amount_payable > 0 && (
              <div className="space-y-3 rounded-xl border p-4">
                <h3 className="font-semibold">Registrar pagamento</h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label={`Valor (${detail.currency})`}>
                    <Input
                      type="number"
                      min="0.01"
                      max={detail.amount_payable}
                      step="0.01"
                      value={payment.amount}
                      onChange={(e) =>
                        setPayment((current) => ({ ...current, amount: e.target.value }))
                      }
                    />
                  </Field>
                  <Field label="Forma">
                    <Select
                      value={payment.method}
                      onValueChange={(method) => setPayment((current) => ({ ...current, method }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["PIX", "Dinheiro", "Transferência", "Boleto", "Cartão", "Outro"].map(
                          (method) => (
                            <SelectItem key={method} value={method}>
                              {method}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Data">
                    <Input
                      type="date"
                      value={payment.paidAt}
                      onChange={(e) =>
                        setPayment((current) => ({ ...current, paidAt: e.target.value }))
                      }
                    />
                  </Field>
                  <Field label="Referência">
                    <Input
                      value={payment.reference}
                      onChange={(e) =>
                        setPayment((current) => ({ ...current, reference: e.target.value }))
                      }
                    />
                  </Field>
                  <div className="sm:col-span-2">
                    <Label>Observações</Label>
                    <Input
                      value={payment.notes}
                      onChange={(e) =>
                        setPayment((current) => ({ ...current, notes: e.target.value }))
                      }
                    />
                  </div>
                </div>
                <Button
                  onClick={() => registerPayment.mutate()}
                  disabled={registerPayment.isPending || Number(payment.amount) <= 0}
                >
                  Registrar pagamento
                </Button>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => pdf(detail)}>
                <FileDown className="mr-2 size-4" /> Baixar ordem de compra
              </Button>
              <Button onClick={() => setDetail(null)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Summary({
  label,
  value,
  currency,
  icon,
  products,
  equivalent,
}: {
  products: { description: string; quantity: number }[];
  equivalent: boolean;
  label: string;
  value: number;
  currency: Currency;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <div className="rounded-lg bg-muted p-2">{icon}</div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <CurrencyValues value={value} currency={currency} emphasize />
          <p className="mt-2 text-sm font-medium">
            {products
              .reduce((sum, product) => sum + product.quantity, 0)
              .toLocaleString("pt-BR", { maximumFractionDigits: 2 })}{" "}
            {equivalent ? "unidades equivalentes" : "unidades"} · {products.length} produtos
          </p>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {products.map((product) => (
              <li key={product.description}>
                {product.description} —{" "}
                {product.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} unidades
              </li>
            ))}
          </ul>
          {equivalent && (
            <p className="mt-2 text-xs text-muted-foreground">
              Quantidade proporcional ao valor {label === "Total pago" ? "pago" : "a pagar"}; não
              representa entrega física.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
