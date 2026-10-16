export type CatalogSelectionItem = {
  id: string;
  name: string;
  product_id?: string | null;
  category_id?: string | null;
};
export type CatalogCategory = { id: string; name: string };
export type CatalogSubcategory = CatalogCategory & { product_id?: string | null };
export type CatalogSelectionGroup<T> = {
  id: string;
  name: string;
  items: T[];
  subcategories: { id: string; name: string; items: T[] }[];
};
export function groupCatalogSelection<T extends CatalogSelectionItem>(
  items: T[],
  categories: CatalogCategory[],
  subcategories: CatalogSubcategory[],
): CatalogSelectionGroup<T>[] {
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const subNames = new Map(subcategories.map((c) => [c.id, c.name]));
  const groups = new Map<string, CatalogSelectionGroup<T>>();
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    const id = item.product_id ?? "uncategorized";
    let group = groups.get(id);
    if (!group) {
      group = { id, name: names.get(id) ?? "Sem categoria", items: [], subcategories: [] };
      groups.set(id, group);
    }
    group.items.push(item);
    const subId = item.category_id ?? "uncategorized-sub";
    let sub = group.subcategories.find((s) => s.id === subId);
    if (!sub) {
      sub = { id: subId, name: subNames.get(subId) ?? "Sem subcategoria", items: [] };
      group.subcategories.push(sub);
    }
    sub.items.push(item);
  }
  const compare = (a: { name: string }, b: { name: string }) =>
    a.name.localeCompare(b.name, "pt-BR");
  for (const group of groups.values()) {
    group.subcategories.sort(compare);
    for (const sub of group.subcategories) sub.items.sort(compare);
  }
  return [...groups.values()].sort(compare);
}
export function toggleCatalogSelection(selected: string[], ids: string[], limit = 500): string[] {
  const unique = [...new Set(ids)];
  const all = unique.length > 0 && unique.every((id) => selected.includes(id));
  const next = all
    ? selected.filter((id) => !unique.includes(id))
    : [...new Set([...selected, ...unique])];
  if (next.length > limit)
    throw new Error("Selecione no máximo " + limit + " produtos. Este grupo ultrapassa o limite.");
  return next;
}
export function catalogSelectionState(
  selected: string[],
  ids: string[],
): boolean | "indeterminate" {
  const count = ids.filter((id) => selected.includes(id)).length;
  return count === 0 ? false : count === ids.length ? true : "indeterminate";
}
export const normalizeCatalogSearch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
