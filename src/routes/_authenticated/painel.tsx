import { getPurchasePositions } from "@/lib/purchase-position.functions";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BadgeDollarSign,
  Boxes,
  CircleCheck,
  CircleX,
  Clock3,
  PackageCheck,
  Truck,
  MessageCircle,
  Filter,
  RotateCcw,
  MapPin,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useProductScope } from "@/hooks/useProductScope";
import { useCurrentUser } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { CURRENCIES, formatMoney, formatDate, formatNumber, type Currency } from "@/lib/format";
import { useRates } from "@/hooks/useRates";
import { cn } from "@/lib/utils";
import { BRAZIL_REGIONS, matchesTerritory, regionForState, stateCodeFor, type TerritorySelection } from "@/lib/brazil-territory";
import { PageHeader, EmptyState } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { LiveRatesTicker } from "@/components/common/LiveRatesTicker";
import { RankingCard } from "@/components/dashboard/RankingCard";
import { NoticesCard } from "@/components/dashboard/NoticesCard";
import { TravelChampionships } from "@/components/ranking/TravelChampionships";
import { PromotionCard } from "@/components/dashboard/PromotionCard";
import { StateStockMap } from "@/components/dashboard/StateStockMap";
import { brazilStates } from "@/data/brazil-state-map";
import { ReportButton } from "@/components/common/ReportButton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({
    meta: [
      { title: "Painel estadual — Vendas Estaduais" },
      {
        name: "description",
        content: "Indicadores de vendas, atendimento, financeiro e estoque da sua operação.",
      },
      { property: "og:title", content: "Painel estadual — Vendas Estaduais" },
      { property: "og:description", content: "Indicadores da sua operação em tempo real." },
    ],
  }),
  component: Painel,
});

function formatKpiMoney(value: number | null, currency: Currency) {
  if (value === null) return "—";
  if (currency === "USD") return formatMoney(value, currency).replace("$", "US$");
  if (currency === "PYG") return `Gs. ${formatNumber(value)}`;
  return formatMoney(value, currency);
}

function Painel() {
  const { products } = useProductScope();
  const { profile, isAdmin } = useCurrentUser();
  const queryClient = useQueryClient();
  const { seesCompanySales, seesCompanyFinance, userId, canOpen } = usePermissions();
  const rates = useRates();
  const [displayCurrency, setDisplayCurrency] = useState<Currency>("BRL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sellerFilter, setSellerFilter] = useState("all");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [dashboardProductId, setDashboardProductId] = useState("todos");
  const [inventoryItemId, setInventoryItemId] = useState("all");
  const [selectedTerritory, setSelectedTerritory] = useState<TerritorySelection>({ mode: "national" });
  const [hoveredTerritory, setHoveredTerritory] = useState<TerritorySelection | null>(null);
  const [selectedDeliveryStage, setSelectedDeliveryStage] = useState<string | null>(null);
  const [hoveredOrderStatus, setHoveredOrderStatus] = useState<string | null>(null);
  const [selectedOrderStatus, setSelectedOrderStatus] = useState<string | null>(null);
  const orderStatusButtonsRef = useRef<HTMLDivElement>(null);
  const activeOrderStatus = hoveredOrderStatus ?? selectedOrderStatus;

  useEffect(() => {
    const clearOnOutsideClick = (event: PointerEvent) => {
      if (!orderStatusButtonsRef.current?.contains(event.target as Node)) {
        setSelectedOrderStatus(null);
        setHoveredOrderStatus(null);
      }
    };
    document.addEventListener("pointerdown", clearOnOutsideClick);
    return () => document.removeEventListener("pointerdown", clearOnOutsideClick);
  }, []);
  const territory = hoveredTerritory ?? selectedTerritory;
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["dashboard", seesCompanySales, seesCompanyFinance, userId],
    enabled: !!userId,
    retry: false,
    queryFn: async ({ signal }) => {
      const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(20_000)]);
      const scoped = (q: any) => q;
      // Quem não vê os números da empresa enxerga apenas o próprio trabalho.
      const mine = (q: any) => (seesCompanySales || !userId ? q : q.eq("seller_id", userId));
      const mineOwner = (q: any) => (seesCompanySales || !userId ? q : q.eq("owner_id", userId));
      const [
        cp,
        orders,
        orderItems,
        receivable,
        conversations,
        inventory,
        tasks,
        payable,
        people,
        roles,
        customers,
        locations,
        warehouses,
        warehouseBalances,
        regionLeaders,
        purchasePositions,
      ] = await Promise.all([
        mineOwner(
          scoped(
            supabase
              .from("customer_products")
              .select(
                "id,commercial_status,potential_value,currency,stage_id,pipeline_id,owner_id,customer_id,product_id,created_at",
              ),
          ),
        ),
        mine(
          supabase
            .from("orders")
            .select(
              "id,number,total,currency,total_cost_brl,total_cost_usd,shipping_cost,amount_paid,status,kind,origin,stock_state,workflow_stage,payment_status,fulfillment_status,created_at,seller_id,customer_id,product_id,delivery_deadline,delivered_at,tracking_status,tracking_code,carrier,warehouse_id,shipping_state",
            )
            .is("deleted_at", null)
            .is("superseded_at", null),
        ),
        supabase
          .from("order_items")
          .select("order_id,item_id,description,quantity,total,inventory_items(product_id)"),
        seesCompanyFinance
          ? scoped(
              supabase.from("accounts_receivable").select("id,amount,currency,status,due_date,customer_id,order_id"),
            )
          : Promise.resolve({ data: [] as any[] }),
        scoped(supabase.from("whatsapp_conversations").select("id,status,unread_count,customer_id")),
        scoped(supabase.from("inventory_items").select("id,name,variation,quantity,min_quantity,product_id,category_id,cost,currency")),
        supabase
          .from("tasks")
          .select("id,title,status,due_at,priority")
          .neq("status", "concluida")
          .limit(8),
        seesCompanyFinance
          ? scoped(supabase.from("accounts_payable").select("id,amount,currency,status,due_date"))
          : Promise.resolve({ data: [] as any[] }),
        supabase.from("profiles").select("id,full_name,phone,cargo").order("full_name"),
        supabase.from("user_roles").select("user_id,role").eq("role", "vendedor"),
        supabase
          .from("customers")
          .select("id,name,trade_name,state")
          .is("deleted_at", null)
          .order("name"),
        (supabase as any).from("inventory_item_locations").select("item_id,warehouse_id,location"),
        (supabase as any)
          .from("warehouses")
          .select("id,name,city,state,country,level,parent_id")
          .eq("is_active", true)
          .order("name"),
        (supabase as any)
          .from("warehouse_inventory")
          .select("warehouse_id,item_id,quantity,reserved,min_quantity,location"),
        (supabase as any).from("dashboard_region_leaders").select("region,user_id"),
        seesCompanyFinance ? getPurchasePositions({ signal: requestSignal }) : Promise.resolve([]),
      ].map((request: any) =>
        typeof request.abortSignal === "function" ? request.abortSignal(requestSignal) : request,
      ));
      const results = [
        ["Leads e CRM", cp], ["Pedidos", orders], ["Itens dos pedidos", orderItems],
        ["Valores a receber", receivable], ["Atendimentos", conversations],
        ["Estoque", inventory], ["Tarefas", tasks], ["Valores a pagar", payable],
        ["Membros", people], ["Cargos", roles], ["Clientes", customers],
        ["Locais de estoque", locations], ["Estoques", warehouses],
        ["Saldos de estoque", warehouseBalances], ["Líderes regionais", regionLeaders],
      ] as const;
      for (const [label, result] of results) {
        if (result.error) {
          if (requestSignal.aborted) throw new Error("A consulta demorou mais que o esperado. Tente novamente.");
          throw new Error(`Não foi possível carregar ${label}: ${result.error.message}`);
        }
      }
      const payableRows = (payable.data ?? [])
        .map((account: any) => {
          const position = purchasePositions.find((row: any) => row.accountId === account.id);
          return position ? { ...account, amount: position.debt } : account;
        })
        .filter((account: any) => account.status !== "cancelado" && Number(account.amount) > 0);
      return {
        cp: cp.data ?? [],
        orders: orders.data ?? [],
        orderItems: orderItems.data ?? [],
        receivable: receivable.data ?? [],
        conversations: conversations.data ?? [],
        inventory: inventory.data ?? [],
        tasks: tasks.data ?? [],
        payable: payableRows,
        people: people.data ?? [],
        roles: roles.data ?? [],
        customers: customers.data ?? [],
        locations: locations.data ?? [],
        warehouses: warehouses.data ?? [],
        warehouseBalances: warehouseBalances.data ?? [],
        regionLeaders: regionLeaders.data ?? [],
      };
    },
  });

  if (isLoading) return (
    <div className="space-y-4">
      <PageHeader title="Controle estadual" description="Consultando os dados da operação." />
      <Card><CardContent className="pt-6">
        <p role="status" aria-live="polite">Carregando pedidos, clientes e estoque…</p>
      </CardContent></Card>
    </div>
  );

  if (products.length === 0) {
    return (
      <div>
        <PageHeader title="Painel geral" />
        <EmptyState
          title="Nenhum produto disponível para você"
          description="Cadastre um produto ou peça a um administrador para liberar seu acesso."
          action={
            <Button asChild>
              <Link to="/produtos">Ir para Produtos</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (isError) return (
    <div className="space-y-4">
      <PageHeader title="Controle estadual" description="Não foi possível carregar os dados da dashboard." />
      <Card><CardContent className="space-y-3 pt-6">
        <p role="alert">Falha ao consultar os dados do painel. Os indicadores não serão mostrados como zero até a consulta funcionar.</p>
        <p className="text-sm text-muted-foreground">{error instanceof Error ? error.message : "Erro de conexão com o banco de dados."}</p>
        <Button onClick={() => void refetch()}>Tentar novamente</Button>
      </CardContent></Card>
    </div>
  );

  const allOrders = (data?.orders ?? []).filter((order: any) => order.kind === "venda");
  const customerStates = new Map((data?.customers ?? []).map((customer: any) => [customer.id, customer.state]));
  const warehouseStates = new Map((data?.warehouses ?? []).map((warehouse: any) => [warehouse.id, warehouse.state]));
  const rowState = (row: any) =>
    row.shipping_state || customerStates.get(row.customer_id) || warehouseStates.get(row.warehouse_id) || null;
  const orderItems = data?.orderItems ?? [];
  const itemProductId = (item: any) => {
    const inventory = item.inventory_items;
    return Array.isArray(inventory) ? inventory[0]?.product_id : inventory?.product_id;
  };
  const orderHasProduct = (order: any, selectedProductId: string) =>
    order.product_id === selectedProductId ||
    orderItems.some(
      (item: any) => item.order_id === order.id && itemProductId(item) === selectedProductId,
    );
  const orderHasInventoryItem = (order: any) =>
    inventoryItemId === "all" || orderItems.some(
      (item: any) => item.order_id === order.id && item.item_id === inventoryItemId,
    );
  const matchesCommonFilters = (
    row: any,
    ownerField: "seller_id" | "owner_id",
    applyProductFilter = true,
    applyPeriodFilter = true,
  ) => {
    const createdAt = row.created_at ? new Date(row.created_at) : null;
    if (applyPeriodFilter && dateFrom && (!createdAt || createdAt < new Date(dateFrom + "T00:00:00"))) return false;
    if (applyPeriodFilter && dateTo && (!createdAt || createdAt.getTime() >= new Date(dateTo + "T00:00:00").getTime() + 86400000)) return false;
    if (sellerFilter !== "all" && row[ownerField] !== sellerFilter) return false;
    if (customerFilter !== "all" && row.customer_id !== customerFilter) return false;
    if (!matchesTerritory(rowState(row), territory)) return false;
    if (
      applyProductFilter &&
      dashboardProductId !== "todos" &&
      row.product_id !== dashboardProductId
    )
      return false;
    return true;
  };
  const orders = allOrders.filter(
    (order: any) =>
      matchesCommonFilters(order, "seller_id", false) &&
      (dashboardProductId === "todos" || orderHasProduct(order, dashboardProductId)) &&
      orderHasInventoryItem(order),
  );
  const comparisonOrders = allOrders.filter(
    (order: any) =>
      matchesCommonFilters(order, "seller_id", false, false) &&
      (dashboardProductId === "todos" || orderHasProduct(order, dashboardProductId)) &&
      orderHasInventoryItem(order),
  );
  const orderItemsForScope = (order: any) => {
    const items = orderItems.filter((item: any) => item.order_id === order.id);
    if (inventoryItemId !== "all") return items.filter((item: any) => item.item_id === inventoryItemId);
    if (dashboardProductId === "todos") return items;
    return items.filter((item: any) => {
      const product = itemProductId(item);
      return (
        product === dashboardProductId || (!product && order.product_id === dashboardProductId)
      );
    });
  };
  const orderAmountForScope = (order: any) =>
    dashboardProductId === "todos" && inventoryItemId === "all"
      ? Number(order.total ?? 0)
      : orderItemsForScope(order).reduce(
          (sum: number, item: any) => sum + Number(item.total ?? 0),
          0,
        );
  const unitsInOrders = orders.reduce((sum: number, order: any) =>
    sum + orderItemsForScope(order).reduce((itemSum: number, item: any) =>
      itemSum + Number(item.quantity ?? 0), 0), 0);
  const cp = (data?.cp ?? []).filter((opportunity: any) =>
    inventoryItemId === "all" && matchesCommonFilters(opportunity, "owner_id"),
  );
  const sellerIds = new Set((data?.roles ?? []).map((role: any) => role.user_id));
  const sellers = (data?.people ?? []).filter((person: any) => sellerIds.has(person.id));
  const orderedCustomerIds = new Set(allOrders.map((order: any) => order.customer_id).filter(Boolean));
  const orderCustomers = (data?.customers ?? []).filter((customer: any) => orderedCustomerIds.has(customer.id));
  const availableItems = (data?.inventory ?? []).filter((item: any) =>
    dashboardProductId === "todos" || item.product_id === dashboardProductId);
  const filtersActive =
    !!dateFrom || !!dateTo || selectedTerritory.mode !== "national" ||
    sellerFilter !== "all" ||
    customerFilter !== "all" ||
    dashboardProductId !== "todos" || inventoryItemId !== "all";
  const clearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setSelectedTerritory({ mode: "national" });
    setHoveredTerritory(null);
    setSellerFilter("all");
    setCustomerFilter("all");
    setDashboardProductId("todos");
    setInventoryItemId("all");
  };
  const currency = displayCurrency;
  const convertValue = (value: number, from: Currency) =>
    rates.convert(value, from, displayCurrency) ?? (from === displayCurrency ? value : 0);
  const sold = orders
    .filter((o: any) => o.status !== "cancelado")
    .reduce(
      (s: number, o: any) => s + convertValue(orderAmountForScope(o), o.currency as Currency),
      0,
    );
  const pipelineValue = cp
    .filter((c: any) => !["ganho", "perdido"].includes(c.commercial_status))
    .reduce(
      (s: number, c: any) =>
        s + convertValue(Number(c.potential_value ?? 0), (c.currency ?? "BRL") as Currency),
      0,
    );
  const openConversations = (data?.conversations ?? []).filter(
    (c: any) => c.status !== "encerrada" && matchesTerritory(customerStates.get(c.customer_id), territory),
  ).length;
  const overdue = (data?.receivable ?? []).filter(
    (r: any) => r.status !== "pago" && r.due_date && new Date(r.due_date) < new Date() &&
      matchesTerritory(customerStates.get(r.customer_id), territory),
  );
  // Comparativos independentes do filtro de período selecionado na tela.
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7));
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(endOfWeek.getDate() + 7);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);
  const startOfMonth = new Date(startOfDay.getFullYear(), startOfDay.getMonth(), 1);
  const endOfMonth = new Date(startOfDay.getFullYear(), startOfDay.getMonth() + 1, 1);
  const startOfYear = new Date(startOfDay.getFullYear(), 0, 1);
  const endOfYear = new Date(startOfDay.getFullYear() + 1, 0, 1);

  const validOrders = comparisonOrders.filter((o: any) => o.status !== "cancelado");
  const sumIn = (from: Date, to: Date) =>
    validOrders
      .filter((o: any) => {
        const d = new Date(o.created_at);
        return d >= from && d < to;
      })
      .reduce(
        (s: number, o: any) => s + convertValue(orderAmountForScope(o), o.currency as Currency),
        0,
      );
  const soldToday = sumIn(startOfDay, endOfDay);
  const soldWeek = sumIn(startOfWeek, endOfWeek);
  const soldMonth = sumIn(startOfMonth, endOfMonth);
  const soldYear = sumIn(startOfYear, endOfYear);

  const sumDebt = (to: Date) =>
    (data?.payable ?? [])
      .filter(
        (a: any) =>
          a.status !== "pago" &&
          a.status !== "cancelado" &&
          a.due_date &&
          new Date(`${a.due_date}T00:00:00`) < to,
      )
      .reduce(
        (s: number, a: any) =>
          s + convertValue(Number(a.amount ?? 0), (a.currency ?? "BRL") as Currency),
        0,
      );
  const debtToday = sumDebt(endOfDay);
  const debtWeek = sumDebt(endOfWeek);
  const summaryAmounts = (value: number) => ({
    BRL: formatKpiMoney(rates.convert(value, currency, "BRL"), "BRL"),
    USD: formatKpiMoney(rates.convert(value, currency, "USD"), "USD"),
    PYG: formatKpiMoney(rates.convert(value, currency, "PYG"), "PYG"),
  });

  const orderMetrics = (selected: any[]) => {
    const ids = new Set(selected.map((order) => order.id));
    const ordersById = new Map(selected.map((order) => [order.id, order]));
    const selectedItems = orderItems.filter((item: any) => ids.has(item.order_id));
    const scopedItems =
      dashboardProductId === "todos" && inventoryItemId === "all"
        ? selectedItems
        : selectedItems.filter((item: any) => {
            if (inventoryItemId !== "all") return item.item_id === inventoryItemId;
            const order = ordersById.get(item.order_id);
            const product = itemProductId(item);
            return (
              product === dashboardProductId ||
              (!product && order?.product_id === dashboardProductId)
            );
          });
    const amountIn = (target: Currency) => {
      let missingRate = false;
      const monetaryRows =
        dashboardProductId === "todos" && inventoryItemId === "all"
          ? selected.map((order) => ({ value: order.total, currency: order.currency }))
          : scopedItems.map((item: any) => ({
              value: item.total,
              currency: ordersById.get(item.order_id)?.currency,
            }));
      const total = monetaryRows.reduce((sum: number, row: any) => {
        const source = (row.currency ?? "BRL") as Currency;
        const converted = rates.convert(Number(row.value ?? 0), source, target);
        if (converted === null) {
          missingRate = true;
          return sum;
        }
        return sum + converted;
      }, 0);
      return missingRate ? null : total;
    };
    return {
      count: selected.length,
      units: scopedItems.reduce((sum: number, item: any) => sum + Number(item.quantity ?? 0), 0),
      amounts: {
        BRL: amountIn("BRL"),
        USD: amountIn("USD"),
        PYG: amountIn("PYG"),
      },
    };
  };
  const orderCounts = [
    { label: "Pedidos confirmados", rows: orders, icon: PackageCheck },
    { label: "Pedido feito", rows: orders.filter((o: any) => o.workflow_stage === "pedido_feito"), icon: PackageCheck },
    {
      label: "Solicitações",
      rows: (data?.orders ?? []).filter(
        (order: any) =>
          order.kind === "pre_pedido" &&
          matchesCommonFilters(order, "seller_id", false) &&
          (dashboardProductId === "todos" || orderHasProduct(order, dashboardProductId)) &&
          orderHasInventoryItem(order),
      ),
      icon: PackageCheck,
    },
    {
      label: "A caminho",
      rows: orders.filter((o: any) => o.workflow_stage === "em_caminho"),
      icon: Truck,
    },
    {
      label: "Entregues",
      rows: orders.filter(
        (o: any) => o.fulfillment_status === "entregue" || o.status === "entregue",
      ),
      icon: CircleCheck,
    },
    {
      label: "Pagos",
      rows: orders.filter((o: any) => o.workflow_stage === "vendido"),
      icon: BadgeDollarSign,
    },
    {
      label: "Esperando pagamento",
      rows: orders.filter((o: any) => o.workflow_stage === "esperando_pagamento"),
      icon: Clock3,
    },
    {
      label: "Cancelados",
      rows: orders.filter((o: any) => o.status === "cancelado" || o.workflow_stage === "cancelado"),
      icon: CircleX,
    },
    { label: "Pagamento parcial", rows: orders.filter((o: any) => o.workflow_stage === "pagamento_parcial"), icon: BadgeDollarSign },
    { label: "Produtos perdidos", rows: orders.filter((o: any) => o.workflow_stage === "perdido"), icon: CircleX },
  ];
  const statusCount = (label: string) => orderCounts.find((item) => item.label === label)?.rows.length ?? 0;
  const profitOrders = orders.filter((order: any) =>
    order.status !== "cancelado" && order.workflow_stage !== "cancelado" &&
    order.status !== "perdido" && order.workflow_stage !== "perdido" &&
    order.fulfillment_status !== "perdido");
  const scopedRatio = (order: any) => {
    const total = Number(order.total ?? 0);
    return total > 0 ? Math.max(0, Math.min(1, orderAmountForScope(order) / total)) : 1;
  };
  const amountPaidForScope = (order: any) =>
    Math.min(orderAmountForScope(order), Math.max(0, Number(order.amount_paid ?? 0) * scopedRatio(order)));
  const remainingForScope = (order: any) =>
    Math.max(0, orderAmountForScope(order) - amountPaidForScope(order));
  const sumOrderValues = (rows: any[], value: (order: any) => number) =>
    rows.reduce((sum: number, order: any) =>
      sum + convertValue(value(order), (order.currency ?? "BRL") as Currency), 0);
  const gross = sumOrderValues(profitOrders, orderAmountForScope);
  const paidAmount = sumOrderValues(profitOrders, amountPaidForScope);
  const remainingAmount = sumOrderValues(profitOrders, remainingForScope);
  const costForOrder = (order: any) => {
    const source = (order.currency ?? "BRL") as Currency;
    const cost = source === "USD" ? order.total_cost_usd : order.total_cost_brl;
    return cost == null ? null : Number(cost) * scopedRatio(order);
  };
  const costKnown = profitOrders.every((order: any) => costForOrder(order) !== null);
  const totalCost = costKnown ? sumOrderValues(profitOrders, (order) => costForOrder(order) ?? 0) : null;
  const totalShipping = sumOrderValues(profitOrders,
    (order) => Number(order.shipping_cost ?? 0) * scopedRatio(order));
  const profitForOrder = (order: any) => {
    const cost = costForOrder(order);
    if (cost === null) return null;
    const source = (order.currency ?? "BRL") as Currency;
    return convertValue(orderAmountForScope(order) - cost -
      Number(order.shipping_cost ?? 0) * scopedRatio(order), source);
  };
  const profitKnown = costKnown;
  const profit = profitKnown ? profitOrders.reduce((sum: number, order: any) => sum + (profitForOrder(order) ?? 0), 0) : null;
  const isDeliveredFinancial = (order: any) =>
    order.fulfillment_status === "entregue" || !!order.delivered_at;
  const inTransitValue = sumOrderValues(profitOrders.filter((order: any) =>
    !isDeliveredFinancial(order) &&
    (order.fulfillment_status === "a_caminho" || order.workflow_stage === "em_caminho" || order.status === "enviado")),
    orderAmountForScope);
  const deliveredUnpaid = sumOrderValues(profitOrders.filter(isDeliveredFinancial), remainingForScope);
  const financialByMonth = Object.values(profitOrders.reduce((acc: Record<string, { name: string; receita: number; lucro: number }>, order: any) => {
    const date = new Date(order.created_at);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const row = acc[key] ?? { name: `${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`, receita: 0, lucro: 0 };
    row.receita += convertValue(orderAmountForScope(order), order.currency as Currency);
    row.lucro += profitForOrder(order) ?? 0;
    acc[key] = row;
    return acc;
  }, {})).sort((a, b) => a.name.localeCompare(b.name));
  const orderStageChart = [
    { name: "Pedidos", total: orders.length },
    { name: "Pedido feito", total: statusCount("Pedido feito") },
    { name: "Em caminho", total: statusCount("A caminho") },
    { name: "Entregues", total: statusCount("Entregues") },
    { name: "Pagos", total: statusCount("Pagos") },
    { name: "Parciais", total: statusCount("Pagamento parcial") },
    { name: "Aguardando", total: statusCount("Esperando pagamento") },
    { name: "Cancelados", total: statusCount("Cancelados") },
    { name: "Perdidos", total: statusCount("Produtos perdidos") },
  ];
  const dashboardSummary = {
    orders: orders.length, units: formatNumber(unitsInOrders), created: statusCount("Pedido feito"), inTransit: statusCount("A caminho"), delivered: statusCount("Entregues"),
    paid: statusCount("Pagos"), partial: statusCount("Pagamento parcial"),
    awaiting: statusCount("Esperando pagamento"), cancelled: statusCount("Cancelados"), lost: statusCount("Produtos perdidos"),
    gross: formatKpiMoney(gross, currency),
    cost: formatKpiMoney(totalCost, currency),
    shipping: formatKpiMoney(totalShipping, currency),
    profit: formatKpiMoney(profit, currency),
    paidAmount: formatKpiMoney(paidAmount, currency),
    remainingAmount: formatKpiMoney(remainingAmount, currency),
    inTransitValue: formatKpiMoney(inTransitValue, currency),
    deliveredUnpaid: formatKpiMoney(deliveredUnpaid, currency),
    currency,
  };
  const statusChips = [
    { label: "Pedido feito", text: "pedidos feitos" },
    { label: "A caminho", text: "em caminho" },
    { label: "Entregues", text: "entregues" },
    { label: "Pagos", text: "pagos" },
    { label: "Pagamento parcial", text: "parciais" },
    { label: "Esperando pagamento", text: "aguardando" },
    { label: "Cancelados", text: "cancelados" },
    { label: "Produtos perdidos", text: "perdidos" },
  ];
  const selectedStatusOrders = orderCounts.find((group) => group.label === activeOrderStatus)?.rows ?? [];
  const selectedStatusProducts = (() => {
    const grouped = new Map<string, { name: string; units: number; sales: number; cost: number; hasCost: boolean }>();
    const inventoryNames = new Map((data?.inventory ?? []).map((item: any) => [item.id, item.name]));
    for (const order of selectedStatusOrders) {
      const items = orderItemsForScope(order);
      const orderTotal = orderAmountForScope(order);
      const source = (order.currency ?? "BRL") as Currency;
      const rawCost = source === "USD" ? order.total_cost_usd : order.total_cost_brl;
      const cost = rawCost == null ? null : Number(rawCost) * scopedRatio(order);
      const lines = items.length ? items : [{ item_id: null, description: "Produto não informado", quantity: 0, total: orderTotal }];
      const lineTotal = lines.reduce((sum: number, item: any) => sum + Math.max(0, Number(item.total ?? 0)), 0);
      const totalUnits = lines.reduce((sum: number, item: any) => sum + Math.max(0, Number(item.quantity ?? 0)), 0);
      for (const item of lines) {
        const weight = lineTotal > 0
          ? Math.max(0, Number(item.total ?? 0)) / lineTotal
          : totalUnits > 0 ? Math.max(0, Number(item.quantity ?? 0)) / totalUnits : 1 / lines.length;
        const key = item.item_id ?? item.description ?? "sem-produto";
        const current = grouped.get(key) ?? {
          name: String(item.description || inventoryNames.get(item.item_id) || "Produto não informado"),
          units: 0, sales: 0, cost: 0, hasCost: true,
        };
        current.units += Number(item.quantity ?? 0);
        current.sales += convertValue(orderTotal * weight, source);
        if (cost === null) current.hasCost = false;
        else current.cost += convertValue(cost * weight, source);
        grouped.set(key, current);
      }
    }
    return [...grouped.values()].sort((a, b) => b.units - a.units || a.name.localeCompare(b.name, "pt-BR"));
  })();
  const sellerNames = new Map(
    (data?.people ?? []).map((person: any) => [person.id, person.full_name]),
  );
  const customerNames = new Map(
    (data?.customers ?? []).map((customer: any) => [
      customer.id,
      customer.trade_name || customer.name,
    ]),
  );
  const reportFilterDescription = [
    `Datas: ${dateFrom || "início"} a ${dateTo || "hoje"}`,
    territory.mode === "national" ? "Brasil" : `Território: ${territory.mode === "state" ? brazilStates[territory.code ?? ""]?.name : territory.code}`,
    sellerFilter !== "all" ? `Vendedor: ${sellerNames.get(sellerFilter) ?? "Selecionado"}` : null,
    customerFilter !== "all"
      ? `Cliente: ${customerNames.get(customerFilter) ?? "Selecionado"}`
      : null,
    dashboardProductId !== "todos"
      ? `Categoria: ${products.find((product) => product.id === dashboardProductId)?.name ?? "Selecionada"}`
      : null,
    inventoryItemId !== "all"
      ? `Produto: ${availableItems.find((item: any) => item.id === inventoryItemId)?.name ?? "Selecionado"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const reportRows = [...orders]
    .sort((a: any, b: any) => Number(a.number ?? 0) - Number(b.number ?? 0))
    .map((order: any) => {
      const sourceCurrency = (order.currency ?? "BRL") as Currency;
      const amount = orderAmountForScope(order);
      const units = orderItemsForScope(order).reduce(
        (sum: number, item: any) => sum + Number(item.quantity ?? 0),
        0,
      );
      return [
        `#${String(order.number ?? "—").padStart(2, "0")}`,
        formatDate(order.created_at),
        customerNames.get(order.customer_id) ?? "Sem cliente",
        sellerNames.get(order.seller_id) ?? "Sem vendedor",
        order.status ?? order.workflow_stage ?? "Sem situação",
        units,
        formatKpiMoney(rates.convert(amount, sourceCurrency, "USD"), "USD"),
        formatKpiMoney(rates.convert(amount, sourceCurrency, "BRL"), "BRL"),
        formatKpiMoney(rates.convert(amount, sourceCurrency, "PYG"), "PYG"),
      ];
    });

  const statesWithStock = new Set(
    (data?.warehouses ?? []).flatMap((warehouse: any) => {
      if (warehouse.country && !["BR", "BRA", "BRASIL", "BRAZIL"].includes(String(warehouse.country).trim().toUpperCase())) return [];
      const code = stateCodeFor(warehouse.state);
      return code && matchesTerritory(warehouse.state, territory) ? [code] : [];
    }),
  ).size;
  const territoryStates = territory.mode === "region"
    ? BRAZIL_REGIONS[territory.code as keyof typeof BRAZIL_REGIONS]?.codes.length ?? 27
    : territory.mode === "state" ? 1 : 27;

  const inventoryRows = data?.inventory ?? [];
  const inventoryById = new Map(inventoryRows.map((item: any) => [item.id, item]));
  const locationByItem = new Map((data?.locations ?? []).map((row: any) => [row.item_id, row]));
  const warehouseBalances = data?.warehouseBalances ?? [];
  const allInventoryByWarehouse = (data?.warehouses ?? []).map((warehouse: any) => {
    const savedBalances = warehouseBalances.filter(
      (balance: any) => balance.warehouse_id === warehouse.id,
    );
    const items = savedBalances.length
      ? savedBalances.map((balance: any) => ({
          ...(inventoryById.get(balance.item_id) ?? { id: balance.item_id, name: "Produto" }),
          quantity: Number(balance.quantity ?? 0),
          reserved: Number(balance.reserved ?? 0),
          min_quantity: Number(balance.min_quantity ?? 0),
          location: balance.location,
        }))
      : inventoryRows
          .filter((item: any) => locationByItem.get(item.id)?.warehouse_id === warehouse.id)
          .map((item: any) => ({ ...item, location: locationByItem.get(item.id)?.location }));
    return {
      ...warehouse,
      products: items.length,
      units: items.reduce((sum: number, item: any) => sum + Number(item.quantity ?? 0), 0),
      low: items.filter((item: any) => Number(item.quantity ?? 0) <= Number(item.min_quantity ?? 0))
        .length,
      items: items.sort((a: any, b: any) => Number(a.quantity ?? 0) - Number(b.quantity ?? 0)),
    };
  });
  const inventoryByWarehouse = allInventoryByWarehouse.filter((warehouse: any) =>
    matchesTerritory(warehouse.state, territory)
  );
  const brazilStockLocations = inventoryByWarehouse.filter((warehouse: any) =>
    !warehouse.country || ["BR", "BRA", "BRASIL", "BRAZIL"].includes(String(warehouse.country).trim().toUpperCase())
  );
  const stockByProduct = new Map<string, { id: string; name: string; quantity: number; value: number; hasCost: boolean }>();
  for (const warehouse of brazilStockLocations) {
    for (const item of warehouse.items) {
      if (dashboardProductId !== "todos" && item.product_id !== dashboardProductId) continue;
      if (inventoryItemId !== "all" && item.id !== inventoryItemId) continue;
      const quantity = Number(item.quantity ?? 0);
      const source = (item.currency ?? "BRL") as Currency;
      const convertedCost = item.cost == null ? null :
        rates.convert(Number(item.cost), source, currency);
      const current = stockByProduct.get(item.id) ?? {
        id: item.id,
        name: [item.name, item.variation].filter(Boolean).join(" · ") || "Produto",
        quantity: 0,
        value: 0,
        hasCost: true,
      };
      current.quantity += quantity;
      if (convertedCost == null) current.hasCost = false;
      else current.value += quantity * convertedCost;
      stockByProduct.set(item.id, current);
    }
  }
  const stockProducts = [...stockByProduct.values()]
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const stockUnits = stockProducts.reduce((sum, item) => sum + item.quantity, 0);
  const stockCostValue = stockProducts.every((item) => item.hasCost)
    ? stockProducts.reduce((sum, item) => sum + item.value, 0)
    : null;
  const lowStockLocations = inventoryByWarehouse
    .filter((warehouse: any) => warehouse.level === "principal")
    .flatMap((warehouse: any) =>
      warehouse.items
        .filter((item: any) => Number(item.quantity ?? 0) <= Number(item.min_quantity ?? 0))
        .map((item: any) => ({ ...item, warehouse })),
    );
  const activeDeliveries = orders.filter((order: any) => order.status !== "cancelado");
  const isDelivered = (order: any) =>
    order.fulfillment_status === "entregue" || !!order.delivered_at;
  const isTransit = (order: any) =>
    !isDelivered(order) &&
    (order.fulfillment_status === "a_caminho" || order.workflow_stage === "em_caminho");
  const deliveryStages = [
    {
      label: "Ajustando entrega",
      orders: activeDeliveries.filter((order: any) => !isDelivered(order) && !isTransit(order)),
    },
    {
      label: "Saiu para entrega",
      orders: activeDeliveries.filter(
        (order: any) =>
          isTransit(order) &&
          !/chegou|não entregue|nao entregue|falha|devolv/i.test(
            String(order.tracking_status ?? ""),
          ),
      ),
    },
    {
      label: "Chegou",
      orders: activeDeliveries.filter(
        (order: any) =>
          !isDelivered(order) && /chegou|chegada/i.test(String(order.tracking_status ?? "")),
      ),
    },
    { label: "Entregue", orders: activeDeliveries.filter(isDelivered) },
    {
      label: "Não entregue",
      orders: orders.filter((order: any) =>
        /não entregue|nao entregue|falha|devolv/i.test(String(order.tracking_status ?? "")),
      ),
    },
    {
      label: "Atrasado",
      orders: activeDeliveries.filter(
        (order: any) =>
          !isDelivered(order) &&
          order.delivery_deadline &&
          new Date(`${order.delivery_deadline}T23:59:59`).getTime() < Date.now(),
      ),
    },
  ];
  const selectedDeliveryOrders = deliveryStages.find((stage) => stage.label === selectedDeliveryStage)?.orders ?? [];

  const cards = [
    {
      label: seesCompanySales ? "Vendas registradas" : "Minhas vendas",
      amounts: summaryAmounts(sold),
      icon: TrendingUp,
      to: "/pedidos",
    },
    {
      label: "Oportunidades em aberto",
      amounts: summaryAmounts(pipelineValue),
      icon: Users,
      to: "/crm",
    },
    {
      label: "Atendimentos abertos",
      value: String(openConversations),
      icon: MessageCircle,
      to: "/atendimentos",
    },
    {
      label: "Faturamento de hoje",
      amounts: summaryAmounts(soldToday),
      icon: TrendingUp,
      to: "/pedidos" as const,
    },
    {
      label: "Faturamento da semana",
      amounts: summaryAmounts(soldWeek),
      icon: TrendingUp,
      to: "/pedidos" as const,
    },
    {
      label: "Faturamento do mês",
      amounts: summaryAmounts(soldMonth),
      icon: TrendingUp,
      to: "/pedidos" as const,
    },
    {
      label: "Faturamento do ano",
      amounts: summaryAmounts(soldYear),
      icon: TrendingUp,
      to: "/pedidos" as const,
    },
    ...(seesCompanyFinance && territory.mode === "national"
      ? [
          {
            label: "Dívidas até hoje",
            amounts: summaryAmounts(debtToday),
            icon: BadgeDollarSign,
            to: "/financeiro" as const,
          },
          {
            label: "Dívidas da semana",
            amounts: summaryAmounts(debtWeek),
            icon: BadgeDollarSign,
            to: "/financeiro" as const,
          },
          {
            label: "Contas vencidas",
            value: String(overdue.length),
            icon: BadgeDollarSign,
            to: "/financeiro" as const,
          },
        ]
      : []),
  ];

  const selectedSellerCount = new Set(orders.map((order: any) => order.seller_id).filter(Boolean)).size;
  const regionLeaders = Object.fromEntries((data?.regionLeaders ?? []).map((row: any) => [row.region, row.user_id]));
  const activeRegion = territory.mode === "region" ? territory.code : territory.mode === "state" ? regionForState(territory.code ?? "") : null;
  const memberIds = new Set(orders.map((order: any) => order.seller_id).filter(Boolean));
  if (activeRegion && regionLeaders[activeRegion]) memberIds.add(regionLeaders[activeRegion]);
  const memberCount = territory.mode === "national" ? (data?.people ?? []).length : memberIds.size;
  const saveRegionLeader = async (region: string, selectedUserId: string | null) => {
    const table = (supabase as any).from("dashboard_region_leaders");
    const { error } = selectedUserId
      ? await table.upsert({ region, user_id: selectedUserId }, { onConflict: "region" })
      : await table.delete().eq("region", region);
    if (error) return void toast.error("Não foi possível salvar o líder regional.");
    await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    toast.success("Líder regional atualizado.");
  };

  return (
    <div>
      <PageHeader
        title={seesCompanySales ? "Controle estadual" : "Visão operacional"}
        description={
 seesCompanySales
              ? "Vendas, desempenho e operação dentro do território autorizado."
              : `Resultados de ${profile?.full_name?.split(" ")[0] ?? "seu perfil"}.`
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={displayCurrency}
              onValueChange={(value) => setDisplayCurrency(value as Currency)}
            >
              <SelectTrigger className="w-44" aria-label="Moeda do painel">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ReportButton
              title="Relatório da dashboard"
              description={reportFilterDescription}
              filename="relatorio-dashboard"
              build={() => ({
                highlights: cards.map((card) => ({
                  label: card.label,
                  value:
                    "amounts" in card
                      ? `${card.amounts.BRL} · ${card.amounts.USD} · ${card.amounts.PYG}`
                      : String(card.value),
                })),
                headers: [
                  "Situação dos pedidos",
                  "Pedidos",
                  "Unidades",
                  "Valor USD",
                  "Valor BRL",
                  "Valor Gs.",
                ],
                rows: orderCounts.map((item) => {
                  const metrics = orderMetrics(item.rows);
                  return [
                    item.label,
                    metrics.count,
                    formatNumber(metrics.units, 3),
                    formatKpiMoney(metrics.amounts.USD, "USD"),
                    formatKpiMoney(metrics.amounts.BRL, "BRL"),
                    formatKpiMoney(metrics.amounts.PYG, "PYG"),
                  ];
                }),
                sections: [
                  {
                    title: "Indicadores gerais",
                    headers: ["Indicador", "Valor BRL", "Valor USD", "Valor Gs."],
                    rows: cards.map((card) =>
                      "amounts" in card
                        ? [card.label, card.amounts.BRL, card.amounts.USD, card.amounts.PYG]
                        : [card.label, String(card.value), "—", "—"],
                    ),
                  },
                  {
                    title: "Pedidos do período",
                    headers: [
                      "Pedido",
                      "Data",
                      "Cliente",
                      "Vendedor",
                      "Situação",
                      "Unidades",
                      "Valor USD",
                      "Valor BRL",
                      "Valor Gs.",
                    ],
                    rows: reportRows,
                  },
                ],
              })}
            />
          </div>
        }
      />
      <div className="integral-scope-banner mb-5"><MapPin className="size-4 text-primary" /><span>Escopo ativo</span><strong>{dashboardProductId === "todos" ? seesCompanySales ? "Visão consolidada" : "Dados próprios" : products.find((product) => product.id === dashboardProductId)?.name ?? "Categoria selecionada"}</strong><small>{seesCompanySales ? "VISÃO DA EMPRESA" : "VISÃO INDIVIDUAL"}</small></div>


      <Card className="mb-5">
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Filter className="size-4" /> Filtros da dashboard
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Aplicados aos pedidos, quantidades, valores, oportunidades e gráficos.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={clearFilters} disabled={!filtersActive}>
            <RotateCcw className="mr-2 size-3.5" /> Limpar
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="space-y-1.5">
            <Label htmlFor="dashboard-date-from">De</Label>
            <Input id="dashboard-date-from" type="date" value={dateFrom} max={dateTo || undefined}
              onChange={(event) => setDateFrom(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dashboard-date-to">Até</Label>
            <Input id="dashboard-date-to" type="date" value={dateTo} min={dateFrom || undefined}
              onChange={(event) => setDateTo(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Vendedor</Label>
            <Select value={sellerFilter} onValueChange={setSellerFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os vendedores</SelectItem>
                {sellers.map((person: any) => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.full_name || "Sem nome"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Cliente</Label>
            <Select value={customerFilter} onValueChange={setCustomerFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os clientes</SelectItem>
                {orderCustomers.map((customer: any) => (
                  <SelectItem key={customer.id} value={customer.id}>
                    {customer.trade_name || customer.name || "Sem nome"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select value={dashboardProductId} onValueChange={(value) => { setDashboardProductId(value); setInventoryItemId("all"); }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as categorias</SelectItem>
                {products.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Produto</Label>
            <Select value={inventoryItemId} onValueChange={setInventoryItemId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os produtos</SelectItem>
                {availableItems.map((item: any) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="mb-5"><NoticesCard /></div>
      <section className="surface-card mb-5 p-4" aria-label="Avisos operacionais">
        <h2 className="mb-3 text-sm font-semibold">Avisos operacionais</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          <details className="rounded-lg border p-3">
            <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium">
              <span>Minhas tarefas em aberto</span>
              <Badge variant={(data?.tasks ?? []).length ? "secondary" : "outline"}>
                {(data?.tasks ?? []).length ? `${(data?.tasks ?? []).length} pendente(s)` : "Tudo em dia"}
              </Badge>
            </summary>
            <div className="mt-3 space-y-2 border-t pt-3">
              {(data?.tasks ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhuma tarefa pendente.</p>}
              {(data?.tasks ?? []).map((task: any) => (
                <div key={task.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>{task.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {task.due_at ? formatDate(task.due_at) : "Sem prazo"} · {task.priority}
                  </span>
                </div>
              ))}
            </div>
          </details>
          <details className="rounded-lg border p-3">
            <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium">
              <span className="flex items-center gap-2"><Boxes className="size-4" /> Estoque principal baixo</span>
              <Badge variant={lowStockLocations.length ? "destructive" : "outline"}>
                {lowStockLocations.length ? `${lowStockLocations.length} alerta(s)` : "Acima do mínimo"}
              </Badge>
            </summary>
            <div className="mt-3 space-y-2 border-t pt-3">
              {lowStockLocations.length === 0 && <p className="text-sm text-muted-foreground">O estoque principal está acima do mínimo.</p>}
              {lowStockLocations.slice(0, 8).map((item: any) => (
                <div key={`${item.warehouse.id}-${item.id}`} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{item.name} · {item.warehouse.name}</span>
                  <Badge variant="destructive">{formatNumber(Number(item.quantity ?? 0))}</Badge>
                </div>
              ))}
              {lowStockLocations.length > 8 && <p className="text-xs text-muted-foreground">Mais {lowStockLocations.length - 8} alerta(s) de estoque.</p>}
            </div>
          </details>
        </div>
      </section>
      <section className="integral-metric-grid mb-5" aria-label="Indicadores de operação">
        <article className="integral-metric-card integral-metric-card--green">
          <PackageCheck aria-hidden="true" />
          <div className="integral-metric-content">
            <span>Pedidos no período</span>
            <div className="integral-metric-hero" style={{ display: "grid", gridTemplateColumns: "max-content minmax(0, 1fr)", alignItems: "center", columnGap: 12, width: "100%" }}>
              <strong style={{ fontFamily: 'Impact, "Arial Black", sans-serif', fontSize: 40, fontWeight: 900, lineHeight: 1.1 }}>{isLoading ? "—" : formatNumber(orders.length)}</strong>
              <div>
                <p style={{ margin: 0, fontSize: 12, lineHeight: 1.4, color: "var(--muted-foreground)" }}>{formatNumber(unitsInOrders)} unidades nos pedidos</p>
                <p style={{ margin: 0, fontSize: 12, lineHeight: 1.4, color: "var(--muted-foreground)" }}>Valor total vendido: <b className="text-foreground">{formatKpiMoney(gross, currency)}</b></p>
              </div>
            </div>
            <div className="w-full">
              <div ref={orderStatusButtonsRef} className="integral-metric-chips" onMouseLeave={() => setHoveredOrderStatus(null)}>
                {statusChips.map((chip) => (
                  <button key={chip.label} type="button"
                    aria-expanded={activeOrderStatus === chip.label}
                    onMouseEnter={() => setHoveredOrderStatus(chip.label)}
                    onFocus={() => setHoveredOrderStatus(chip.label)}
                    onClick={() => setSelectedOrderStatus(chip.label)}
                    style={{ border: 0, borderRadius: 5, background: "rgb(255 255 255 / 6%)", padding: "3px 6px", color: "var(--muted-foreground)", fontSize: 11, lineHeight: 1.3, whiteSpace: "nowrap", cursor: "pointer" }}>
                    {statusCount(chip.label)} {chip.text}
                  </button>
                ))}
              </div>
              {activeOrderStatus && (
                <div className="mt-3 max-h-48 w-full overflow-y-auto rounded-lg border p-3 text-xs" aria-live="polite">
                  <div className="mb-2 flex items-center justify-between gap-2"><strong>{activeOrderStatus} · {selectedStatusOrders.length} pedido(s)</strong><button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => { setSelectedOrderStatus(null); setHoveredOrderStatus(null); }}>Fechar</button></div>
                  {selectedStatusProducts.length === 0 ? <p className="text-muted-foreground">Nenhum produto nesta situação.</p> :
                    <div className="space-y-2">
                      {selectedStatusProducts.map((item, index) => (
                        <div key={`${item.name}-${index}`} className="border-b pb-2 last:border-0 last:pb-0">
                          <span className="block font-medium">{item.name} · {formatNumber(item.units)} un.</span>
                          <span className="block text-muted-foreground">Venda: {formatKpiMoney(item.sales, currency)} · Custo: {item.hasCost ? formatKpiMoney(item.cost, currency) : "Não cadastrado"}</span>
                        </div>
                      ))}
                    </div>}
                </div>
              )}
            </div>
          </div>
        </article>
        <article className="integral-metric-card integral-metric-card--pink">
          <MapPin aria-hidden="true" />
          <div className="integral-metric-content">
            <span>Estados com estoque</span>
            <div className="integral-metric-hero" style={{ display: "grid", gridTemplateColumns: "max-content minmax(0, 1fr)", alignItems: "center", columnGap: 12, width: "100%" }}>
              <strong style={{ fontFamily: 'Impact, "Arial Black", sans-serif', fontSize: 40, fontWeight: 900, lineHeight: 1.1 }}>{isLoading ? "—" : `${statesWithStock}/${territoryStates}`}</strong>
              <div>
                <p style={{ margin: 0, fontSize: 12, lineHeight: 1.4, color: "var(--muted-foreground)" }}>{formatNumber(stockUnits)} unidades em estoque</p>
                <p style={{ margin: 0, fontSize: 12, lineHeight: 1.4, color: "var(--muted-foreground)" }}>Valor total de custo: <b className="text-foreground">{formatKpiMoney(stockCostValue, currency)}</b></p>
              </div>
            </div>
            <p>{brazilStockLocations.length} locais no Brasil</p>
            <div className="mt-2 w-full min-w-0 border-t pt-2 text-xs" aria-label="Produtos nos estoques do território">
              <strong className="mb-2 block">Produtos no estoque</strong>
              <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                {stockProducts.length === 0 && <p className="text-muted-foreground">Nenhum produto no território selecionado.</p>}
                {stockProducts.map((item) => (
                  <div key={item.id} className="border-b pb-1 last:border-0">
                    <span className="block truncate" title={item.name}>{item.name}</span>
                    <span className="text-muted-foreground">{formatNumber(item.quantity)} un. · Valor de custo: {item.hasCost ? formatKpiMoney(item.value, currency) : "Sem custo cadastrado"}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </article>
        <article className="integral-metric-card">
          <Users aria-hidden="true" />
          <div className="integral-metric-content">
            <span>Membros visíveis</span>
            <strong>{isLoading ? "—" : formatNumber(memberCount)}</strong>
            <p>{selectedSellerCount} vendedores com pedidos no território</p>
          </div>
        </article>
      </section>
      <StateStockMap locations={allInventoryByWarehouse} canOpenStock={canOpen("/produtos")}
        selection={territory} committedSelection={selectedTerritory}
        onSelectionChange={(next) => { setSelectedTerritory(next); setHoveredTerritory(null); }}
        onHoverChange={setHoveredTerritory} sellers={sellers} people={data?.people ?? []}
        orders={orders} leaders={regionLeaders} summary={dashboardSummary}
        onLeaderChange={isAdmin ? saveRegionLeader : undefined} />
      <div className="mb-5">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Truck className="size-4" /> Resumo das entregas
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Situação atual e próximas previsões.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant={selectedDeliveryStage ? "outline" : "secondary"} size="sm"
                onClick={() => setSelectedDeliveryStage(null)} aria-pressed={!selectedDeliveryStage}>
                Visão geral
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link to="/entregas">Ver entregas</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-5 overflow-x-auto pb-2">
              <div className="flex min-w-[46rem] items-start">
                {deliveryStages.map((stage, index) => (
                  <div
                    key={stage.label}
                    className="relative flex min-w-28 flex-1 flex-col items-center text-center"
                  >
                    {index > 0 && (
                      <span className="absolute right-1/2 top-4 h-0.5 w-full bg-border" />
                    )}
                    <button
                      type="button"
                      aria-label={`Ver pedidos em ${stage.label}: ${stage.orders.length}`}
                      aria-expanded={selectedDeliveryStage === stage.label}
                      onClick={() => setSelectedDeliveryStage(selectedDeliveryStage === stage.label ? null : stage.label)}
                      className={cn(
                        "relative z-10 flex flex-col items-center gap-2 rounded-md px-2 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                        selectedDeliveryStage === stage.label && "text-primary",
                      )}
                    >
                      <span className={cn(
                        "grid size-8 place-items-center rounded-full border-4 border-card bg-secondary text-xs font-semibold text-secondary-foreground shadow-sm",
                        stage.orders.length > 0 && "bg-primary text-primary-foreground",
                        stage.label === "Atrasado" && stage.orders.length > 0 && "bg-destructive text-destructive-foreground",
                        selectedDeliveryStage === stage.label && "ring-2 ring-primary ring-offset-2 ring-offset-card",
                      )}>{stage.orders.length}</span>
                      <span className="max-w-24 text-[11px] font-medium leading-tight">{stage.label}</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
            {selectedDeliveryStage && (
              <div className="mb-5 rounded-lg border p-4" aria-live="polite">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">{selectedDeliveryStage} · {selectedDeliveryOrders.length} pedido(s)</h3>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedDeliveryStage(null)}>Fechar</Button>
                </div>
                {selectedDeliveryOrders.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum pedido nesta etapa com os filtros atuais.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[42rem] text-left text-sm">
                      <thead className="border-b text-xs text-muted-foreground">
                        <tr>
                          <th scope="col" className="px-3 py-2 font-medium">Pedido</th>
                          <th scope="col" className="px-3 py-2 font-medium">Cliente</th>
                          <th scope="col" className="px-3 py-2 font-medium">Vendedor</th>
                          <th scope="col" className="px-3 py-2 font-medium">Data da venda</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedDeliveryOrders.map((order: any) => {
                          const customer = (data?.customers ?? []).find((row: any) => row.id === order.customer_id);
                          const seller = (data?.people ?? []).find((row: any) => row.id === order.seller_id);
                          return (
                            <tr key={order.id} className="border-b last:border-b-0">
                              <td className="px-3 py-3 font-medium">#{order.number ?? order.id.slice(0, 8)}</td>
                              <td className="px-3 py-3">{customer?.trade_name || customer?.name || "Não informado"}</td>
                              <td className="px-3 py-3">{seller?.full_name || "Não informado"}</td>
                              <td className="px-3 py-3">{order.created_at ? formatDate(order.created_at) : "Não informada"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mb-5 grid gap-4 xl:grid-cols-2" aria-label="Gráficos do território selecionado">
        <Card>
          <CardHeader><CardTitle>Receita e lucro estimado</CardTitle><p className="text-xs text-muted-foreground">Por mês · {territory.mode === "national" ? "Brasil" : territory.mode === "region" ? territory.code : brazilStates[territory.code ?? ""]?.name} · valores em {currency}</p></CardHeader>
          <CardContent className="h-72">
            {financialByMonth.length === 0 ? <EmptyState title="Nenhum pedido neste território" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={financialByMonth}><CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis dataKey="name" fontSize={12} /><YAxis fontSize={12} width={76} />
                  <Tooltip formatter={(value: any) => formatKpiMoney(Number(value), currency)} />
                  <Legend /><Bar dataKey="receita" name="Receita" fill="#10b981" radius={[5, 5, 0, 0]} />
                  {profitKnown && <Bar dataKey="lucro" name="Lucro estimado" fill="#60a5fa" radius={[5, 5, 0, 0]} />}
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Pedidos por situação</CardTitle><p className="text-xs text-muted-foreground">Mesmos estágios da aba Pedidos · categorias podem se sobrepor</p></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={orderStageChart} margin={{ left: 0, right: 8, bottom: 28 }}><CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                <XAxis dataKey="name" fontSize={10} angle={-35} textAnchor="end" interval={0} height={65} /><YAxis allowDecimals={false} width={28} />
                <Tooltip /><Bar dataKey="total" name="Pedidos" fill="#f472b6" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="mb-5 grid items-start gap-4 xl:grid-cols-2">
        <div className="min-w-0"><TravelChampionships dashboard /></div>
        <div className="min-w-0"><RankingCard productId={dashboardProductId} /></div>
      </div>
      <div className="mb-5">
        <PromotionCard />
      </div>

      <div className="mt-5">
        <LiveRatesTicker />
      </div>


    </div>
  );
}
