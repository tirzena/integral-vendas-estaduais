/* eslint-disable @typescript-eslint/no-explicit-any */
import { useContext, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useRates } from "@/hooks/useRates";
import { useFinanceTotals } from "@/hooks/useFinanceTotals";
import { periodStart, type RankingPeriod } from "@/hooks/useRanking";
import type { FinanceDateRange } from "@/lib/finance-date-range";
import { convertFinancialAmount } from "@/lib/financial-exchange";
import { financeOrderShare } from "@/lib/finance-totals";
import { formatMoney } from "@/lib/format";
import { orderNumber } from "@/lib/sales";
import { DisplayCurrencyContext } from "@/components/common/CurrencyValues";
import { Card, CardContent } from "@/components/ui/card";

export function FinanceSummary({
  productId, period = "tudo", dateRange, selectedOrderIds, detailFilterActive = false,
}: {
  productId: string;
  period?: RankingPeriod;
  dateRange?: FinanceDateRange;
  selectedOrderIds?: Set<string>;
  detailFilterActive?: boolean;
}) {
  const { data, loading, error, ratesReady } = useFinanceTotals(period, productId, dateRange);
  const currency = useContext(DisplayCurrencyContext) ?? "BRL";
  const { convert } = useRates();
  const { data: credits = [] } = useQuery({
    queryKey: ["finance-order-customer-credits"],
    queryFn: async () => {
      const rows: { order_id: string; amount: number; currency: string }[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await (supabase as any).from("customer_credit_entries")
          .select("order_id,amount,currency").eq("kind", "applied").order("id")
          .range(offset, offset + 499);
        if (error) throw error;
        rows.push(...(data ?? []));
        if ((data ?? []).length < 500) break;
      }
      return rows;
    },
  });
  const report = useMemo(() => {
    const zero = { units: 0, sold: 0, received: 0, cost: 0, shipping: 0, commission: 0, bonus: 0, loss: 0, stockPaid: 0, office: 0, officeFixed: 0, officeVariable: 0, transportPaid: 0, count: 0 };
    const result = { ...zero };
    const from = dateRange?.from ?? periodStart(period);
    const through = dateRange?.through ?? new Date();
    const inRange = (value: any) => {
      if (!value) return !from;
      const date = new Date(String(value).length === 10 ? value + "T00:00:00" : value);
      return !Number.isNaN(date.getTime()) && (!from || date >= from) && date <= through;
    };
    const money = (value: any, source: any) => {
      const amount = Number(value ?? 0);
      return source === currency ? amount : convert(amount, source ?? "USD", currency) ?? 0;
    };
    const orderMoney = (order: any, value: any) => {
      const amount = Number(value ?? 0);
      if (order.currency === currency) return amount;
      const snapshot = order.exchange_rates_snapshot;
      const rate = Number(snapshot?.[currency]);
      if (snapshot?.base === order.currency && rate > 0) return amount * rate;
      return money(amount, order.currency);
    };
    const orderCost = (order: any) => {
      if (order.total_cost_usd == null) return orderMoney(order, order.merchandise_cost);
      if (currency === "USD") return Number(order.total_cost_usd);
      if (currency === "BRL" && order.total_cost_brl != null) return Number(order.total_cost_brl);
      if (order.total_cost_brl != null && order.exchange_rates_snapshot?.base === "BRL") {
        const rate = Number(order.exchange_rates_snapshot?.[currency]);
        if (rate > 0) return Number(order.total_cost_brl) * rate;
      }
      return money(order.total_cost_usd, "USD");
    };
    const lines = new Map<string, number>();
    for (const line of data?.orderItems ?? []) {
      if (data?.productId && !data.itemIds?.has(line.item_id)) continue;
      lines.set(line.order_id, (lines.get(line.order_id) ?? 0) + Number(line.quantity ?? 0));
    }
    const payments = new Map<string, any[]>();
    for (const pay of data?.payments ?? []) {
      if (pay.status !== "pago") continue;
      const current = payments.get(pay.order_id) ?? [];
      current.push(pay);
      payments.set(pay.order_id, current);
    }
    const creditByOrder = new Map<string, number>();
    for (const entry of credits) {
      if (!entry.order_id) continue;
      creditByOrder.set(entry.order_id, (creditByOrder.get(entry.order_id) ?? 0) + money(-Number(entry.amount), entry.currency));
    }
    const rows: { id: string; name: string; units: number; cost: number; received: number; shipping: number; sold: number; commission: number; credit: number }[] = [];
    for (const order of data?.orders ?? []) {
      const share = financeOrderShare(data ?? {}, order);
      if (!share || order.deleted_at || order.superseded_at || order.kind !== "venda" ||
          order.status === "cancelado" || order.workflow_stage === "cancelado" ||
          ["rascunho", "solicitacao_catalogo"].includes(order.workflow_stage) ||
          (detailFilterActive && !selectedOrderIds?.has(order.id))) continue;
      const issued = inRange(order.order_date ?? order.created_at);
      const paid = (payments.get(order.id) ?? []).filter((pay) => inRange(pay.paid_at ?? pay.created_at));
      if (!issued && !paid.length) continue;
      const received = paid.reduce((sum, pay) => sum + convertFinancialAmount(pay, currency, convert), 0) * share;
      const sold = issued ? orderMoney(order, order.total) * share : 0;
      const cost = issued ? orderCost(order) * share : 0;
      const shipping = issued ? orderMoney(order, order.shipping_cost) * share : 0;
      const commission = issued ? orderMoney(order, order.commission_total) * share : 0;
      const bonus = issued ? orderMoney(order, order.bonus_amount) * share : 0;
      const units = issued ? lines.get(order.id) ?? 0 : 0;
      if (issued) {
        result.count++;
        result.units += units;
        result.sold += sold;
        result.cost += cost;
        result.shipping += shipping;
        result.commission += commission;
        result.bonus += bonus;
        if (order.fulfillment_status === "perdido" || order.workflow_stage === "perdido") result.loss += cost;
      }
      result.received += received;
      rows.push({ id: order.id, name: orderNumber(order.number, order.revision_no), units, sold, cost, received, shipping, commission, credit: creditByOrder.get(order.id) ?? 0 });
    }
    if (!detailFilterActive) {
      const ids = new Set((data?.purchases ?? []).map((p: any) => p.account_payable_id).filter(Boolean));
      for (const payment of data?.purchasePayments ?? [])
        if (payment.status !== "cancelado" && inRange(payment.paid_at ?? payment.created_at) &&
            (productId === "todos" || (data?.purchases ?? []).some((p: any) => p.id === payment.purchase_order_id &&
              p.purchase_order_items?.some((item: any) => data?.itemIds?.has(item.item_id)))))
          result.stockPaid += money(payment.amount, payment.currency);
      for (const entry of data?.payable ?? [])
        if (!entry.order_id && !ids.has(entry.id) && entry.status === "pago" && inRange(entry.paid_at ?? entry.created_at)) {
          const amount = convertFinancialAmount(entry, currency, convert);
          if (/frete|transporte|logística/i.test(`${entry.category ?? ""} ${entry.cost_center ?? ""}`)) result.transportPaid += amount;
          else { result.office += amount; result[entry.recurrence === "fixa" ? "officeFixed" : "officeVariable"] += amount; }
        }
      for (const entry of data?.payroll ?? [])
        if (entry.status === "pago" && !["comissao", "bonificacao"].includes(entry.entry_type) && inRange(entry.paid_at ?? entry.created_at))
          { const amount = convertFinancialAmount(entry, currency, convert); result.office += amount; result.officeFixed += amount; }
    }
    rows.sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { numeric: true }));
    return { ...result, rows, gross: result.sold - result.cost - result.shipping - result.commission - result.bonus,
      realized: result.received - result.cost - result.shipping - result.commission - result.bonus - result.office - result.transportPaid };
  }, [data, credits, dateRange?.from?.getTime(), dateRange?.through?.getTime(), period, productId, selectedOrderIds, detailFilterActive, currency, convert]);
  if (loading || !ratesReady) return <p className="text-sm text-muted-foreground">Carregando registros financeiros…</p>;
  if (error) return <p role="alert">Não foi possível carregar os registros financeiros.</p>;
  const cards = [
    ["Vendido nos pedidos", report.sold, "Valor contratado · " + report.count + " pedidos / " + report.units.toLocaleString("pt-BR") + " unidades"],
    ["Recebido dos pedidos", report.received, "Pagamentos efetivamente recebidos no intervalo"],
    ["Custo dos produtos vendidos", report.cost, "Custo das unidades dos pedidos; compras em estoque ficam separadas"],
    ["Frete e transporte", report.shipping + report.transportPaid, "Frete previsto nos pedidos e transporte pago em contas a pagar"],
    ["Lucro bruto previsto", report.gross, "Vendido menos produtos, frete, comissão, bonificação e perda"],
    ["Comissões", report.commission, "Valores previstos nos pedidos"],
    ["Bonificações", report.bonus, "Valor registrado de bonificação nos pedidos"],
    ["Perdas", report.loss, "Parte do custo dos produtos vendidos, já incluída no custo acima"],
  ] as const;
  const quick = [
    ["Unidades nos pedidos", report.units.toLocaleString("pt-BR"), report.count + " pedidos"],
    ["Custo dos pedidos", formatMoney(report.cost, currency), "Produtos vendidos"],
    ["Recebido dos pedidos", formatMoney(report.received, currency), "Pagamentos confirmados"],
    ["Transporte", formatMoney(report.shipping + report.transportPaid, currency), "Pedidos + despesas pagas"],
  ];
  return <div className="space-y-6 pt-4">
    <section aria-label="Indicadores financeiros" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(([label, value, hint]) => <Card key={label} className="border-border bg-card text-card-foreground shadow-sm">
        <CardContent className="space-y-2 p-5">
          <p className="text-sm text-muted-foreground">{label}</p>
          <strong className="block text-2xl font-semibold tracking-tight">{formatMoney(value, currency)}</strong>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </CardContent>
      </Card>)}
    </section>
    <section aria-label="Resumo rápido dos pedidos">
      <h3 className="mb-3 text-base font-semibold">Pedidos e saídas</h3>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{quick.map(([label, value, hint]) =>
        <Card key={label}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p>
          <strong className="mt-1 block text-lg">{value}</strong><small className="text-muted-foreground">{hint}</small></CardContent></Card>)}</div>
    </section>
    <Card><CardContent className="space-y-3 p-5">
      <h3 className="font-semibold">Resultado e despesas do escritório</h3>
      <div className="grid gap-4 sm:grid-cols-3">
        <p>Compras de estoque pagas <strong className="block">{formatMoney(report.stockPaid, currency)}</strong><small className="text-muted-foreground">Compras registradas; estoque não reduz novamente o lucro dos pedidos.</small></p>
        <p>Escritório e folha pagos <strong className="block">{formatMoney(report.office, currency)}</strong><small className="text-muted-foreground">Fixos e folha: {formatMoney(report.officeFixed, currency)} · Variáveis: {formatMoney(report.officeVariable, currency)}.</small></p>
        <p>Resultado após recebimentos e despesas <strong className="block">{formatMoney(report.realized, currency)}</strong><small className="text-muted-foreground">Recebido menos custos previstos dos pedidos e despesas pagas. Não é saldo bancário.</small></p>
      </div>
    </CardContent></Card>
    <Card><CardContent className="space-y-4 p-5">
      <div><h3 className="font-semibold">Totais dos pedidos e pagamentos</h3><p className="text-xs text-muted-foreground">Vendas e custos seguem a data do pedido; recebimentos seguem a data do pagamento.</p></div>
      <div className="h-72 min-w-0"><ResponsiveContainer width="100%" height="100%">
        <BarChart data={[{ name: "Total no período", sold: report.sold, received: report.received, cost: report.cost }]} margin={{ left: 8, right: 8 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
          <XAxis dataKey="name" />
          <YAxis width={72} tickFormatter={(value) => new Intl.NumberFormat("pt-BR", { notation: "compact" }).format(value)} />
          <Tooltip formatter={(value: any) => formatMoney(Number(value), currency)} />
          <Legend />
          <Bar dataKey="sold" name="Pedidos vendidos" fill="#3b82f6" radius={[3,3,0,0]} maxBarSize={120} />
          <Bar dataKey="received" name="Pagamentos recebidos" fill="#10b981" radius={[3,3,0,0]} maxBarSize={120} />
          <Bar dataKey="cost" name="Custo dos pedidos" fill="#ef4444" radius={[3,3,0,0]} maxBarSize={120} />
        </BarChart>
      </ResponsiveContainer></div>
      <h4 className="font-medium">Detalhamento por pedido</h4>
      {report.rows.length ? <>
        <div className="max-h-80 overflow-auto rounded-md border">
          <table className="w-full min-w-[980px] table-fixed text-left text-xs lg:text-sm"><thead className="sticky top-0 bg-card"><tr className="border-b">
            <th className="w-[11%] px-2 py-3">Pedido</th><th className="w-[8%] px-2 py-3 text-right">Unidades</th><th className="w-[13%] px-2 py-3 text-right">Vendido</th><th className="w-[13%] px-2 py-3 text-right">Custo</th><th className="w-[13%] px-2 py-3 text-right">Recebido</th><th className="w-[12%] px-2 py-3 text-right">Frete</th><th className="w-[13%] px-2 py-3 text-right">Comissão</th><th className="w-[17%] px-2 py-3 text-right">Crédito do cliente</th>
          </tr></thead><tbody>{report.rows.map((row) => <tr key={row.id} className="border-b last:border-0">
            <td className="px-2 py-3"><a className="font-medium text-primary underline-offset-4 hover:underline" href={`/pedidos?aba=pedidos&pedido=${encodeURIComponent(row.id)}`}>{row.name}</a></td><td className="px-2 py-3 text-right">{row.units.toLocaleString("pt-BR")}</td>
            {[row.sold,row.cost,row.received,row.shipping,row.commission,row.credit].map((amount, index) =>
              <td key={index} className="whitespace-nowrap px-2 py-3 text-right tabular-nums">{formatMoney(amount, currency)}</td>)}
          </tr>)}</tbody></table>
        </div></> : <p className="text-sm text-muted-foreground">Nenhum pedido no intervalo selecionado.</p>}
    </CardContent></Card>
    <p className="text-xs text-muted-foreground">Os custos e comissões previstos seguem a data do pedido. Pagamentos quitados usam o câmbio registrado no recebimento. Compras pagas compõem o caixa, mas não são abatidas novamente do lucro de produtos já vendidos.</p>
  </div>;
}
