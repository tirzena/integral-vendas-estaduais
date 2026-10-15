import { describe, expect, it } from "vitest";
import { memberEarnings } from "./member-earnings";

const convert = (amount: number, from: string, to: string) =>
  amount * (from === to ? 1 : from === "BRL" ? 0.2 : 5);
const order = {
  id: "sale",
  seller_id: "seller",
  kind: "venda",
  total: 200,
  commission_total: 14,
  currency: "BRL",
  exchange_rates_snapshot: { USD: 0.2 },
};
const payment = {
  order_id: "sale",
  amount: 40,
  currency: "BRL",
  status: "pago",
  paid_at: "2026-01-01",
};

describe("folha com acordo de produto registrado no pedido", () => {
  it("libera apenas a proporção paga e ignora comprovantes pendentes", () => {
    const [row] = memberEarnings(
      { orders: [order], payments: [payment, { ...payment, amount: 160, status: "pendente" }] },
      convert,
    );
    expect(row.commission).toBeCloseTo(2.8);
    expect(row.released).toBeCloseTo(0.56);
    expect(row.available).toBeCloseTo(0.56);
  });
  it("abate retiradas e não soma a comissão da versão anterior", () => {
    const [row] = memberEarnings(
      {
        orders: [order, { ...order, id: "old", superseded_at: "2026-01-01" }],
        payments: [payment],
        payroll: [
          {
            user_id: "seller",
            amount: 0.2,
            currency: "USD",
            entry_type: "commission",
            status: "pago",
          },
        ],
      },
      convert,
    );
    expect(row.commission).toBeCloseTo(2.8);
    expect(row.available).toBeCloseTo(0.36);
    expect(row.details).toHaveLength(1);
  });
  it("libera o restante após a quitação sem ultrapassar o acordo", () => {
    const [row] = memberEarnings(
      { orders: [order], payments: [payment, { ...payment, amount: 200 }] },
      convert,
    );
    expect(row.released).toBeCloseTo(2.8);
    expect(row.available).toBeCloseTo(2.8);
  });
});
