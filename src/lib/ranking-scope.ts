type Order = { product_id?: string | null; total?: number | null };
type Line = { item_id?: string | null; quantity?: number | null; total?: number | null };

export function rankingOrderScope<T extends Line>(order: Order, lines: T[], productId: string, categories: Map<string, string | null>) {
  if (productId === "todos") return { matches: true, lines, total: Number(order.total ?? 0) };
  const selected = lines.filter(line => {
    const category = line.item_id ? categories.get(line.item_id) : null;
    return category === productId || (!category && order.product_id === productId);
  });
  // Preserve older orders recorded only at category/header level.
  const headerOnly = lines.length === 0 && order.product_id === productId;
  return { matches: selected.length > 0 || headerOnly, lines: selected, total: headerOnly ? Number(order.total ?? 0) : selected.reduce((sum, line) => sum + Number(line.total ?? 0), 0) };
}

export function activeRankingSellerIds(sellers: {user_id: string}[], profiles: {id: string; is_active?: boolean | null}[]) {
  const inactive = new Set(profiles.filter(p => p.is_active === false).map(p => p.id));
  return new Set(sellers.map(s => s.user_id).filter(id => !inactive.has(id)));
}
