type PaymentDelayOrder = {
  delivered_at?: string | null; amount_paid?: number | string | null;
  total?: number | string | null; status?: string | null; workflow_stage?: string | null;
  fulfillment_status?: string | null; approval_status?: string | null;
};

/** Dias corridos desde a entrega, no calendário de São Paulo; tolerância de três dias. */
export function paymentDelayDays(order: PaymentDelayOrder, hasPendingPayment = false, now = new Date()): number {
  if (!order.delivered_at || hasPendingPayment || Number(order.amount_paid ?? 0) > 0 ||
      Number(order.total ?? 0) <= 0 || ["cancelado", "recusado"].includes(order.status ?? "") ||
      order.workflow_stage === "perdido" || order.fulfillment_status === "perdido" ||
      ["pending", "rejected"].includes(order.approval_status ?? "")) return 0;
  const date = String(order.delivered_at).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 0;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)?.value ?? "";
  const today = Date.parse(`${part("year")}-${part("month")}-${part("day")}T00:00:00Z`);
  const delivered = Date.parse(`${date}T00:00:00Z`);
  const days = Math.floor((today - delivered) / 86400000);
  return Number.isFinite(days) && days >= 3 ? days : 0;
}

export function collectionWorkflow(order: PaymentDelayOrder, hasPendingPayment = false, now = new Date()) {
  if (hasPendingPayment && order.workflow_stage === "esperando_pagamento") return "payment_pending";
  return paymentDelayDays(order, hasPendingPayment, now) > 0 ? "esperando_pagamento" : order.workflow_stage;
}
