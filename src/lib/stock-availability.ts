type Balance = { quantity?: unknown; reserved?: unknown } | null | undefined;
type Revision =
  | {
      sourceOrderId?: string;
      sourceStockState?: string | null;
      warehouseId?: string | null;
      lines: { item_id: string | null; quantity: number }[];
    }
  | null
  | undefined;

/** Cancellation of the previous version releases its stock inside the save transaction. */
export function stockAvailableForRevision(
  balance: Balance,
  warehouseId: string,
  itemId: string,
  revision: Revision,
) {
  const reusable =
    revision?.sourceOrderId &&
    revision.warehouseId === warehouseId &&
    ["reservado", "baixado"].includes(revision.sourceStockState ?? "")
      ? revision.lines.reduce(
          (sum, line) => sum + (line.item_id === itemId ? Number(line.quantity) : 0),
          0,
        )
      : 0;
  return Number(balance?.quantity ?? 0) - Number(balance?.reserved ?? 0) + reusable;
}
