export type CatalogAudience = "vendedor" | "cliente";

export function catalogAudience(value: unknown): CatalogAudience {
  return value === "cliente" ? "cliente" : "vendedor";
}

export function catalogViewPath(slug: string, audience: CatalogAudience): string {
  return `/catalogo/${encodeURIComponent(slug)}?publico=${audience}`;
}

export function catalogVisiblePrice(audience: CatalogAudience, consultOnly: boolean, price: number | null): number | null {
  return audience === "cliente" || consultOnly ? null : price;
}

/** Public catalogs are served by the central backend, including member materials. */
export function catalogPublicUrl(slug: string, audience: CatalogAudience): string {
  return `https://login.qrcodevalidacao.com${catalogViewPath(slug, audience)}`;
}
