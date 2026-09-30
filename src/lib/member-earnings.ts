/* eslint-disable @typescript-eslint/no-explicit-any */
import { convertFinancialAmount } from "./financial-exchange";
export function memberEarnings(data: any, convert: any, productId = "todos") {
  const rows = new Map<string, any>();
  const row = (id: string) => {
    if (!rows.has(id))
      rows.set(id, {
        userId: id,
        sales: 0,
        received: 0,
        commission: 0,
        released: 0,
        bonus: 0,
        withdrawn: 0,
        details: [],
      });
    return rows.get(id);
  };
  const scoped = (r: any) => productId === "todos" || r.product_id === productId;
  const usd = (r: any) => convertFinancialAmount(r, "USD", convert);
  for (const o of data.orders ?? []) {
    if (
      !o.seller_id ||
      !scoped(o) ||
      o.kind !== "venda" ||
      o.deleted_at ||
      o.superseded_at ||
      ["cancelado", "rascunho", "solicitacao_catalogo"].includes(o.workflow_stage) ||
      o.status === "cancelado"
    )
      continue;
    const factor =
      o.currency === "USD"
        ? 1
        : Number(o.exchange_rates_snapshot?.USD) || convert(1, o.currency, "USD") || 0;
    const total = Math.max(0, Number(o.total || 0));
    const paid = (data.payments ?? [])
      .filter(
        (p: any) =>
          p.order_id === o.id &&
          p.status === "pago" &&
          new Date(p.paid_at ?? p.created_at) <= new Date(),
      )
      .reduce((n: number, p: any) => n + convertFinancialAmount(p, o.currency, convert), 0);
    const ratio = total > 0 ? Math.min(1, Math.max(0, paid / total)) : 0;
    const commission = Math.max(0, Number(o.commission_total || 0)) * factor;
    const r = row(o.seller_id);
    r.sales += total * factor;
    r.received += Math.min(total, Math.max(0, paid)) * factor;
    r.commission += commission;
    r.released += commission * ratio;
    r.details.push({
      number:
        o.number == null
          ? o.id
          : `#${String(o.number).padStart(2, "0")}${o.revision ? `.${o.revision}` : ""}`,
      date: o.order_date ?? o.created_at,
      sales: total * factor,
      received: Math.min(total, Math.max(0, paid)) * factor,
      commission,
      released: commission * ratio,
    });
  }
  for (const b of data.awards ?? []) {
    if (!b.user_id || !scoped(b) || b.status === "cancelado") continue;
    const r = row(b.user_id);
    r.bonus += usd(b);
    if (b.status === "pago") r.withdrawn += usd(b);
  }
  for (const p of data.payroll ?? []) {
    if (
      p.user_id &&
      scoped(p) &&
      p.status === "pago" &&
      ["commission", "comissao", "bonus", "bonificacao"].includes(p.entry_type)
    )
      row(p.user_id).withdrawn += usd(p);
  }
  return [...rows.values()].map((r) => ({
    ...r,
    available: Math.max(0, r.released + r.bonus - r.withdrawn),
    deficit: Math.max(0, r.withdrawn - r.released - r.bonus),
  }));
}
