/* eslint-disable @typescript-eslint/no-explicit-any */
import { convertFinancialAmount } from "./financial-exchange";

const FINANCE_KEYS = [
  "earnings",
  "spending",
  "dividends",
  "balance",
  "receivableOpen",
  "payableOpen",
  "invested",
  "payroll",
  "prolabore",
  "costs",
  "grossProfit",
  "netProfit",
  "realProfit",
  "cashIn",
  "cashOut",
  "salesTotal",
  "inTransit",
  "salesPaid",
  "purchasesTotal",
  "purchasesPaid",
  "purchasedUnits",
  "presumedCost",
  "realCost",
  "presumedProfit",
  "withdrawals",
  "cashAvailable",
] as const;
export type FinanceTotals = Record<(typeof FINANCE_KEYS)[number], number>;

/** Participação dos itens da categoria no pedido; não depende de orders.product_id. */
export function financeOrderShare(data: any, order: any): number {
  if (!data.productId) return 1;
  const lines = (data.orderItems ?? []).filter((line: any) => line.order_id === order.id);
  if (!lines.length) return order.product_id === data.productId ? 1 : 0;
  const selected = lines.filter((line: any) => data.itemIds?.has(line.item_id));
  if (!selected.length) return 0;
  const total = lines.reduce((sum: number, line: any) => sum + Math.max(0, Number(line.total ?? 0)), 0);
  if (total > 0) return selected.reduce((sum: number, line: any) => sum + Math.max(0, Number(line.total ?? 0)), 0) / total;
  const units = lines.reduce((sum: number, line: any) => sum + Math.max(0, Number(line.quantity ?? 0)), 0);
  return units > 0 ? selected.reduce((sum: number, line: any) => sum + Math.max(0, Number(line.quantity ?? 0)), 0) / units : selected.length / lines.length;
}

/** Registros de venda e compra são a origem; contas espelhadas não entram duas vezes. */
export type FinanceCashEvent = { date: string; kind: "in" | "out"; amount: number; source: string };
export function calculateFinance(
  data: any,
  from: Date | null,
  convert: any,
  now = new Date(),
  events?: FinanceCashEvent[],
) {
  const cash = (date: string, kind: "in" | "out", amount: number, source: string) =>
    events?.push({ date, kind, amount, source });
  const inPeriod = (date: string) => {
    if (!date) return !from;
    const d = new Date(date.length === 10 ? date + "T00:00:00" : date);
    return d <= now && (!from || d >= from);
  };
  const usd = (amount: any, currency: any) =>
    convert(Number(amount ?? 0), currency ?? "USD", "USD") ?? 0;
  const paidUsd = (row: any) => convertFinancialAmount({ ...row, status: "pago" }, "USD", convert);
  const t = Object.fromEntries(FINANCE_KEYS.map((k) => [k, 0])) as FinanceTotals;
  const selected = (r: any) => !data.productId || r.product_id === data.productId;
  const orders = (data.orders ?? []).filter(
    (o: any) =>
      financeOrderShare(data, o) > 0 &&
      !o.deleted_at &&
      !o.superseded_at &&
      o.status !== "cancelado" &&
      o.workflow_stage !== "cancelado" &&
      o.kind === "venda" &&
      !["rascunho", "solicitacao_catalogo"].includes(o.workflow_stage),
  );
  const ids = new Set(orders.flatMap((o: any) => [o.id, o.root_order_id].filter(Boolean)));
  const sellerSales = new Map<string, { total: number; paid: number }>();
  let saleCosts = 0,
    realExpenses = 0;
  for (const o of orders) {
    const orderUsd = (amount: any) => {
      const rate = Number(o.exchange_rates_snapshot?.USD);
      return o.currency !== "USD" && rate > 0
        ? Number(amount ?? 0) * rate
        : usd(amount, o.currency);
    };
    const share = financeOrderShare(data, o);
    const total = orderUsd(o.total) * share;
    const payments = (data.payments ?? []).filter(
      (p: any) => p.order_id === o.id && p.status === "pago",
    );
    const paid = payments
      .filter((p: any) => new Date(p.paid_at ?? p.created_at) <= now)
      .reduce((sum: number, p: any) => sum + convertFinancialAmount(p, o.currency, convert), 0);
    const receivedPeriod = payments
      .filter((p: any) => inPeriod(p.paid_at ?? p.created_at))
      .reduce((sum: number, p: any) => sum + paidUsd(p), 0);
    const nominal = (p: any) => convertFinancialAmount(p, o.currency, convert);
    const before = payments
      .filter((p: any) => from && new Date(p.paid_at ?? p.created_at) < from)
      .reduce((n: number, p: any) => n + nominal(p), 0);
    const receivedNominal = payments
      .filter((p: any) => inPeriod(p.paid_at ?? p.created_at))
      .reduce((n: number, p: any) => n + nominal(p), 0);
    const orderAmount = Number(o.total ?? 0);
    const ratio =
      orderAmount > 0
        ? Math.max(
            0,
            Math.min(1, (before + receivedNominal) / orderAmount) -
              Math.min(1, before / orderAmount),
          )
        : 0;
    const merchandise =
      o.total_cost_usd !== null && o.total_cost_usd !== undefined
        ? Number(o.total_cost_usd)
        : orderUsd(o.merchandise_cost ?? 0);
    const expenses =
      merchandise +
      orderUsd(o.shipping_cost) +
      orderUsd(o.commission_total) +
      orderUsd(o.bonus_amount);
    const seller = sellerSales.get(o.seller_id) ?? { total: 0, paid: 0 };
    if (inPeriod(o.order_date ?? o.created_at)) {
      t.salesTotal += total;
      saleCosts += expenses * share;
      if (
        o.fulfillment_status !== "perdido" &&
        o.workflow_stage !== "perdido" &&
        !o.delivered_at &&
        o.fulfillment_status !== "entregue" &&
        (o.fulfillment_status === "a_caminho" ||
          o.status === "enviado" ||
          o.workflow_stage === "em_caminho")
      )
        t.inTransit += total;
    }
    seller.total += total;
    seller.paid += receivedPeriod * share;
    sellerSales.set(o.seller_id, seller);
    for (const p of payments.filter((p: any) => inPeriod(p.paid_at ?? p.created_at)))
      cash(p.paid_at ?? p.created_at, "in", paidUsd(p) * share, "Vendas");
    t.salesPaid += receivedPeriod * share;
    t.realCost += merchandise * ratio * share;
    realExpenses += expenses * ratio * share;
    // Saldo em aberto é posição atual, mesmo quando a emissão precede o período.
    t.receivableOpen += orderUsd(Math.max(0, Number(o.total) - paid)) * share;
  }
  const purchases = (data.purchases ?? []).filter(
    (p: any) =>
      p.status !== "cancelada" &&
      p.payment_status !== "cancelado" &&
      (!p.source_order_id || ids.has(p.source_order_id) || ids.has(p.source_root_order_id)),
  );
  const payableIds = new Set((data.purchases ?? []).map((p: any) => p.account_payable_id));
  for (const p of purchases) {
    const items = (p.purchase_order_items ?? []).filter(
      (i: any) => i.active !== false && (!data.productId || data.itemIds?.has(i.item_id)),
    );
    const merchandise = items.reduce((sum: number, i: any) => sum + Number(i.total), 0);
    const allMerchandise = (p.purchase_order_items ?? [])
      .filter((i: any) => i.active !== false)
      .reduce((sum: number, i: any) => sum + Number(i.total), 0);
    const share = data.productId ? (allMerchandise > 0 ? merchandise / allMerchandise : 0) : 1;
    const position = data.purchasePositions?.find((row: any) => row.id === p.id);
    if (inPeriod(p.purchase_date ?? p.created_at)) {
      t.purchasesTotal += usd(p.total, p.currency) * share;
      t.presumedCost += usd(
        p.source_type === "manual"
          ? (position?.products ?? [])
              .filter((i: any) => !data.productId || data.itemIds?.has(i.itemId))
              .reduce((sum: number, i: any) => sum + i.cost, 0)
          : merchandise,
        p.currency,
      );
      t.purchasedUnits += items.reduce((sum: number, i: any) => sum + Number(i.quantity), 0);
    }
    const supplierPaid = (data.purchasePayments ?? [])
      .filter(
        (pay: any) =>
          pay.purchase_order_id === p.id && new Date(pay.paid_at ?? pay.created_at) <= now,
      )
      .reduce(
        (n: number, pay: any) => n + (convert(Number(pay.amount), pay.currency, p.currency) ?? 0),
        0,
      );
    const committed = position?.committed ?? (p.source_type === "manual" ? 0 : Number(p.total));
    t.payableOpen +=
      usd(Math.max(0, committed - Math.max(supplierPaid, Number(p.amount_paid || 0))), p.currency) *
      share;
    for (const pay of (data.purchasePayments ?? []).filter(
      (pay: any) => pay.purchase_order_id === p.id && inPeriod(pay.paid_at ?? pay.created_at),
    )) {
      const amount = usd(pay.amount, pay.currency) * share;
      t.purchasesPaid += amount;
      cash(pay.paid_at ?? pay.created_at, "out", amount, "Fornecedores");
    }
  }
  t.cashIn = t.salesPaid;
  t.cashOut = t.purchasesPaid;
  for (const r of (data.receivable ?? []).filter(selected)) {
    if (r.order_id || r.status === "cancelado") continue;
    if (r.status === "pago" && inPeriod(r.paid_at ?? r.created_at)) {
      t.cashIn += paidUsd(r);
      cash(r.paid_at ?? r.created_at, "in", paidUsd(r), "Outros recebimentos");
    } else if (r.status !== "pago") t.receivableOpen += usd(r.amount, r.currency);
  }
  for (const p of (data.payable ?? []).filter(selected)) {
    if (payableIds.has(p.id) || p.status === "cancelado") continue;
    if (p.status === "pago" && inPeriod(p.paid_at ?? p.created_at)) {
      t.cashOut += paidUsd(p);
      cash(p.paid_at ?? p.created_at, "out", paidUsd(p), "Pagamentos");
    } else if (p.status !== "pago") t.payableOpen += usd(p.amount, p.currency);
  }
  for (const p of (data.payroll ?? []).filter(selected)) {
    if (p.status === "cancelado" || !inPeriod(p.paid_at ?? p.created_at)) continue;
    t.payroll += usd(p.amount, p.currency);
    if (p.entry_type === "prolabore") t.prolabore += usd(p.amount, p.currency);
    if (p.status === "pago") {
      t.cashOut += paidUsd(p);
      cash(p.paid_at ?? p.created_at, "out", paidUsd(p), "Pagamentos");
    } else t.payableOpen += usd(p.amount, p.currency);
  }
  for (const b of (data.awards ?? []).filter(selected)) {
    if (b.status === "cancelado" || !inPeriod(b.created_at)) continue;
    const amount = usd(b.amount, b.currency);
    saleCosts += amount;
    const seller = sellerSales.get(b.user_id);
    realExpenses += amount * (seller?.total ? Math.min(1, seller.paid / seller.total) : 0);
    if (b.status === "pago") {
      t.cashOut += amount;
      cash(b.created_at, "out", amount, "Bonificações");
    }
  }
  for (const i of (data.investments ?? []).filter(selected)) {
    if (!inPeriod(i.invested_at ?? i.created_at)) continue;
    t.invested += usd(i.amount, i.currency);
    t.dividends += usd(i.realized_return, i.currency);
  }
  for (const m of (data.movements ?? []).filter(selected)) {
    if (m.order_id || !inPeriod(m.occurred_at)) continue;
    const amount = usd(m.amount, m.currency);
    cash(m.occurred_at, m.kind === "saida" ? "out" : "in", amount, "Caixa");
    if (m.kind === "saida") t.cashOut += amount;
    else t.cashIn += amount;
  }
  t.earnings = t.salesTotal;
  t.costs = t.presumedCost;
  t.spending = t.cashOut;
  t.grossProfit = t.salesTotal - saleCosts;
  t.presumedProfit = t.grossProfit;
  t.realProfit = t.salesPaid - realExpenses;
  t.netProfit = t.cashIn - t.cashOut;
  t.balance = t.netProfit;
  t.withdrawals = (data.withdrawals ?? [])
    .filter(
      (w: any) =>
        w.status !== "cancelado" &&
        inPeriod(w.withdrawn_at) &&
        (!data.productId || w.profit_shares?.product_id === data.productId),
    )
    .reduce((sum: number, w: any) => sum + Number(w.amount_usd), 0);
  t.cashAvailable = t.netProfit - t.withdrawals;
  return t;
}
