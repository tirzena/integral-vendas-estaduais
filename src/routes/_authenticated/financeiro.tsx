import { FinanceStock } from "@/components/finance/FinanceStock";
import { CustomerCreditsSection } from "@/components/finance/CustomerCreditsSection";
import { financeDashboard } from "@/lib/finance-dashboard";
import { calculateFinance, financeOrderShare } from "@/lib/finance-totals";
import { convertFinancialAmount } from "@/lib/financial-exchange";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { ResourcePage } from "@/components/common/ResourcePage";
import { PageHeader } from "@/components/common/PageHeader";
import { useProductScope } from "@/hooks/useProductScope";
import { CURRENCIES, formatDate, formatMoney } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReportButton } from "@/components/common/ReportButton";
import { FinanceSummary } from "@/components/finance/FinanceSummary";
import { useFinanceTotals } from "@/hooks/useFinanceTotals";
import { PayrollSection } from "@/components/finance/PayrollSection";
import { InvestmentsSection } from "@/components/finance/InvestmentsSection";
import { useMemo, useState } from "react";
import { Filter, MapPin, RotateCcw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { financeDateMatches, financeDateRange } from "@/lib/finance-date-range";
import { usePermissions } from "@/hooks/usePermissions";
import { MyFinance } from "@/components/finance/MyFinance";
import { ProfitSplitCard } from "@/components/finance/ProfitSplitCard";
import { CurrencyValues, DisplayCurrencyContext } from "@/components/common/CurrencyValues";
import { useRates, type Currency } from "@/hooks/useRates";

export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({
    meta: [
      { title: "Financeiro — OS" },
      { name: "description", content: "Contas a receber e a pagar em real, dólar e guarani." },
      { property: "og:title", content: "Financeiro — OS" },
      { property: "og:description", content: "Contas a receber e a pagar por produto." },
    ],
  }),
  component: Financeiro,
});

const statusOptions = [
  { value: "aberto", label: "Em aberto" },
  { value: "pago", label: "Pago" },
  { value: "atrasado", label: "Atrasado" },
  { value: "cancelado", label: "Cancelado" },
];

function statusBadge(r: any) {
  const late = r.status !== "pago" && r.due_date && new Date(r.due_date) < new Date();
  return (
    <Badge variant={r.status === "pago" ? "default" : late ? "destructive" : "secondary"}>
      {r.status === "pago" ? "Pago" : late ? "Vencido" : (r.status ?? "aberto")}
    </Badge>
  );
}

function Financeiro() {
  const { seesCompanyFinance, userId } = usePermissions();
  const { productId, products } = useProductScope();
  const [displayCurrency, setDisplayCurrency] = useState<Currency>("BRL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sellerFilter, setSellerFilter] = useState("all");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("todos");
  const [itemFilter, setItemFilter] = useState("all");
  const effectiveProductId = productId === "todos" ? categoryFilter : productId;
  const itemOptionsQuery = useQuery({
    queryKey: ["finance-filter-items", effectiveProductId],
    queryFn: async () => {
      let query = supabase.from("inventory_items").select("id,name,product_id").order("name");
      if (effectiveProductId !== "todos") query = query.eq("product_id", effectiveProductId);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });
  const sellerOptionsQuery = useQuery({
    queryKey: ["finance-filter-sellers"],
    queryFn: async () => {
      const { data: roles, error } = await supabase.from("user_roles").select("user_id").eq("role", "vendedor");
      if (error) throw error;
      const ids = [...new Set((roles ?? []).map((role) => role.user_id))];
      if (!ids.length) return [];
      const result = await supabase.from("profiles").select("id,full_name").in("id", ids).order("full_name");
      if (result.error) throw result.error;
      return result.data ?? [];
    },
  });
  const customerOptionsQuery = useQuery({
    queryKey: ["finance-filter-customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id,name,trade_name").is("deleted_at", null).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const dateRange = useMemo(() => financeDateRange(dateFrom, dateTo), [dateFrom, dateTo]);
  const period = "tudo" as const;
  const [reportMonth, setReportMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const {
    totals,
    data: financeData,
    loading,
    error,
    ratesReady,
  } = useFinanceTotals(period, effectiveProductId, dateRange);
  const rates = useRates();
  const reportMoney = (value: number, source: Currency = "USD") =>
    rates.money(value, source, displayCurrency);
  const inPeriod = (value?: string | null) => financeDateMatches(value, dateRange);
  const selectedOrderIds = useMemo(() => {
    const itemOrderIds = itemFilter === "all" ? null : new Set(
      (financeData?.orderItems ?? []).filter((line: any) => line.item_id === itemFilter).map((line: any) => line.order_id),
    );
    return new Set((financeData?.orders ?? []).filter((order: any) =>
      (sellerFilter === "all" || order.seller_id === sellerFilter) &&
      (customerFilter === "all" || order.customer_id === customerFilter) &&
      (!itemOrderIds || itemOrderIds.has(order.id))
    ).map((order: any) => order.id));
  }, [financeData, sellerFilter, customerFilter, itemFilter]);
  const detailFilterActive = sellerFilter !== "all" || customerFilter !== "all" || itemFilter !== "all";
  const categoryOfOrder = (orderId: string) => {
    const categoryIds = new Set((financeData?.orderItems ?? [])
      .filter((line: any) => line.order_id === orderId)
      .map((line: any) => (financeData?.items ?? []).find((item: any) => item.id === line.item_id)?.product_id)
      .filter(Boolean));
    return products.filter((category) => categoryIds.has(category.id)).map((category) => category.name).join(", ") || "—";
  };
  const accountInPeriod = (r: any) =>
    !r.order_id && inPeriod(r.paid_at ?? r.due_date ?? r.created_at) &&
    (effectiveProductId === "todos" || r.product_id === effectiveProductId) &&
    (!detailFilterActive || (sellerFilter === "all" && itemFilter === "all" &&
      customerFilter !== "all" && r.customer_id === customerFilter));
  const orderReceivables = (financeData?.orders ?? []).flatMap((order: any) => {
    if (order.kind !== "venda" || order.status === "cancelado" || order.workflow_stage === "cancelado" ||
        ["rascunho", "solicitacao_catalogo"].includes(order.workflow_stage) ||
        financeOrderShare(financeData ?? {}, order) <= 0 ||
        (detailFilterActive && !selectedOrderIds.has(order.id))) return [];
    const payments = (financeData?.payments ?? []).filter((payment: any) =>
      payment.order_id === order.id && payment.status === "pago");
    if ((dateFrom || dateTo) && !inPeriod(order.order_date ?? order.created_at) &&
        !payments.some((payment: any) => inPeriod(payment.paid_at ?? payment.created_at))) return [];
    const paidNominal = Math.max(Number(order.amount_paid ?? 0), payments.reduce((sum: number, payment: any) =>
      sum + convertFinancialAmount(payment, order.currency, rates.convert), 0));
    const balanceNominal = Math.max(0, Number(order.total ?? 0) - paidNominal);
    const share = financeOrderShare(financeData ?? {}, order);
    const orderMoney = (value: number) => {
      const rate = Number(order.exchange_rates_snapshot?.[displayCurrency]);
      if (order.currency === displayCurrency) return value;
      if (order.exchange_rates_snapshot?.base === order.currency && rate > 0) return value * rate;
      return rates.convert(value, order.currency, displayCurrency) ?? 0;
    };
    const confirmed = payments.reduce((sum: number, payment: any) =>
      sum + convertFinancialAmount(payment, displayCurrency, rates.convert), 0);
    const paid = confirmed > 0 ? confirmed : orderMoney(paidNominal);
    const units = (financeData?.orderItems ?? []).filter((line: any) =>
      line.order_id === order.id && (effectiveProductId === "todos" || financeData?.itemIds?.has(line.item_id)))
      .reduce((sum: number, line: any) => sum + Number(line.quantity ?? 0), 0);
    return [{ order, units, sold: orderMoney(Number(order.total ?? 0)) * share,
      paid: paid * share, balance: orderMoney(balanceNominal) * share,
      stage: balanceNominal <= 0.01 ? "Pago" : paidNominal > 0 ? "Parcial" : "Em aberto" }];
  });
  const payrollInPeriod = (r: any) => inPeriod(r.paid_at ?? r.period_end ?? r.created_at);
  const investmentInPeriod = (r: any) => inPeriod(r.invested_at ?? r.created_at);
  const filter = effectiveProductId === "todos" ? {} : { product_id: effectiveProductId };
  const currencyField = {
    name: "currency",
    label: "Moeda",
    type: "select" as const,
    defaultValue: "BRL",
    options: CURRENCIES.map((c) => ({ value: c.value, label: c.label })),
  };

  const recurrenceColumn = (fixedLabel: string) => ({
    key: "recurrence",
    label: "Tipo",
    render: (r: any) => (
      <Badge variant={r.recurrence === "variavel" ? "outline" : "secondary"}>
        {r.recurrence === "variavel" ? "Variável" : fixedLabel}
      </Badge>
    ),
  });

  const installmentColumn = {
    key: "installment_number",
    label: "Parcela",
    render: (r: any) =>
      r.installment_number
        ? `${r.installment_number}${r.installments_total ? `/${r.installments_total}` : ""}`
        : "—",
  };

  const buildColumns = (fixedLabel: string) => [
    { key: "description", label: "Descrição" },
    recurrenceColumn(fixedLabel),
    installmentColumn,
    {
      key: "amount",
      label: "Valor",
      render: (r: any) => r.status === "pago"
         ? formatMoney(convertFinancialAmount(r, displayCurrency, rates.convert), displayCurrency)
         : <CurrencyValues value={r.amount} currency={r.currency} />,
    },
    { key: "due_date", label: "Vencimento", render: (r: any) => formatDate(r.due_date) },
    { key: "paid_at", label: "Pagamento", render: (r: any) => formatDate(r.paid_at) },
    { key: "category", label: "Categoria", render: (r: any) => r.order_id ? categoryOfOrder(r.order_id) : (r.category || "—") },
    { key: "status", label: "Situação", render: statusBadge },
  ];

  const buildFields = (fixedLabel: string) => [
    { name: "description", label: "Descrição", required: true, full: true },
    {
      name: "recurrence",
      label: "Tipo de conta",
      type: "select" as const,
      defaultValue: "variavel",
      options: [
        { value: "fixa", label: fixedLabel },
        { value: "variavel", label: "Variável" },
      ],
    },
    { name: "amount", label: "Valor", type: "number" as const, required: true },
    currencyField,
    {
      name: "installments_total",
      label: "Dividido em quantas vezes",
      type: "number" as const,
      help: "Deixe 1 para conta única. Ex.: 12 cria as 12 parcelas, uma por mês.",
    },
    {
      name: "installment_number",
      label: "Começar na parcela",
      type: "number" as const,
      help: "Normalmente 1. Use outro número se as primeiras já foram quitadas.",
    },
    { name: "due_date", label: "Vencimento", type: "date" as const, required: true },
    { name: "paid_at", label: "Data de pagamento", type: "date" as const },
    { name: "category", label: "Categoria" },
    { name: "cost_center", label: "Centro de custo" },
    {
      name: "status",
      label: "Situação",
      type: "select" as const,
      defaultValue: "aberto",
      options: statusOptions,
    },
  ];

  /** Um lançamento parcelado vira uma linha por mês, numerada como 2/12. */
  const expandInstallments = (payload: Record<string, any>) => {
    const total = Number(payload["installments_total"] ?? 0);
    const start = Math.max(1, Number(payload["installment_number"] ?? 1));
    if (!total || total <= 1 || total <= start - 1) {
      return [{ ...payload, installments_total: total > 1 ? total : null }];
    }
    const baseDate = payload["due_date"] ? new Date(`${payload["due_date"]}T12:00:00`) : new Date();
    const baseDescription = String(payload["description"] ?? "").trim();
    const rows: Record<string, any>[] = [];
    for (let i = start; i <= total; i++) {
      const due = new Date(baseDate);
      due.setMonth(due.getMonth() + (i - start));
      rows.push({
        ...payload,
        description: `${baseDescription} (${i}/${total})`,
        installment_number: i,
        installments_total: total,
        due_date: due.toISOString().slice(0, 10),
        paid_at: i === start ? (payload["paid_at"] ?? null) : null,
        status: i === start ? (payload["status"] ?? "aberto") : "aberto",
      });
    }
    return rows;
  };

  /** Fixas no topo, depois a maior parcela na frente e por fim o vencimento mais próximo. */
  const sortAccounts = (a: any, b: any) => {
    const fixed = (r: any) => (r.recurrence === "variavel" ? 1 : 0);
    if (fixed(a) !== fixed(b)) return fixed(a) - fixed(b);
    const inst = (r: any) => Number(r.installment_number ?? 0);
    if (inst(a) !== inst(b)) return inst(b) - inst(a);
    return String(a.due_date ?? "").localeCompare(String(b.due_date ?? ""));
  };

  const filters = (
    <Card className="mb-5">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="size-4" /> Filtros do financeiro
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Datas filtram os lançamentos. Vendedor, cliente e produto refinam contas a receber; categoria filtra os resumos.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => {
          setDateFrom(""); setDateTo(""); setSellerFilter("all"); setCustomerFilter("all");
          setCategoryFilter("todos"); setItemFilter("all");
        }}
          disabled={!dateFrom && !dateTo && sellerFilter === "all" && customerFilter === "all" && categoryFilter === "todos" && itemFilter === "all"}>
          <RotateCcw className="mr-2 size-3.5" /> Limpar
        </Button>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div className="space-y-1.5">
          <Label htmlFor="finance-date-from">De</Label>
          <Input id="finance-date-from" type="date" value={dateFrom} max={dateTo || undefined}
            onChange={(event) => setDateFrom(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="finance-date-to">Até</Label>
          <Input id="finance-date-to" type="date" value={dateTo} min={dateFrom || undefined}
            onChange={(event) => setDateTo(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Vendedor</Label>
          <Select value={sellerFilter} onValueChange={setSellerFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os vendedores</SelectItem>
              {(sellerOptionsQuery.data ?? []).map((person) =>
                <SelectItem key={person.id} value={person.id}>{person.full_name || "Sem nome"}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Cliente</Label>
          <Select value={customerFilter} onValueChange={setCustomerFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os clientes</SelectItem>
              {(customerOptionsQuery.data ?? []).filter((customer) =>
                (financeData?.orders ?? []).some((order: any) => order.customer_id === customer.id && (order.delivered_at || order.fulfillment_status === "entregue"))
              ).map((customer) =>
                <SelectItem key={customer.id} value={customer.id}>{customer.trade_name || customer.name || "Sem nome"}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Categoria</Label>
          <Select value={effectiveProductId} onValueChange={(value) => { setCategoryFilter(value); setItemFilter("all"); }}
            disabled={productId !== "todos"}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas as categorias</SelectItem>
              {products.map((product) => <SelectItem key={product.id} value={product.id}>{product.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Produto</Label>
          <Select value={itemFilter} onValueChange={setItemFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os produtos</SelectItem>
              {(itemOptionsQuery.data ?? []).map((item) =>
                <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-3 xl:col-span-6">
          Despesas compartilhadas e participação nos lucros mantêm a posição da empresa; o período e a categoria seguem o escopo indicado em cada seção.
        </p>
      </CardContent>
    </Card>
  );
  const currencySelect = (
    <Select value={displayCurrency} onValueChange={(v) => setDisplayCurrency(v as Currency)}>
      <SelectTrigger className="w-[220px]" aria-label="Moeda do financeiro"><SelectValue /></SelectTrigger>
      <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
    </Select>
  );
  const scopeBanner = (
    <div className="integral-scope-banner mb-5">
      <MapPin className="size-4 text-primary" /><span>Escopo ativo</span>
      <strong>{effectiveProductId === "todos" ? (seesCompanyFinance ? "Visão consolidada" : "Dados próprios") : products.find((p) => p.id === effectiveProductId)?.name ?? "Categoria selecionada"}</strong>
      <small>{seesCompanyFinance ? "VISÃO DA EMPRESA" : "VISÃO INDIVIDUAL"}</small>
    </div>
  );

  if (!seesCompanyFinance) {
    return (
      <DisplayCurrencyContext.Provider value={displayCurrency}>
        <div>
          <PageHeader
            title="Financeiro"
            description="Seus pagamentos, comissões, bonificações, vendas e cobranças."
          />
          {scopeBanner}
          <div className="mb-4 flex justify-end">{currencySelect}</div>
          {filters}
          <MyFinance userId={userId ?? null} period={period} dateRange={dateRange} />
        </div>
      </DisplayCurrencyContext.Provider>
    );
  }

  return (
    <DisplayCurrencyContext.Provider value={displayCurrency}>
      <div>
        <PageHeader
          title="Financeiro"
          description="Entradas, custos e participação dos sócios na moeda selecionada."
          actions={
            <div className="flex flex-wrap items-center gap-2">
            {currencySelect}
            <Label htmlFor="finance-report-month" className="text-xs">Mês do relatório</Label>
            <Input id="finance-report-month" type="month" className="w-40" value={reportMonth}
              max={new Date().toISOString().slice(0, 7)} onChange={(event) => setReportMonth(event.target.value)} />
            <ReportButton
              title="Relatório financeiro"
              description="Resumo de ganhos, gastos e dividendos do mês escolhido."
              filename={`financeiro-${reportMonth}`}
              build={() => {
                if (loading || !ratesReady)
                  throw new Error("Aguarde o carregamento dos registros e das cotações.");
                if (error)
                  throw new Error(
                    "Não foi possível carregar os dados financeiros para o relatório.",
                  );
                if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(reportMonth))
                  throw new Error("Selecione um mês válido para o relatório.");
                const year = Number(reportMonth.slice(0, 4));
                const month = Number(reportMonth.slice(5, 7));
                const fromMonth = new Date(year, month - 1, 1);
                const endOfMonth = new Date(year, month, 1, 0, 0, 0, -1);
                if (fromMonth > new Date())
                  throw new Error("Selecione o mês atual ou um mês anterior.");
                const through = new Date(Math.min(Date.now(), endOfMonth.getTime()));
                const monthLabel = new Intl.DateTimeFormat("pt-BR", {
                  month: "long", year: "numeric",
                }).format(fromMonth);
                const reportTotals = calculateFinance(
                  financeData ?? {}, fromMonth, rates.convert, through,
                );
                const dashboard = financeDashboard(
                  financeData ?? {}, fromMonth, rates.convert, through,
                );
                const totals = reportTotals;
                const purchaseAccounts = new Set((financeData?.purchases ?? []).map((p: any) => p.account_payable_id).filter(Boolean));
                const paidInMonth = (entry: any) => { const date = new Date(entry.paid_at ?? entry.created_at); return entry.status === "pago" && date >= fromMonth && date <= through; };
                const officePaid = [
                  ...(financeData?.payable ?? []).filter((entry: any) => !entry.order_id && !purchaseAccounts.has(entry.id)),
                  ...(financeData?.payroll ?? []).filter((entry: any) => !["comissao", "bonificacao"].includes(entry.entry_type)),
                ].filter(paidInMonth).reduce((sum: number, entry: any) => sum + convertFinancialAmount(entry, "USD", rates.convert), 0);
                const eligibleOrderIds = new Set((financeData?.orders ?? [])
                  .filter((order: any) => financeOrderShare(financeData ?? {}, order) > 0 &&
                    order.kind === "venda" && order.status !== "cancelado" && order.workflow_stage !== "cancelado")
                  .map((order: any) => order.id));
                const receivedInCurrency = (financeData?.payments ?? [])
                  .filter((payment: any) => payment.status === "pago" && eligibleOrderIds.has(payment.order_id) &&
                    new Date(payment.paid_at ?? payment.created_at) >= fromMonth &&
                    new Date(payment.paid_at ?? payment.created_at) <= through)
                  .reduce((sum: number, payment: any) => sum + convertFinancialAmount(payment, displayCurrency, rates.convert) *
                    financeOrderShare(financeData ?? {}, (financeData?.orders ?? []).find((order: any) => order.id === payment.order_id)), 0);
                const indicators = [
                  ["Total de vendas", totals.salesTotal],
                  ["Total em caminho", totals.inTransit],
                  ["Recebido dos clientes", totals.salesPaid],
                  ["Total das ordens de compra", totals.purchasesTotal],
                  ["Pago aos fornecedores", totals.purchasesPaid],
                  ["A receber em aberto", totals.receivableOpen],
                  ["A pagar em aberto", totals.payableOpen],
                  ["Lucro bruto previsto (pedidos menos custos da venda)", totals.grossProfit],
                  ["Lucro realizado dos pedidos após escritório", totals.realProfit - officePaid],
                  ["Despesas de escritório e folha pagas", officePaid],
                  ["Compras de estoque contratadas", totals.purchasesTotal],
                  ["Compras de estoque pagas", totals.purchasesPaid],
                  ["Entradas realizadas", totals.cashIn],
                  ["Saídas realizadas", totals.cashOut],
                  ["Retiradas dos sócios", totals.withdrawals],
                  ["Valor investido", totals.invested],
                  ["Dividendos", totals.dividends],
                ] as [string, number][];
                return {
                  highlights: [
                    { label: `Vendas (${monthLabel})`, value: reportMoney(totals.salesTotal) },
                    { label: "Lucro dos pedidos após escritório", value: reportMoney(totals.realProfit - officePaid) },
                    {
                      label: "Produtos comprados",
                      value: `${totals.purchasedUnits.toLocaleString("pt-BR")} unidades`,
                    },
                  ],
                  headers: ["Indicador", displayCurrency],
                  rows: indicators.map(([label, value]) => [label, label === "Recebido dos clientes" ? formatMoney(receivedInCurrency, displayCurrency) : reportMoney(value)]),
                  sections: [
                    {
                      title: "Período do relatório",
                      headers: ["Mês", "Início", "Fim"],
                      rows: [[monthLabel, formatDate(`${reportMonth}-01`), formatDate(`${reportMonth}-${String(through.getDate()).padStart(2, "0")}`)]],
                    },
                    {
                      title: "Produtos por situação",
                      headers: ["Situação", "Registros", "Unidades", displayCurrency],
                      rows: Object.entries({
                        sold: "Vendido",
                        costPaid: "Custo pago (unidades equivalentes)",
                        partialIn: "Entrada parcial",
                        partialOut: "Saída parcial",
                        cancelled: "Cancelado",
                        lost: "Perdido",
                        transit: "Em caminho",
                        deliveredPaid: "Entregue pago",
                        deliveredPartial: "Entregue parcialmente pago",
                        deliveredUnpaid: "Entregue não pago",
                      }).map(([key, label]) => {
                        const g = dashboard.groups[key as keyof typeof dashboard.groups] ?? { count: 0, units: 0, value: 0 };
                        return [
                          label,
                          g.count,
                          g.units.toLocaleString("pt-BR", { maximumFractionDigits: 2 }),
                          reportMoney(g.value),
                        ];
                      }),
                    },
                    {
                      title: "Critérios do relatório",
                      headers: ["Critério"],
                      rows: [
                        [
                          `Período: ${monthLabel}. Totais de venda e compra seguem a data de emissão. Entradas e saídas seguem a data de cada parcela. Saldos em aberto representam a posição atual. Compras de estoque pagas são mostradas separadamente e não reduzem novamente o lucro dos pedidos. Lucro distribuível considera recebimentos de pedidos menos custos proporcionais e despesas do escritório pagas. Retiradas reduzem apenas o saldo de cada sócio.`,
                        ],
                      ],
                    },
                  ],
                };
              }}
            />
            </div>
          }
        />
        {scopeBanner}
        {filters}

        <Tabs defaultValue="resumo">
          <TabsList className="flex-wrap">
            <TabsTrigger value="resumo">Resumo</TabsTrigger>
            <TabsTrigger value="receber">A receber</TabsTrigger>
            <TabsTrigger value="creditos">Créditos de clientes</TabsTrigger>
            <TabsTrigger value="pagar">A pagar</TabsTrigger>
            <TabsTrigger value="estoque">Em estoque</TabsTrigger>
            <TabsTrigger value="folha">Remuneração e folha</TabsTrigger>
            <TabsTrigger value="lucros">Participação nos lucros</TabsTrigger>
          </TabsList>
          <TabsContent value="resumo" className="pt-4">
            <Tabs defaultValue="visao">
              <TabsList className="flex-wrap">
                <TabsTrigger value="visao">Visão geral</TabsTrigger>
                <TabsTrigger value="investimentos">Investimentos</TabsTrigger>
              </TabsList>
              <TabsContent value="visao">
                <FinanceSummary productId={effectiveProductId} period={period} dateRange={dateRange} selectedOrderIds={selectedOrderIds} detailFilterActive={detailFilterActive} />
              </TabsContent>
              <TabsContent value="investimentos">
                <InvestmentsSection filterRow={investmentInPeriod} />
              </TabsContent>
            </Tabs>
          </TabsContent>
          <TabsContent value="receber" className="space-y-5 pt-4">
            <div>
              <h2 className="text-lg font-semibold">Pedidos e recebimentos</h2>
              <p className="text-sm text-muted-foreground">Saldo calculado pelo valor do pedido menos pagamentos confirmados. A categoria vem dos produtos do pedido.</p>
            </div>
            <div className="max-h-[600px] overflow-auto rounded-md border">
              <table className="w-full min-w-[850px] text-left text-sm">
                <thead className="sticky top-0 bg-card"><tr className="border-b">
                  <th className="p-3">Pedido</th><th className="p-3">Cliente</th><th className="p-3">Categoria</th>
                  <th className="p-3 text-right">Unidades</th><th className="p-3 text-right">Vendido</th>
                  <th className="p-3 text-right">Recebido</th><th className="p-3 text-right">A receber</th>
                  <th className="p-3">Situação</th>
                </tr></thead>
                <tbody>{orderReceivables.map(({ order, units, sold, paid, balance, stage }) =>
                  <tr key={order.id} className="border-b last:border-0">
                    <td className="p-3">#{order.number}</td>
                    <td className="p-3">{(customerOptionsQuery.data ?? []).find((customer) => customer.id === order.customer_id)?.name ?? "—"}</td>
                    <td className="p-3">{categoryOfOrder(order.id)}</td>
                    <td className="p-3 text-right">{units.toLocaleString("pt-BR")}</td>
                    <td className="p-3 text-right">{formatMoney(sold, displayCurrency)}</td>
                    <td className="p-3 text-right">{formatMoney(paid, displayCurrency)}</td>
                    <td className="p-3 text-right">{formatMoney(balance, displayCurrency)}</td>
                    <td className="p-3"><Badge variant={stage === "Pago" ? "default" : stage === "Parcial" ? "secondary" : "outline"}>{stage}</Badge></td>
                  </tr>)}</tbody>
              </table>
              {!orderReceivables.length && <p className="p-4 text-sm text-muted-foreground">Nenhum pedido neste filtro.</p>}
            </div>
            <details className="rounded-md border p-4">
              <summary className="cursor-pointer font-medium">Outras contas a receber</summary>
              <div className="pt-4"><ResourcePage
                title="Outros recebimentos"
                table="accounts_receivable"
                filter={{}}
                searchKeys={["description", "category"]}
                orderBy={{ column: "due_date", ascending: true }}
                emptyTitle="Nenhuma outra conta a receber"
                description="Lançamentos independentes de pedidos."
                columns={buildColumns("Recorrente")}
                fields={buildFields("Recorrente")}
                sortRows={sortAccounts}
                filterRow={accountInPeriod}
                expandSave={expandInstallments}
              /></div>
            </details>
          </TabsContent>
          <TabsContent value="creditos" className="pt-4"><CustomerCreditsSection /></TabsContent>
          <TabsContent value="pagar" className="pt-4">
            <ResourcePage
              title="Contas a pagar"
              table="accounts_payable"
              filter={filter}
              searchKeys={["description", "category"]}
              orderBy={{ column: "due_date", ascending: true }}
              emptyTitle="Nenhuma conta a pagar"
              description="Estoque fica separado. Aqui aparece o custo faturado ainda não abatido pelos pagamentos, além das outras contas da empresa."
              columns={buildColumns("Fixa").map((column) =>
                column.key === "amount"
                  ? {
                      ...column,
                      render: (r: any) => (
                        <CurrencyValues
                          value={
                            financeData?.purchasePositions?.find((p: any) => p.accountId === r.id)
                              ?.debt ?? r.amount
                          }
                          currency={r.currency}
                        />
                      ),
                    }
                  : column,
              )}
              fields={buildFields("Fixa")}
              sortRows={sortAccounts}
              filterRow={(r) =>
                r.status !== "cancelado" &&
                inPeriod(r.paid_at ?? r.due_date ?? r.created_at) &&
                (financeData?.purchasePositions?.find((p: any) => p.accountId === r.id)?.debt ??
                  Number(r.amount)) > 0
              }
              beforeSave={(values, context) => {
                if (
                  context.editing &&
                  financeData?.purchasePositions?.some((p: any) => p.accountId === context.row?.id)
                )
                  throw new Error(
                    "Registre pagamentos desta compra pela aba Compras. O saldo faturado é calculado automaticamente.",
                  );
                return values;
              }}
              enabled={!loading && !error}
              expandSave={expandInstallments}
            />
          </TabsContent>
          <TabsContent value="folha" className="pt-4">
            <PayrollSection filterRow={payrollInPeriod} currency={displayCurrency} />
          </TabsContent>
          <TabsContent value="lucros" className="pt-4">
            <ProfitSplitCard realProfit={totals.realProfit} productId={effectiveProductId} />
          </TabsContent>
          <TabsContent value="estoque" className="pt-4">
            <FinanceStock currency={displayCurrency} productIdOverride={effectiveProductId} />
          </TabsContent>
        </Tabs>
      </div>
    </DisplayCurrencyContext.Provider>
  );
}
