import { describe, it, expect } from "vitest";
import { purchasePosition, isConsolidatedPurchase } from "./purchase-position";
const purchase = {
  status: "confirmada",
  source_type: "manual",
  total: 5000,
  merchandise_total: 5000,
  amount_paid: 0,
  purchase_order_items: [
    { id: "line", item_id: "item", description: "TG", quantity: 5000, total: 5000 },
  ],
};
const receipt = (quantity: number, orders = { status: "faturado", workflow_stage: "faturado" }) => [
  { purchase_item_id: "line", quantity: 5000, stock_lot_movements: [{ quantity, orders }] },
];
describe("Estoque separado do custo faturado", () => {
  it("não transforma lote ainda não vendido em dívida", () =>
    expect(purchasePosition(purchase, []).debt).toBe(0));
  it("cobra somente as unidades faturadas", () =>
    expect(purchasePosition(purchase, receipt(100)).debt).toBe(100));
  it("abate repasses parciais sem cobrar o restante do estoque", () =>
    expect(purchasePosition({ ...purchase, amount_paid: 20 }, receipt(100)).debt).toBe(80));
  it("não gera dívida negativa com pagamento antecipado", () =>
    expect(purchasePosition({ ...purchase, amount_paid: 200 }, receipt(100)).debt).toBe(0));
  it("exclui pedidos cancelados", () =>
    expect(
      purchasePosition(purchase, receipt(100, { status: "cancelado", workflow_stage: "cancelado" }))
        .debt,
    ).toBe(0));
  it("soma saídas e estornos pela origem do lote", () => {
    const receipts = receipt(100);
    receipts[0].stock_lot_movements.push({
      quantity: -30,
      orders: { status: "faturado", workflow_stage: "faturado" },
    });
    expect(purchasePosition(purchase, receipts).debt).toBe(70);
  });
  it("distingue consolidação de cancelamento comum", () => {
    expect(
      isConsolidatedPurchase({
        status: "cancelada",
        notes: "Consolidada sem novo custo na compra de lote OC-28",
      }),
    ).toBe(true);
    expect(isConsolidatedPurchase({ status: "cancelada", notes: "Cancelada pelo cliente" })).toBe(
      false,
    );
  });
});
