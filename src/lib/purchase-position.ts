/* eslint-disable @typescript-eslint/no-explicit-any */
export function isConsolidatedPurchase(purchase: any) {
  return (
    purchase.status === "cancelada" &&
    /Consolidada sem novo custo na compra de lote/i.test(purchase.notes ?? "")
  );
}
export function purchasePosition(purchase: any, receipts: any[]) {
  if (purchase.status === "cancelada") return { committed: 0, debt: 0, products: [] };
  const items = purchase.purchase_order_items ?? [];
  const merchandise =
    Number(purchase.merchandise_total) ||
    items.reduce((s: number, i: any) => s + Number(i.total || 0), 0);
  const products = items.map((item: any) => {
    const receipt = receipts.find((r) => r.purchase_item_id === item.id);
    const issued = receipt
      ? receipt.stock_lot_movements.reduce((sum: number, movement: any) => {
          const order = movement.orders;
          return !order ||
            order.deleted_at ||
            order.superseded_at ||
            order.status === "cancelado" ||
            ["cancelado", "rascunho"].includes(order.workflow_stage)
            ? sum
            : sum + Number(movement.quantity || 0);
        }, 0)
      : purchase.source_type === "sales_order"
        ? Number(item.quantity || 0)
        : 0;
    const quantity = Math.min(Number(item.quantity || 0), Math.max(0, issued));
    const ratio = quantity / Math.max(1, Number(receipt?.quantity ?? item.quantity));
    return {
      itemId: item.item_id,
      description: item.description,
      quantity,
      cost: Number(item.total || 0) * ratio,
    };
  });
  const committed =
    merchandise > 0
      ? Math.min(
          Number(purchase.total),
          (products.reduce((s: number, p: any) => s + p.cost, 0) * Number(purchase.total)) /
            merchandise,
        )
      : 0;
  const debt = Math.max(0, committed - Number(purchase.amount_paid || 0));
  return { committed, debt, products };
}
