import { describe, it, expect } from "vitest";
import { memberEarnings } from "./member-earnings";
const convert = (n: number, from: string, to: string) =>
  (n * ({ USD: 1, BRL: 0.2, PYG: 0.000125 }[from as "USD"] ?? 1)) /
  ({ USD: 1, BRL: 0.2, PYG: 0.000125 }[to as "USD"] ?? 1);
const order = {
  id: "o",
  seller_id: "s",
  kind: "venda",
  total: 1000,
  commission_total: 100,
  currency: "USD",
  product_id: "a",
  workflow_stage: "em_caminho",
};
const pay = { order_id: "o", amount: 100, status: "pago", currency: "USD", paid_at: "2026-09-01" };
describe("member earnings", () => {
  it("releases partial commission and subtracts withdrawals, then grows on new payment", () => {
    const data = {
      orders: [order],
      payments: [pay],
      payroll: [
        {
          user_id: "s",
          amount: 2,
          currency: "USD",
          entry_type: "commission",
          status: "pago",
          product_id: "a",
        },
      ],
    };
    expect(memberEarnings(data, convert)[0]).toMatchObject({
      commission: 100,
      released: 10,
      withdrawn: 2,
      available: 8,
    });
    data.payments.push({ ...pay, amount: 900 });
    expect(memberEarnings(data, convert)[0].available).toBe(98);
  });
  it("excludes drafts cancelled and superseded orders", () => {
    expect(
      memberEarnings(
        {
          orders: [
            { ...order, workflow_stage: "rascunho" },
            { ...order, status: "cancelado" },
            { ...order, superseded_at: "x" },
          ],
        },
        convert,
      ),
    ).toEqual([]);
  });
  it("caps overpayments and releases bonuses even without sales", () => {
    const r = memberEarnings(
      {
        orders: [order],
        payments: [{ ...pay, amount: 1200 }],
        awards: [{ user_id: "s", amount: 50, currency: "USD", status: "pendente" }],
      },
      convert,
    )[0];
    expect(r.released).toBe(100);
    expect(r.available).toBe(150);
  });
  it("uses frozen payment conversions and preserves category scope", () => {
    const r = memberEarnings(
      {
        orders: [{ ...order, currency: "BRL", exchange_rates_snapshot: { USD: 0.2 } }],
        payments: [{ ...pay, amount: 40, settled_amount_brl: 100 }],
        awards: [{ user_id: "s", product_id: "b", amount: 50, currency: "USD" }],
      },
      convert,
      "a",
    )[0];
    expect(r.released).toBe(2);
    expect(r.bonus).toBe(0);
  });
  it("counts paid awards as previously withdrawn and reports deficits", () => {
    const r = memberEarnings(
      {
        awards: [{ user_id: "s", amount: 10, currency: "USD", status: "pago" }],
        payroll: [
          { user_id: "s", amount: 2, currency: "USD", entry_type: "commission", status: "pago" },
        ],
      },
      convert,
    )[0];
    expect(r.available).toBe(0);
    expect(r.deficit).toBe(2);
  });
});
