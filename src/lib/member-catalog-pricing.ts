export function memberCatalogSalePrice(
  item: {
    name: string;
    price: number | string | null;
    price_currency?: string | null;
    currency?: string | null;
  },
  target: string,
  rates: Record<string, number>,
): number {
  const price = Number(item.price);
  if (item.price == null || !Number.isFinite(price) || price <= 0)
    throw new Error(item.name + ": valor sob consulta.");
  const source = item.price_currency ?? item.currency ?? "USD";
  const rate = source === target ? 1 : rates[source + "-" + target];
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0)
    throw new Error("Cotação indisponível.");
  return Math.round(price * rate * 100) / 100;
}
