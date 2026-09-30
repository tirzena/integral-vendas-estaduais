/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import type { Currency } from "@/lib/format";
import type { OrderExchange } from "@/lib/order-exchange";
import { parseDecimal } from "@/lib/decimal";

export type SaleKind = "venda" | "orcamento" | "pre_pedido";

export const KIND_LABEL: Record<SaleKind, string> = {
  venda: "Venda",
  orcamento: "Orçamento",
  pre_pedido: "Pré-pedido",
};

export const PAYMENT_METHODS = [
  "Dinheiro",
  "PIX",
  "Cartão de débito",
  "Cartão de crédito à vista",
  "Cartão de crédito parcelado",
  "Transferência",
  "Boleto",
  "Crediário",
];

export type SaleItemInput = {
  item_id: string | null;
  description: string;
  sku: string | null;
  barcode: string | null;
  unit: string | null;
  quantity: number;
  unit_price: number;
  discount: number;
  commission_enabled?: boolean;
  commission_percent?: number;
  max_discount_percent?: number;
};

export type PaymentInput = {
  received_amount?: number;
  received_currency?: Currency;
  method: string;
  installment: number | null;
  amount: number;
  paid_at?: string | null;
};
export type PrintAudience = "customer" | "internal";

export const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Converte texto para número aceitando vírgula decimal e agrupamento. */
export function toNumber(value: string | number | null | undefined) {
  const parsed = parseDecimal(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const normalize = (v: any) =>
  String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export type SearchMode = "palavras" | "exato" | "barras";

/** Busca por palavras em qualquer ordem, exata, SKU ou código de barras. */
export function matchItem(item: any, term: string, mode: SearchMode) {
  const t = normalize(term).trim();
  if (!t) return true;
  const name = normalize([item.name, item.variation, item.brand].filter(Boolean).join(" "));
  const sku = normalize(item.sku);
  const barcode = normalize(item.barcode);
  if (mode === "barras") return barcode === t || barcode.includes(t);
  if (mode === "exato") return name === t || sku === t || barcode === t;
  if (sku === t || barcode === t) return true;
  const words = t.split(/\s+/).filter(Boolean);
  const haystack = `${name} ${sku} ${barcode}`;
  return words.every((w) => haystack.includes(w));
}

/** Aceita "2*CODIGO" ou "2xCODIGO" e devolve quantidade + código. */
export function parseQuantityCode(raw: string): { quantity: number; code: string } {
  const m = raw.trim().match(/^(\d+(?:[.,]\d+)?)\s*[*x]\s*(.+)$/i);
  if (!m) return { quantity: 1, code: raw.trim() };
  return { quantity: toNumber(m[1]!) || 1, code: m[2]!.trim() };
}

/** Desconto por valor ou percentual, sempre devolvido em valor. */
export function discountValue(base: number, amount: number, kind: "valor" | "percent") {
  if (kind === "percent") return round2((base * (Number(amount) || 0)) / 100);
  return round2(Number(amount) || 0);
}

async function rpc(fn: string, args: Record<string, any>) {
  const { data, error } = await (supabase as any).rpc(fn, args);
  if (error) throw new Error(error.message ?? "Não foi possível concluir a operação.");
  return data as any;
}

function orderExchangeRpc(
  exchange: OrderExchange | null | undefined,
  name: string,
  args: Record<string, unknown>,
) {
  if (!exchange) return rpc(name, args);
  return rpc("sales_with_order_exchange", { p_rpc: name, p_args: args, p_exchange: exchange });
}

export function createSalesDocument(input: {
  exchange?: OrderExchange | null;
  kind: SaleKind;
  customerId: string | null;
  productId: string | null;
  currency: Currency;
  discount: number;
  notes: string | null;
  paymentMethod: string | null;
  paymentInstallments: string | null;
  validUntil: string | null;
  whatsapp: string | null;
  origin: string;
  items: SaleItemInput[];
  payments: PaymentInput[];
}) {
  return rpc("sales_create_document", {
    p_kind: input.kind,
    p_customer_id: input.customerId,
    p_product_id: input.productId,
    p_currency: input.currency,
    p_discount: round2(input.discount),
    p_notes: input.notes,
    p_payment_method: input.paymentMethod,
    p_payment_installments: input.paymentInstallments,
    p_valid_until: input.validUntil || null,
    p_whatsapp: input.whatsapp,
    p_origin: input.origin,
    p_items: input.items,
    p_payments: input.payments,
  });
}

export function createOrderDocument(input: {
  exchange?: OrderExchange | null;
  kind: Exclude<SaleKind, "orcamento">;
  customerId: string | null;
  productId: string | null;
  currency: Currency;
  discount: number;
  shippingCost: number;
  shippingPercentage: number | null;
  notes: string | null;
  paymentMethod: string | null;
  paymentInstallments: string | null;
  whatsapp: string | null;
  origin: string;
  items: SaleItemInput[];
  payments: PaymentInput[];
}) {
  return rpc("sales_create_document_v2", {
    p_kind: input.kind,
    p_customer_id: input.customerId,
    p_product_id: input.productId,
    p_currency: input.currency,
    p_discount: round2(input.discount),
    p_shipping_cost: round2(input.shippingCost),
    p_shipping_percentage: input.shippingPercentage,
    p_notes: input.notes,
    p_payment_method: input.paymentMethod,
    p_payment_installments: input.paymentInstallments,
    p_valid_until: null,
    p_whatsapp: input.whatsapp,
    p_origin: input.origin,
    p_items: input.items,
    p_payments: input.payments,
  });
}

export const getCustomerCredit = (customerId: string) =>
  rpc("customer_credit_balance", { p_customer_id: customerId }) as Promise<
    { currency: Currency; balance: number }[]
  >;

export const applyCustomerCredit = (orderId: string, amount: number) =>
  rpc("customer_credit_apply", { p_order_id: orderId, p_amount: round2(amount) });

export const issueCustomerCredit = (input: {
  customerId: string;
  currency: Currency;
  amount: number;
  kind: "deposit" | "short_delivery";
  note: string;
  orderItemId?: string | null;
  shortQuantity?: number | null;
}) => rpc("customer_credit_issue", {
  p_customer_id: input.customerId,
  p_currency: input.currency,
  p_amount: round2(input.amount),
  p_kind: input.kind,
  p_note: input.note,
  p_order_item_id: input.orderItemId ?? null,
  p_short_quantity: input.shortQuantity ?? null,
});

export const reverseCustomerCredit = (entryId: string, reason: string) =>
  rpc("customer_credit_reverse", { p_entry_id: entryId, p_reason: reason });

export function createOrderWithCredit(
  input: Parameters<typeof createOrderDocument>[0],
  creditAmount: number,
  logistics: { warehouseId: string; address: string; city: string; state: string },
) {
  return rpc("customer_credit_create_order", {
    p_credit_amount: round2(creditAmount),
    p_args: {
      p_customer_id: input.customerId,
      p_product_id: input.productId,
      p_currency: input.currency,
      p_discount: round2(input.discount),
      p_shipping_cost: round2(input.shippingCost),
      p_shipping_percentage: input.shippingPercentage,
      p_notes: input.notes,
      p_payment_installments: input.paymentInstallments,
      p_whatsapp: input.whatsapp,
      p_items: input.items,
      p_payments: [],
      p_warehouse_id: logistics.warehouseId,
      p_shipping_address: logistics.address,
      p_shipping_city: logistics.city,
      p_shipping_state: logistics.state,
    },
  });
}

export function createOrderWithOptionalCredit(
  input: Parameters<typeof createOrderDocument>[0],
  creditAmount: number,
  logistics: { warehouseId: string; address: string; city: string; state: string },
) {
  return creditAmount > 0
    ? createOrderWithCredit(input, creditAmount, logistics)
    : createOrderDocument(input);
}

export const assignOrderSeller = (orderId: string, sellerId: string) =>
  rpc("sales_assign_order_seller", { p_order_id: orderId, p_seller_id: sellerId });

export const registerOrderRevision = (previousOrderId: string, newOrderId: string, note: string) =>
  rpc("sales_register_revision", {
    p_previous_order_id: previousOrderId,
    p_new_order_id: newOrderId,
    p_note: note,
  });

export function replaceOrderVersion(input: {
  exchange?: OrderExchange | null;
  previousOrderId: string;
  customerId: string | null;
  productId: string | null;
  currency: Currency;
  discount: number;
  shippingCost: number;
  shippingPercentage: number | null;
  notes: string | null;
  whatsapp: string | null;
  items: SaleItemInput[];
  warehouseId: string;
  shippingAddress: string;
  shippingCity: string;
  shippingState: string;
  deliveryDeadline: string | null;
  carrier: string;
  trackingCode: string;
  revisionNote: string;
}) {
  return rpc("sales_replace_order_version", {
    p_previous_order_id: input.previousOrderId,
    p_customer_id: input.customerId,
    p_product_id: input.productId,
    p_currency: input.currency,
    p_discount: round2(input.discount),
    p_shipping_cost: round2(input.shippingCost),
    p_shipping_percentage: input.shippingPercentage,
    p_notes: input.notes,
    p_whatsapp: input.whatsapp,
    p_items: input.items,
    p_warehouse_id: input.warehouseId,
    p_shipping_address: input.shippingAddress,
    p_shipping_city: input.shippingCity,
    p_shipping_state: input.shippingState,
    p_delivery_deadline: input.deliveryDeadline,
    p_carrier: input.carrier,
    p_tracking_code: input.trackingCode,
    p_revision_note: input.revisionNote,
  });
}

export const registerOrderPayment = (
  orderId: string,
  amount: number,
  method: string,
  proofId: string | null,
) =>
  rpc("sales_register_payment", {
    p_order_id: orderId,
    p_amount: round2(amount),
    p_method: method,
    p_proof_id: proofId,
  });

export const registerPaymentReceived = (
  orderId: string,
  amount: number,
  method: string,
  proofId: string | null,
  exchange?: OrderExchange | null,
) => {
  const p_args = { order_id: orderId, amount: round2(amount), method, proof_id: proofId };
  return exchange
    ? rpc("sales_payment_received_manual", { p_args, p_exchange: exchange })
    : rpc("sales_payment_received", { p_args, p_edit: false });
};
export const registerPaymentWithCustomerCredit = (
  orderId: string,
  receivedAmount: number,
  method: string,
  proofId: string | null,
  exchange?: OrderExchange | null,
) => rpc("customer_credit_receive_overpayment", {
  p_order_id: orderId,
  p_received_amount: round2(receivedAmount),
  p_method: method,
  p_proof_id: proofId,
  p_exchange: exchange ?? null,
});
export const editPaymentReceived = (
  orderId: string,
  paymentId: string,
  amount: number,
  method: string,
  proofId: string | null,
  reason: string,
) =>
  rpc("sales_payment_received", {
    p_args: {
      order_id: orderId,
      payment_id: paymentId,
      amount: round2(amount),
      method,
      proof_id: proofId,
      reason,
    },
    p_edit: true,
  });

export const updateOrderDates = (
  orderId: string,
  orderDate: string | null,
  deliveryDeadline: string | null,
  deliveredAt: string | null,
  shippingCountry: string | null,
) =>
  rpc("sales_update_order_dates", {
    p_order_id: orderId,
    p_order_date: orderDate || null,
    p_delivery_deadline: deliveryDeadline || null,
    p_delivered_at: deliveredAt || null,
    p_shipping_country: shippingCountry || null,
  });

export const updateOrderAddressNumber = (orderId: string, number: string | null) =>
  rpc("sales_update_order_address_number", {
    p_order_id: orderId,
    p_number: number || null,
  });

export const updatePaymentDate = (orderId: string, paymentId: string, paidAt: string | null) =>
  rpc("sales_update_payment_date", {
    p_order_id: orderId,
    p_payment_id: paymentId,
    p_paid_at: paidAt || null,
  });

export const preserveRevisionNumber = (orderId: string) =>
  rpc("sales_preserve_revision_number", { p_order_id: orderId });

export const editOrderPayment = (
  orderId: string,
  paymentId: string,
  amount: number,
  method: string,
  proofId: string | null,
  reason: string,
) =>
  rpc("sales_edit_order_payment", {
    p_order_id: orderId,
    p_payment_id: paymentId,
    p_amount: round2(amount),
    p_method: method,
    p_proof_id: proofId,
    p_reason: reason,
  });

export const cancelOrderPayment = (orderId: string, paymentId: string, reason: string) =>
  rpc("sales_cancel_order_payment", {
    p_order_id: orderId,
    p_payment_id: paymentId,
    p_reason: reason,
  });

export const convertQuote = (quoteId: string, kind: SaleKind, payments: PaymentInput[]) =>
  rpc("sales_convert_quote", { p_quote_id: quoteId, p_kind: kind, p_payments: payments });

export const invoicePreorder = (orderId: string, payments: PaymentInput[]) =>
  rpc("sales_invoice_preorder", { p_order_id: orderId, p_payments: payments });

export const cancelOrder = (orderId: string, reason: string) =>
  rpc("sales_cancel_order", { p_order_id: orderId, p_reason: reason });

export const setCancelReturnWarehouse = (orderId: string, warehouseId: string) =>
  rpc("sales_set_cancel_return_warehouse", {
    p_order_id: orderId,
    p_warehouse_id: warehouseId,
  });

export const cancelQuote = (quoteId: string, reason: string) =>
  rpc("sales_cancel_quote", { p_quote_id: quoteId, p_reason: reason });

export const setOrderStage = (orderId: string, stage: string) =>
  stage === "perdido"
    ? rpc("sales_mark_order_lost", { p_order_id: orderId })
    : rpc("sales_set_stage", { p_order_id: orderId, p_stage: stage });

export const updateOrderLogistics = (
  orderId: string,
  warehouseId: string | null,
  address: string,
  city: string,
  state: string,
) =>
  rpc("sales_update_order_logistics", {
    p_order_id: orderId,
    p_warehouse_id: warehouseId,
    p_address: address,
    p_city: city,
    p_state: state,
  });

export const updateOrderDelivery = (
  orderId: string,
  deadline: string | null,
  carrier: string,
  trackingCode: string,
) =>
  rpc("sales_update_order_delivery", {
    p_order_id: orderId,
    p_deadline: deadline || null,
    p_carrier: carrier,
    p_tracking_code: trackingCode,
  });

export function whatsappLink(phone: string | null | undefined, text: string) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  const base = digits ? `https://wa.me/${digits}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(text)}`;
}

export function documentCode(kind: SaleKind, number: number | null | undefined) {
  const prefix = kind === "orcamento" ? "ORC" : kind === "pre_pedido" ? "PRE" : "VEN";
  return `${prefix}-${String(number ?? 0).padStart(4, "0")}`;
}

/** Identificação curta e sequencial usada nas telas operacionais de pedidos. */
export function orderNumber(number: number | null | undefined, revision?: number | null) {
  const base = `#${String(number ?? 0).padStart(2, "0")}`;
  return revision && revision > 1 ? `${base}.${revision - 1}` : base;
}

export type PrintFormat = "58" | "80" | "A4";

export type PrintDoc = {
  kind: SaleKind;
  number: number | null;
  createdAt?: string | null;
  currency: Currency;
  gross: number;
  discount: number;
  shippingCost?: number;
  variableCost?: number;
  merchandiseCost?: number;
  totalCostBrl?: number;
  totalCostUsd?: number;
  grossMargin?: number;
  total: number;
  seller?: string | null;
  customer?: { name?: string | null; document?: string | null; phone?: string | null } | null;
  company?: any;
  notes?: string | null;
  status?: string | null;
  revision?: number | null;
  origin?: string | null;
  paid?: number;
  receivable?: number;
  paymentStatus?: string | null;
  recipient?: string | null;
  warehouse?: {
    name?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
  } | null;
  shipping?: { address?: string | null; city?: string | null; state?: string | null } | null;
  deliveryDeadline?: string | null;
  carrier?: string | null;
  trackingCode?: string | null;
  creationExchange?: string | null;
  proofCount?: number;
  payments?: PaymentInput[];
  registeredPayments?: {
    method: string;
    amount: number;
    received_amount?: number;
    received_currency?: Currency;
    date?: string | null;
    exchange?: string | null;
  }[];
  /** Total convertido para as moedas do sistema (BRL, USD, PYG). */
  conversions?: { currency: Currency; total: number }[];
  lines: {
    description: string;
    sku?: string | null;
    barcode?: string | null;
    quantity: number;
    unit_price: number;
    discount: number;
    unit_cost?: number | null;
  }[];
};

const esc = (v: any) =>
  String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
const field = (v: any) =>
  v === null || v === undefined || String(v).trim() === ""
    ? '<span class="pend">a preencher</span>'
    : esc(v);

/** Impressão em bobina 58mm, 80mm ou folha A4. */
export function printSalesDocument(
  doc: PrintDoc,
  format: PrintFormat,
  audience: PrintAudience = "customer",
) {
  const cur = doc.currency;
  const code = documentCode(doc.kind, doc.number);
  const co = doc.company ?? {};
  const coupon = format !== "A4";
  const internal = audience === "internal";
  const width = format === "58" ? "58mm" : "80mm";
  const conv = (doc.conversions ?? []).filter((c) => Number.isFinite(c.total));
  const currencyRates = new Map<Currency, number>([[cur, 1]]);
  if (doc.total) {
    conv.forEach((item) => currencyRates.set(item.currency, item.total / doc.total));
  }
  const allMoney = (amount: number, source: Currency = cur) =>
    (["BRL", "USD", "PYG"] as Currency[])
      .map((target) => {
        const sourceRate = currencyRates.get(source);
        const targetRate = currencyRates.get(target);
        return sourceRate && targetRate
          ? formatMoney((amount / sourceRate) * targetRate, target)
          : target === source
            ? formatMoney(amount, source)
            : `${target}: —`;
      })
      .join(" · ");

  const rows = doc.lines
    .map((l, i) =>
      coupon
        ? `<div class="ln"><div class="d">${i + 1}. ${esc(l.description)}</div>
           <div class="v"><span>${formatNumber(l.quantity, 3)} x ${allMoney(l.unit_price)}</span>
           <span>${allMoney(l.quantity * l.unit_price - l.discount)}</span></div>${internal ? `<div class="v muted"><span>Custo por unidade: ${l.unit_cost == null ? "Não cadastrado" : allMoney(l.unit_cost)}</span><span>Custo do produto: ${l.unit_cost == null ? "—" : allMoney(l.unit_cost * l.quantity)}</span></div>` : ""}</div>`
        : `<tr><td>${i + 1}</td><td><strong>${esc(l.description)}</strong>${
            l.barcode || l.sku ? `<br/><span class="muted">${esc(l.barcode ?? l.sku)}</span>` : ""
          }</td><td class="r">${formatNumber(l.quantity, 3)}</td><td class="r">${allMoney(l.unit_price)}</td><td class="r">${allMoney(l.discount)}</td><td class="r">${allMoney(l.quantity * l.unit_price - l.discount)}</td>${internal ? `<td class="r">${l.unit_cost == null ? "—" : allMoney(l.unit_cost)}</td><td class="r">${l.unit_cost == null ? "—" : allMoney(l.unit_cost * l.quantity)}</td>` : ""}</tr>`,
    )
    .join("");

  const pays = (doc.payments ?? [])
    .map(
      (p) =>
        `<div class="v"><span>${esc(p.method)}${p.installment ? ` ${p.installment}x` : ""}</span><span>${p.received_currency ? esc(formatMoney(p.received_amount ?? p.amount, p.received_currency)) : allMoney(p.amount)}</span></div>`,
    )
    .join("");
  const registeredPays = (doc.registeredPayments ?? [])
    .map(
      (payment, index) =>
        `<tr><td>${index + 1}</td><td>${field(payment.date ? formatDateTime(payment.date) : null)}</td><td>${field(payment.method)}</td><td class="r">${payment.received_currency ? esc(formatMoney(payment.received_amount ?? payment.amount, payment.received_currency)) : allMoney(payment.amount)}</td><td>${field(payment.exchange)}</td></tr>`,
    )
    .join("");

  const convCoupon = conv.length
    ? `<hr/><div class="c muted">Total nas moedas do sistema</div>${conv
        .map(
          (c) =>
            `<div class="v"><span>${c.currency}</span><span>${formatMoney(c.total, c.currency)}</span></div>`,
        )
        .join("")}`
    : "";
  const convA4 = conv.length
    ? `<div class="tot muted">${conv
        .map((c) => `${c.currency}: ${formatMoney(c.total, c.currency)}`)
        .join(" &nbsp;·&nbsp; ")}</div>`
    : "";

  const css = coupon
    ? `@page{size:${width} auto;margin:3mm}
       body{font-family:ui-monospace,monospace;font-size:11px;width:${width};margin:0;color:#000}
       h1{font-size:13px;text-align:center;margin:0 0 4px}
       .c{text-align:center}.muted{color:#444}
       .v{display:flex;justify-content:space-between;gap:6px}
       .ln{border-bottom:1px dashed #bbb;padding:3px 0}
       .tot{font-size:13px;font-weight:700;border-top:1px solid #000;margin-top:6px;padding-top:4px}
       .pend{font-style:italic}`
    : `@page{size:A4;margin:16mm}
       body{font-family:system-ui,-apple-system,sans-serif;color:#111;font-size:12px;margin:0}
       .head{display:flex;gap:20px;border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:14px}
       .brand-name{font-size:22px;font-weight:800}.co{flex:1;line-height:1.5}
       .meta{width:190px;text-align:right;line-height:1.5}
       .client{border:1px solid #ddd;border-radius:6px;padding:10px;margin-bottom:12px;line-height:1.6}
       table{width:100%;border-collapse:collapse}
       th,td{border-bottom:1px solid #e5e5e5;padding:6px 8px;text-align:left}
       .r{text-align:right}.muted{color:#777}
       .tot{margin-top:12px;text-align:right;font-size:14px}
       .section{margin-top:14px}.section-title{font-size:13px;font-weight:800;background:#f3f4f6;padding:7px 8px;border-radius:5px}
       .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px 18px;border:1px solid #ddd;border-radius:6px;padding:10px;margin-top:7px}
       .label{display:block;color:#777;font-size:10px;text-transform:uppercase;letter-spacing:.03em}
       .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px}.summary>div{border:1px solid #ddd;border-radius:6px;padding:8px;text-align:right}
       .foot{margin-top:18px;border-top:1px solid #ddd;padding-top:8px;font-size:10px;color:#666}
       .pend{color:#b45309;background:#fef3c7;padding:0 4px;border-radius:3px;font-style:italic}`;

  const body = coupon
    ? `<h1>${field(co.brand_name ?? "OS")}</h1>
       <div class="c muted">${field(co.document)}</div>
       <div class="c muted">${field(co.phone)}</div>
       <div class="c" style="margin:6px 0"><strong>${KIND_LABEL[doc.kind]} ${code}</strong></div>
       <div class="muted">${formatDate(doc.createdAt ?? new Date().toISOString())}</div>
       <div class="muted">Cliente: ${esc(doc.customer?.name ?? "Consumidor final")}</div>
       <div class="muted">Destinatário: ${field(doc.recipient)}</div>
       <div class="muted">Situação: ${field(doc.status)} · revisão ${field(doc.revision ?? 1)}</div>
       ${internal ? `<div class="muted">Responsável: ${field(doc.seller)}</div><div class="muted">Retirada: ${field([doc.warehouse?.name, doc.warehouse?.address, doc.warehouse?.city, doc.warehouse?.state].filter(Boolean).join(" · "))}</div>` : ""}
       <div class="muted">Entrega: ${field([doc.shipping?.address, doc.shipping?.city, doc.shipping?.state].filter(Boolean).join(" · "))}</div>
       <div class="muted">Previsão: ${field(doc.deliveryDeadline ? formatDate(doc.deliveryDeadline) : null)}</div>
       <div class="muted">Transportadora: ${field(doc.carrier)}</div>
       <div class="muted">Rastreio: ${field(doc.trackingCode)}</div>
       <hr/>${rows}
       <div class="v"><span>Subtotal</span><span>${allMoney(doc.gross)}</span></div>
       <div class="v"><span>Desconto</span><span>${allMoney(doc.discount)}</span></div>
       <div class="v"><span>Frete</span><span>${allMoney(doc.shippingCost ?? 0)}</span></div>
       ${internal && doc.variableCost != null ? `<div class="v"><span>Custos variáveis</span><span>${allMoney(doc.variableCost)}</span></div>` : ""}
       ${internal && doc.merchandiseCost != null ? `<div class="v"><span>Custo dos produtos</span><span>${allMoney(doc.merchandiseCost)}</span></div>` : ""}
       ${internal && doc.grossMargin != null ? `<div class="v"><span>Lucro bruto</span><span>${allMoney(doc.grossMargin)}</span></div>` : ""}
       <div class="v tot"><span>Total</span><span>${allMoney(doc.total)}</span></div>
       <div class="v"><span>Pago</span><span>${allMoney(doc.paid ?? 0)}</span></div>
       <div class="v"><span>A receber</span><span>${allMoney(doc.receivable ?? doc.total)}</span></div>
       ${convCoupon}
       ${pays ? `<hr/>${pays}` : ""}
       ${(doc.registeredPayments ?? []).length ? `<hr/><div class="c"><strong>Pagamentos registrados</strong></div>${(doc.registeredPayments ?? []).map((payment, index) => `<div class="ln"><div>${index + 1}. ${field(payment.method)} · ${field(payment.date ? formatDateTime(payment.date) : null)}</div><div class="v"><span>${field(payment.exchange)}</span><span>${payment.received_currency ? esc(formatMoney(payment.received_amount ?? payment.amount, payment.received_currency)) : allMoney(payment.amount)}</span></div></div>`).join("")}` : ""}
       ${doc.creationExchange ? `<hr/><div class="muted">Cotação do pedido: ${field(doc.creationExchange)}</div>` : ""}
       ${internal ? `<div class="muted">Comprovantes registrados: ${formatNumber(doc.proofCount ?? 0)}</div>` : ""}
       ${doc.notes ? `<hr/><div class="muted">${esc(doc.notes)}</div>` : ""}
       <p class="c muted">Obrigado pela preferência!</p>`
    : `<header class="head">
         <div><div class="brand-name">${field(co.brand_name ?? "OS")}</div>
         <div class="muted">${field(co.tagline)}</div></div>
         <div class="co"><strong>${field(co.legal_name)}</strong><br/>CPF / CNPJ: ${field(co.document)}<br/>
         ${field(co.address)}<br/>${field([co.city, co.state, co.country].filter(Boolean).join(", ") || null)}<br/>
         ${field(co.phone)} ${field(co.email)}</div>
         <div class="meta"><strong>${KIND_LABEL[doc.kind]}</strong><div>${code}</div>
         <div class="muted">Data</div><div>${formatDate(doc.createdAt ?? new Date().toISOString())}</div>
         ${internal ? `<div class="muted">Responsável</div><div>${field(doc.seller)}</div>` : ""}</div>
       </header>
       <div class="client"><div><strong>Cliente:</strong> ${field(doc.customer?.name ?? "Consumidor final")}</div>
       <div><strong>CPF / CNPJ:</strong> ${field(doc.customer?.document)}</div>
       <div><strong>Contato:</strong> ${field(doc.customer?.phone)}</div></div>
       <div class="section"><div class="section-title">Identificação do pedido</div><div class="grid">
       <div><span class="label">Situação</span>${field(doc.status)}</div><div><span class="label">Revisão</span>${field(doc.revision ?? 1)}</div>
       ${internal ? `<div><span class="label">Origem</span>${field(doc.origin)}</div>` : ""}<div><span class="label">Moeda</span>${field(doc.currency)}</div>
       <div><span class="label">Cotação na criação</span>${field(doc.creationExchange)}</div>${internal ? `<div><span class="label">Comprovantes</span>${formatNumber(doc.proofCount ?? 0)}</div>` : ""}
       </div></div>
       <div class="section"><div class="section-title">Retirada e entrega</div><div class="grid">
       ${internal ? `<div><span class="label">Estoque de retirada</span>${field([doc.warehouse?.name, doc.warehouse?.address, doc.warehouse?.city, doc.warehouse?.state].filter(Boolean).join(" · "))}</div>` : ""}
       <div><span class="label">Destinatário</span>${field(doc.recipient)}</div>
       <div><span class="label">Endereço de entrega</span>${field([doc.shipping?.address, doc.shipping?.city, doc.shipping?.state].filter(Boolean).join(" · "))}</div>
       <div><span class="label">Previsão</span>${field(doc.deliveryDeadline ? formatDate(doc.deliveryDeadline) : null)}</div>
       <div><span class="label">Transportadora</span>${field(doc.carrier)}</div><div><span class="label">Código de rastreio</span>${field(doc.trackingCode)}</div>
       </div></div>
       <div class="section"><div class="section-title">Produtos e valores</div>
       <table><thead><tr><th>#</th><th>Descrição</th><th class="r">Qtd.</th><th class="r">Unitário</th><th class="r">Desc.</th><th class="r">Total</th>${internal ? '<th class="r">Custo/un.</th><th class="r">Custo produto</th>' : ""}</tr></thead>
       <tbody>${rows}</tbody></table></div>
       <div class="summary"><div><span class="label">Subtotal</span>${allMoney(doc.gross)}</div><div><span class="label">Desconto</span>${allMoney(doc.discount)}</div><div><span class="label">Frete</span>${allMoney(doc.shippingCost ?? 0)}</div><div><span class="label">Total</span><strong>${allMoney(doc.total)}</strong></div><div><span class="label">Pago</span>${allMoney(doc.paid ?? 0)}</div><div><span class="label">A receber</span>${allMoney(doc.receivable ?? doc.total)}</div>${internal ? `<div><span class="label">Custo dos produtos</span>${doc.merchandiseCost == null ? field(null) : allMoney(doc.merchandiseCost)}</div><div><span class="label">Custos variáveis</span>${doc.variableCost == null ? field(null) : allMoney(doc.variableCost)}</div><div><span class="label">Lucro bruto</span>${doc.grossMargin == null ? field(null) : allMoney(doc.grossMargin)}</div><div><span class="label">Custo registrado em BRL</span>${doc.totalCostBrl == null ? field(null) : allMoney(doc.totalCostBrl, "BRL")}</div><div><span class="label">Custo registrado em USD</span>${doc.totalCostUsd == null ? field(null) : allMoney(doc.totalCostUsd, "USD")}</div><div><span class="label">Pagamento</span>${field(doc.paymentStatus)}</div>` : ""}</div>
       ${convA4}
       ${registeredPays ? `<div class="section"><div class="section-title">Pagamentos registrados</div><table><thead><tr><th>#</th><th>Data e hora</th><th>Forma</th><th class="r">Valor</th><th>Cotação no pagamento</th></tr></thead><tbody>${registeredPays}</tbody></table></div>` : ""}
       ${doc.notes ? `<div class="section"><div class="section-title">Observações</div><p>${esc(doc.notes)}</p></div>` : ""}
       <div class="foot">Documento gerado pelo OS em ${formatDateTime(new Date().toISOString())}. Confira os dados antes do envio.</div>`;

  const win = window.open("", "_blank", "width=900,height=1000");
  if (!win) return false;
  win.document.write(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>${KIND_LABEL[doc.kind]} ${code}</title><style>${css}</style></head><body>${body}</body></html>`,
  );
  win.document.close();
  win.focus();
  win.setTimeout(() => win.print(), 350);
  return true;
}

/** Texto curto do documento para enviar por WhatsApp. */
export function documentMessage(doc: PrintDoc) {
  const rates = new Map<Currency, number>([[doc.currency, 1]]);
  if (doc.total) {
    (doc.conversions ?? []).forEach((item) => rates.set(item.currency, item.total / doc.total));
  }
  const allMoney = (amount: number) =>
    (["BRL", "USD", "PYG"] as Currency[])
      .map((target) => {
        const targetRate = rates.get(target);
        return targetRate
          ? formatMoney(amount * targetRate, target)
          : target === doc.currency
            ? formatMoney(amount, target)
            : `${target}: —`;
      })
      .join(" · ");
  const lines = doc.lines
    .map((l) => `• ${l.description} — ${formatNumber(l.quantity, 3)} x ${allMoney(l.unit_price)}`)
    .join("\n");
  return `${KIND_LABEL[doc.kind]} ${documentCode(doc.kind, doc.number)}\n${lines}\nTotal: ${allMoney(doc.total)}`;
}
