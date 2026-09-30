import { describe, it, expect } from "vitest";
import { financeDashboard, paymentProgress } from "./finance-dashboard";
const convert = (n: number, from: string, to: string) =>
  (n * (from === "BRL" ? 0.2 : 1)) / (to === "BRL" ? 0.2 : 1);
const now = new Date("2026-09-20T12:00:00Z");
const order = {
  id: "o",
  number: 1,
  kind: "venda",
  currency: "USD",
  total: 1000,
  order_date: "2026-09-01",
  fulfillment_status: "entregue",
};
const payment = {
  order_id: "o",
  amount: 400,
  currency: "USD",
  status: "pago",
  paid_at: "2026-09-15",
};
const purchase = {
  id: "b",
  number: 1,
  source_order_id: "o",
  total: 500,
  currency: "USD",
  purchase_date: "2026-09-01",
  purchase_order_items: [{ quantity: 100, total: 500 }],
};
describe("Finance dashboard", () => {
  it("moves the entire reservation into settled orders only after full payment", () => {
    const unpaid = financeDashboard(
      { orders: [order], orderItems: [{ order_id: "o", quantity: 100 }] },
      null,
      convert,
      now,
    );
    expect(unpaid.groups.reserved).toEqual({ value: 1000, units: 100, count: 1 });
    expect(unpaid.groups.paidFull).toBeUndefined();
    const settled = financeDashboard(
      {
        orders: [order],
        orderItems: [{ order_id: "o", quantity: 100 }],
        payments: [{ ...payment, amount: 1000 }],
      },
      null,
      convert,
      now,
    );
    expect(settled.groups.reserved).toBeUndefined();
    expect(settled.groups.paidFull).toEqual({ value: 1000, units: 100, count: 1 });
    expect(settled.groups.paidPartial).toBeUndefined();
  });
  it("separates partial delivery, actual payments and equivalent paid units", () => {
    const result = financeDashboard(
      {
        orders: [order],
        orderItems: [{ order_id: "o", quantity: 100 }],
        payments: [payment],
        purchases: [purchase],
        purchasePayments: [
          { purchase_order_id: "b", amount: 200, currency: "USD", paid_at: "2026-09-15" },
        ],
      },
      null,
      convert,
      now,
    );
    expect(result.groups.deliveredPartial.units).toBe(100);
    expect(result.groups.partialIn.value).toBe(400);
    expect(result.groups.reserved).toEqual({ value: 600, units: 60, count: 1 });
    expect(result.groups.paidPartial).toEqual({ value: 400, units: 40, count: 1 });
    expect(result.groups.partialOut.value).toBe(200);
    expect(result.groups.costPaid.units).toBe(40);
    expect(result.orderProgress[0].ratio).toBe(40);
    expect(result.purchaseProgress[0].ratio).toBe(40);
  });
  it("excludes cancellations from sales and linked purchase totals", () => {
    const result = financeDashboard(
      { orders: [{ ...order, status: "cancelado" }], purchases: [purchase] },
      null,
      convert,
      now,
    );
    expect(result.groups.cancelled.value).toBe(1000);
    expect(result.groups.sold).toBeUndefined();
    expect(result.groups.purchased).toBeUndefined();
  });
  it("counts a current partial receipt from an older order without counting its issue again", () => {
    const result = financeDashboard(
      { orders: [order], payments: [payment] },
      new Date("2026-09-10"),
      convert,
      now,
    );
    expect(result.groups.sold).toBeUndefined();
    expect(result.groups.partialIn.value).toBe(400);
  });
  it("keeps lost deliveries out of the delivered groups and clamps progress", () => {
    const result = financeDashboard(
      { orders: [{ ...order, fulfillment_status: "perdido" }], payments: [payment] },
      null,
      convert,
      now,
    );
    expect(result.groups.lost.value).toBe(1000);
    expect(result.groups.deliveredPartial).toBeUndefined();
    expect(paymentProgress(120, 100)).toBe(100);
    expect(paymentProgress(-1, 100)).toBe(0);
    expect(paymentProgress(10, 0)).toBe(0);
  });
  it("uses the recorded exchange rate and sorts documents numerically", () => {
    const r = financeDashboard(
      {
        orders: [
          { ...order, number: 8 },
          {
            ...order,
            id: "second",
            number: 2,
            currency: "BRL",
            total: 500,
            exchange_rates_snapshot: { USD: 0.25 },
          },
        ],
      },
      null,
      convert,
      now,
    );
    expect(r.groups.sold.value).toBe(1125);
    expect(r.orderProgress.map((o) => o.number)).toEqual([2, 8]);
  });
});
