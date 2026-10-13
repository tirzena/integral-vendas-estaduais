/* eslint-disable @typescript-eslint/no-explicit-any */
export async function scopeOrdersByProduct(db: any, query: any, productId: string) {
  if (productId === "todos") return query;
  const { data, error } = await db.rpc("estadual_order_ids_for_product", { p_product_id: productId });
  if (error) throw error;
  const ids = [...new Set((data ?? []).map((row: { id: string }) => row.id))];
  return query.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
}
