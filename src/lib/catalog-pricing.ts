export type CatalogPriceCurrency = "BRL" | "USD" | "PYG";
export type CatalogPriceConverter = (
  value: number,
  from: CatalogPriceCurrency,
  to: CatalogPriceCurrency,
) => number | null;

/** Private price composition. Only the final sale price is exposed publicly. */
export function catalogPriceBreakdown(
  item: any,
  rules: any,
  currency: CatalogPriceCurrency,
  convert: CatalogPriceConverter,
) {
  const custom = rules?.products?.[item.id] ?? {};
  const detailed = rules?.version === 2 || !!rules?.products?.[item.id];
  const has = (value: any) => value != null && value !== "";
  const number = (value: any) => {
    const result = Number(String(value ?? 0).replace(",", "."));
    if (!Number.isFinite(result) || result < 0)
      throw new Error(`Valor inválido para ${item.name}.`);
    return result;
  };
  const converted = (value: number) => {
    const result = convert(value, item.currency ?? "USD", currency);
    if (result == null || !Number.isFinite(result)) throw new Error("Cotação indisponível.");
    return result;
  };
  const cost = has(custom.cost)
    ? number(custom.cost)
    : item.cost == null
      ? null
      : converted(number(item.cost));
  const tax = number(has(custom.tax) ? custom.tax : detailed ? item.tax_percent : 0);
  const extra = has(custom.extra)
    ? number(custom.extra)
    : detailed
      ? converted(number(item.extra_cost))
      : 0;
  const freight = number(has(custom.freight) ? custom.freight : rules?.freight);
  const commission = number(has(custom.commission) ? custom.commission : rules?.commission);
  const markup = number(has(custom.markup) ? custom.markup : rules?.markup);
  const discount = number(has(custom.discount) ? custom.discount : rules?.discount);
  if (discount > 100) throw new Error("Desconto deve estar entre 0 e 100%.");
  const totalCost = cost == null ? null : cost * (1 + (tax + freight + commission) / 100) + extra;
  // Keep existing catalogs' formula; detailed compositions apply markup to total cost.
  const suggested = rules?.enabled
    ? totalCost == null
      ? null
      : detailed
        ? totalCost * (1 + markup / 100) * (1 - discount / 100)
        : cost! * (1 + (freight + commission + markup) / 100) * (1 - discount / 100)
    : converted(number(item.price));
  const manual = rules?.prices?.[item.id];
  const sale = has(manual) ? number(manual) : suggested;
  const roundedSale = sale == null ? null : Math.round(sale * 100) / 100;
  const profit = roundedSale == null || totalCost == null ? null : roundedSale - totalCost;
  return {
    cost,
    tax,
    extra,
    freight,
    commission,
    markup,
    discount,
    totalCost,
    suggested,
    sale: roundedSale,
    profit,
    margin: roundedSale && profit != null ? (profit / roundedSale) * 100 : 0,
  };
}

/** Rebase catalog-specific monetary inputs when changing its settlement currency. */
export function convertCatalogPriceRules(
  rules: any,
  from: CatalogPriceCurrency,
  to: CatalogPriceCurrency,
  convert: CatalogPriceConverter,
) {
  if (!rules || from === to) return rules;
  const amount = (raw: any) => {
    if (raw == null || raw === "") return raw;
    const numeric = Number(String(raw).replace(",", "."));
    const converted = convert(numeric, from, to);
    if (
      !Number.isFinite(numeric) ||
      numeric < 0 ||
      converted == null ||
      !Number.isFinite(converted)
    )
      throw new Error("Confira os valores e a cotação antes de mudar a moeda.");
    return String(Math.round(converted * 100) / 100);
  };
  return {
    ...rules,
    prices: Object.fromEntries(
      Object.entries(rules.prices ?? {}).map(([id, value]) => [id, amount(value)]),
    ),
    products: Object.fromEntries(
      Object.entries(rules.products ?? {}).map(([id, value]) => {
        const product = value as any;
        return [id, { ...product, cost: amount(product.cost), extra: amount(product.extra) }];
      }),
    ),
  };
}
