import { describe, it, expect } from "vitest";
import { calculateFinance, type FinanceCashEvent } from "./finance-totals";
const now = new Date("2026-09-30T12:00:00Z");
const convert = (n: number, from: string, to: string) =>
  (n * (({ USD: 1, BRL: 0.2, PYG: 0.000125 } as Record<string, number>)[from] ?? 1)) /
  (({ USD: 1, BRL: 0.2, PYG: 0.000125 } as Record<string, number>)[to] ?? 1);
const order = {
  kind: "venda",
  id: "o",
  product_id: "a",
  seller_id: "s",
  total: 1000,
  currency: "USD",
  merchandise_cost: 500,
  shipping_cost: 100,
  commission_total: 50,
  bonus_amount: 10,
  order_date: "2026-09-01",
  workflow_stage: "em_caminho",
};
const payment = {
  id: "p",
  order_id: "o",
  amount: 400,
  currency: "USD",
  status: "pago",
  paid_at: "2026-09-05",
};
const purchase = {
  id: "buy",
  total: 500,
  currency: "USD",
  status: "confirmada",
  account_payable_id: "ap",
  purchase_date: "2026-09-01",
  purchase_order_items: [{ item_id: "i", quantity: 100, total: 500 }],
};
const data = {
  orders: [order],
  payments: [payment],
  purchases: [purchase],
  purchasePayments: [
    { purchase_order_id: "buy", amount: 100, currency: "USD", paid_at: "2026-09-06" },
  ],
};
describe("Financeiro: parcelas e saldo de fornecedores", () => {
  it("reconhece 40% do custo e lucro, com dívida e pagamento separados", () => {
    const t = calculateFinance(data, null, convert, now);
    expect(t.salesTotal).toBe(1000);
    expect(t.salesPaid).toBe(400);
    expect(t.realCost).toBe(200);
    expect(t.realProfit).toBe(136);
    expect(t.presumedProfit).toBe(340);
    expect(t.purchasesPaid).toBe(100);
    expect(t.payableOpen).toBe(400);
    expect(t.receivableOpen).toBe(600);
    expect(t.netProfit).toBe(300);
    expect(t.purchasedUnits).toBe(100);
  });
  it("não duplica contas a receber e a pagar espelhadas", () => {
    const t = calculateFinance(
      {
        ...data,
        receivable: [{ order_id: "o", amount: 400, status: "pago", paid_at: "2026-09-05" }],
        payable: [{ id: "ap", amount: 100, status: "pago", paid_at: "2026-09-06" }],
      },
      null,
      convert,
      now,
    );
    expect(t.cashIn).toBe(400);
    expect(t.cashOut).toBe(100);
  });
  it("separa datas de emissão e parcelas pagas mais tarde", () => {
    const t = calculateFinance(
      { ...data, payments: [payment, { ...payment, amount: 600, paid_at: "2026-09-20" }] },
      new Date("2026-09-15"),
      convert,
      now,
    );
    expect(t.salesTotal).toBe(0);
    expect(t.salesPaid).toBe(600);
    expect(t.realCost).toBe(300);
    expect(t.realProfit).toBe(204);
    expect(t.receivableOpen).toBe(0);
  });
  it("exclui pedidos cancelados e compras vinculadas a eles", () => {
    const t = calculateFinance(
      {
        ...data,
        orders: [{ ...order, status: "cancelado" }],
        purchases: [{ ...purchase, source_order_id: "o" }],
      },
      null,
      convert,
      now,
    );
    expect(t.salesTotal).toBe(0);
    expect(t.salesPaid).toBe(0);
    expect(t.purchasesPaid).toBe(0);
  });
  it("divide compra com duas categorias proporcionalmente ao custo dos itens", () => {
    const t = calculateFinance(
      {
        ...data,
        productId: "a",
        itemIds: new Set(["i"]),
        purchases: [
          {
            ...purchase,
            total: 1000,
            purchase_order_items: [
              ...purchase.purchase_order_items,
              { item_id: "j", quantity: 50, total: 500 },
            ],
          },
        ],
      },
      null,
      convert,
      now,
    );
    expect(t.purchasesTotal).toBe(500);
    expect(t.purchasesPaid).toBe(50);
    expect(t.purchasedUnits).toBe(100);
    expect(t.payableOpen).toBe(450);
  });
  it("preserva recebimento convertido na data do pagamento", () => {
    const t = calculateFinance(
      {
        ...data,
        payments: [
          {
            ...payment,
            amount: 2000,
            currency: "BRL",
            settled_amount_usd: 420,
            settled_amount_brl: 2000,
          },
        ],
      },
      null,
      convert,
      now,
    );
    expect(t.salesPaid).toBe(420);
    expect(t.realCost).toBe(210);
  });
  it("retiradas reduzem saldo disponível sem alterar lucro", () => {
    const t = calculateFinance(
      {
        ...data,
        withdrawals: [
          { amount_usd: 20, withdrawn_at: "2026-09-10", status: "ativo" },
          { amount_usd: 90, withdrawn_at: "2026-09-12", status: "cancelado" },
        ],
      },
      null,
      convert,
      now,
    );
    expect(t.realProfit).toBe(136);
    expect(t.withdrawals).toBe(20);
    expect(t.cashAvailable).toBe(280);
  });
  it("série de caixa corresponde a entradas e saídas sem duplicações", () => {
    const events: FinanceCashEvent[] = [];
    const t = calculateFinance(data, null, convert, now, events);
    expect(events.filter((e) => e.kind === "in").reduce((n, e) => n + e.amount, 0)).toBe(t.cashIn);
    expect(events.filter((e) => e.kind === "out").reduce((n, e) => n + e.amount, 0)).toBe(
      t.cashOut,
    );
  });
});

describe("confirmed sales logistics", () => {
  it("excludes reserved preorders from sales and their expected revenue", () => {
    const result = calculateFinance(
      { orders: [{ ...order, kind: "pre_pedido", stock_state: "reservado" }], payments: [] },
      null,
      convert,
      now,
    );
    expect(result.salesTotal).toBe(0);
    expect(result.receivableOpen).toBe(0);
  });
  it("uses fulfillment in transit and excludes lost or delivered orders", () => {
    const result = calculateFinance(
      {
        orders: [
          {
            ...order,
            id: "transit",
            workflow_stage: "esperando_pagamento",
            fulfillment_status: "a_caminho",
          },
          { ...order, id: "lost", fulfillment_status: "perdido" },
          { ...order, id: "delivered", delivered_at: "2026-09-10", fulfillment_status: "entregue" },
        ],
      },
      null,
      convert,
      now,
    );
    expect(result.inTransit).toBe(1000);
    expect(result.salesTotal).toBe(3000);
  });
});
