/* eslint-disable @typescript-eslint/no-explicit-any */
import { convertFinancialAmount } from "./financial-exchange";
import { financeOrderShare } from "./finance-totals";
export function paymentProgress(paid: number, total: number) {
  return total > 0 ? Math.max(0, Math.min(100, (paid / total) * 100)) : 0;
}
export function financeDashboard(data: any, from: Date | null, convert: any, now = new Date()) {
  const period = (value: string) => {
    if (!value) return !from;
    const date = new Date(value.length === 10 ? value + "T00:00:00" : value);
    return date <= now && (!from || date >= from);
  };
  const amount = (value: number, currency: string) =>
    convert(Number(value || 0), currency || "USD", "USD") ?? 0;
  type GroupKey =
    | "sold"
    | "reserved"
    | "paidFull"
    | "paidPartial"
    | "received"
    | "sellingExpenses"
    | "partialIn"
    | "cancelled"
    | "lost"
    | "transit"
    | "deliveredPaid"
    | "deliveredPartial"
    | "deliveredUnpaid"
    | "purchased"
    | "costPaid"
    | "partialOut";
  const groups = {} as Record<GroupKey, { value: number; units: number; count: number }>;
  const add = (key: GroupKey, value: number, units: number) => {
    const g = groups[key] ?? { value: 0, units: 0, count: 0 };
    g.value += value;
    g.units += units;
    g.count += 1;
    groups[key] = g;
  };
  const orderProgress: any[] = [];
  const scoped = (o: any) => financeOrderShare(data, o) > 0;
  const eligible = (data.orders ?? []).filter(
    (o: any) =>
      scoped(o) &&
      !o.deleted_at &&
      !o.superseded_at &&
      o.kind === "venda" &&
      !["rascunho", "solicitacao_catalogo"].includes(o.workflow_stage),
  );
  for (const o of eligible) {
    const share = financeOrderShare(data, o);
    const lines = (data.orderItems ?? []).filter((i: any) => i.order_id === o.id && (!data.productId || data.itemIds?.has(i.item_id)));
    const units = lines.reduce((sum: number, i: any) => sum + Number(i.quantity || 0), 0);
    const payments = (data.payments ?? []).filter(
      (p: any) =>
        p.order_id === o.id && p.status === "pago" && new Date(p.paid_at ?? p.created_at) <= now,
    );
    const paid = payments.reduce(
      (sum: number, p: any) => sum + convertFinancialAmount(p, o.currency, convert),
      0,
    );
    const ratio = paymentProgress(paid, Number(o.total));
    const received = payments
      .filter((p: any) => period(p.paid_at ?? p.created_at))
      .reduce((sum: number, p: any) => sum + convertFinancialAmount(p, "USD", convert), 0);
    if (o.status !== "cancelado" && o.workflow_stage !== "cancelado" && received > 0) {
      const current = payments
        .filter((p: any) => period(p.paid_at ?? p.created_at))
        .reduce((n: number, p: any) => n + convertFinancialAmount(p, o.currency, convert), 0);
      const before = paid - current;
      const total = Number(o.total || 0);
      const fraction =
        total > 0 ? Math.max(0, Math.min(1, paid / total) - Math.min(1, before / total)) : 0;
      add("received", received * share, units * fraction);
    }
    if (
      o.status !== "cancelado" &&
      o.workflow_stage !== "cancelado" &&
      ratio > 0 &&
      ratio < 100 &&
      received > 0
    )
      add("partialIn", received * share, units);
    if (!period(o.order_date ?? o.created_at)) continue;
    const orderAmount = (value: number) => {
      const snapshot = Number(o.exchange_rates_snapshot?.USD);
      return o.currency !== "USD" && snapshot > 0
        ? Number(value || 0) * snapshot
        : amount(value, o.currency);
    };
    const value = orderAmount(o.total) * share;
    if (o.status === "cancelado" || o.workflow_stage === "cancelado") {
      add("cancelled", value, units);
      continue;
    }
    add("sold", value, units);
    const paidFraction = ratio / 100;
    if (o.fulfillment_status !== "perdido" && o.workflow_stage !== "perdido") {
      if (paidFraction < 1) add("reserved", value * (1 - paidFraction), units * (1 - paidFraction));
      if (paidFraction >= 1) add("paidFull", value, units);
      else if (paidFraction > 0) add("paidPartial", value * paidFraction, units * paidFraction);
    }
    add(
      "sellingExpenses",
      share * amount(
        Number(o.shipping_cost || 0) +
          Number(o.commission_total || 0) +
          Number(o.bonus_amount || 0),
        o.currency,
      ),
      0,
    );
    if (o.fulfillment_status === "perdido" || o.workflow_stage === "perdido")
      add("lost", value, units);
    else if (o.delivered_at || o.fulfillment_status === "entregue")
      add(
        ratio >= 99.999 ? "deliveredPaid" : ratio > 0 ? "deliveredPartial" : "deliveredUnpaid",
        value,
        units,
      );
    else if (
      o.fulfillment_status === "a_caminho" ||
      o.workflow_stage === "em_caminho" ||
      o.status === "enviado"
    )
      add("transit", value, units);
    orderProgress.push({
      id: o.id,
      number: o.number,
      revision: o.revision_no,
      ratio,
      total: value,
      paid: orderAmount(paid) * share,
    });
  }
  const orderIds = new Set(
    eligible
      .filter((o: any) => o.status !== "cancelado" && o.workflow_stage !== "cancelado")
      .flatMap((o: any) => [o.id, o.root_order_id].filter(Boolean)),
  );
  const purchaseProgress: any[] = [];
  for (const p of data.purchases ?? []) {
    if (p.status === "cancelada" || p.payment_status === "cancelado") continue;
    if (
      p.source_order_id &&
      !orderIds.has(p.source_order_id) &&
      !orderIds.has(p.source_root_order_id)
    )
      continue;
    const lines = (p.purchase_order_items ?? []).filter(
      (i: any) => i.active !== false && (!data.productId || data.itemIds?.has(i.item_id)),
    );
    const merchandise = lines.reduce((sum: number, i: any) => sum + Number(i.total || 0), 0);
    const all = (p.purchase_order_items ?? [])
      .filter((i: any) => i.active !== false)
      .reduce((sum: number, i: any) => sum + Number(i.total || 0), 0);
    const share = data.productId ? (all > 0 ? merchandise / all : 0) : 1;
    if (!share) continue;
    const units = lines.reduce((sum: number, i: any) => sum + Number(i.quantity || 0), 0);
    const pays = (data.purchasePayments ?? []).filter(
      (pay: any) =>
        pay.purchase_order_id === p.id &&
        pay.status !== "cancelado" &&
        new Date(pay.paid_at ?? pay.created_at) <= now,
    );
    const paid = pays.reduce(
      (sum: number, pay: any) => sum + (convert(Number(pay.amount), pay.currency, p.currency) ?? 0),
      0,
    );
    const ratio = paymentProgress(paid, Number(p.total));
    const paidPeriod =
      pays
        .filter((pay: any) => period(pay.paid_at ?? pay.created_at))
        .reduce((sum: number, pay: any) => sum + amount(pay.amount, pay.currency), 0) * share;
    if (paidPeriod > 0)
      add(
        "costPaid",
        paidPeriod * (Number(p.total) > 0 ? all / Number(p.total) : 0),
        units *
          Math.min(
            1,
            amount(p.total, p.currency) * share > 0
              ? paidPeriod / (amount(p.total, p.currency) * share)
              : 0,
          ),
      );
    if (ratio > 0 && ratio < 100 && paidPeriod > 0) add("partialOut", paidPeriod, units);
    if (!period(p.purchase_date ?? p.created_at)) continue;
    add("purchased", amount(p.total, p.currency) * share, units);
    purchaseProgress.push({
      id: p.id,
      number: p.number,
      ratio,
      total: amount(p.total, p.currency) * share,
      paid: amount(paid, p.currency) * share,
    });
  }
  for (const award of data.awards ?? []) {
    if (
      award.status !== "cancelado" &&
      (!data.productId || award.product_id === data.productId) &&
      period(award.created_at)
    )
      add("sellingExpenses", amount(award.amount, award.currency), 0);
  }
  orderProgress.sort((a, b) => Number(a.number) - Number(b.number));
  purchaseProgress.sort((a, b) => Number(a.number) - Number(b.number));
  return { groups, orderProgress, purchaseProgress };
}
