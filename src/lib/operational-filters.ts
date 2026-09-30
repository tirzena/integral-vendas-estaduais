/* eslint-disable @typescript-eslint/no-explicit-any */
import { inPeriod, type PeriodKey } from "./period";
export type OperationalFilter = {
  search: string;
  status: string;
  seller: string;
  team: string;
  item: string;
  supplier: string;
  origin: string;
  sort: string;
  period: PeriodKey;
};
export const defaultOperationalFilter: OperationalFilter = {
  search: "",
  status: "todos",
  seller: "todos",
  team: "todos",
  item: "todos",
  supplier: "todos",
  origin: "todos",
  sort: "numero_asc",
  period: "tudo",
};
export const fold = (value: any) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export function filterOperationalRows(rows: any[], f: OperationalFilter) {
  return rows
    .filter((r) => {
      if (!inPeriod(r.filterDate, f.period)) return false;
      if (
        f.status !== "todos" &&
        r.filterStatus !== f.status &&
        !r.filterStatuses?.includes(f.status)
      )
        return false;
      if (f.seller !== "todos" && r.filterSeller?.id !== f.seller) return false;
      if (f.team !== "todos" && !r.filterTeams?.some((t: any) => t.id === f.team)) return false;
      if (f.item !== "todos" && !r.filterItems?.some((i: any) => i.id === f.item)) return false;
      if (f.supplier !== "todos" && !r.filterSuppliers?.some((s: any) => s.id === f.supplier))
        return false;
      if (f.origin !== "todos" && r.filterOrigin !== f.origin) return false;
      return !f.search.trim() || fold(r.filterSearch).includes(fold(f.search.trim()));
    })
    .sort((a, b) => {
      const diff = Number(a.number || 0) - Number(b.number || 0);
      if (f.sort === "numero_asc") return diff;
      if (f.sort === "numero_desc") return -diff;
      const time = new Date(a.filterDate || 0).getTime() - new Date(b.filterDate || 0).getTime();
      return (f.sort === "antigos" ? time : -time) || diff;
    });
}
export function enrichOperationalRow(row: any, metadata: any, lines: any[], purchase = false) {
  const order = purchase
    ? (row.source_order ?? {})
    : { ...row, ...(metadata.orders ?? []).find((o: any) => o.id === row.id) };
  const sellerId = order.seller_id ?? (purchase ? row.buyer?.id : null);
  const seller = (metadata.people ?? []).find((p: any) => p.id === sellerId);
  const teams = (metadata.teamMembers ?? [])
    .filter((m: any) => m.user_id === sellerId)
    .map((m: any) => (metadata.teams ?? []).find((t: any) => t.id === m.team_id))
    .filter(Boolean);
  const items = lines.map((l: any) => {
    const item = (metadata.items ?? []).find((i: any) => i.id === l.item_id);
    return {
      id: l.item_id ?? l.description,
      name: item?.name ?? l.description,
      supplier_id: l.supplier_id ?? item?.supplier_id,
    };
  });
  const suppliers = purchase
    ? [row.supplier].filter(Boolean)
    : items
        .map((i: any) => (metadata.suppliers ?? []).find((s: any) => s.id === i.supplier_id))
        .filter(Boolean);
  const origin = purchase
    ? (order.origin ?? (row.source_type === "sales_order" ? "pdv" : "manual"))
    : (order.origin ?? "pdv");
  return {
    ...row,
    ...(!purchase ? order : {}),
    filterDate: purchase
      ? (row.purchase_date ?? row.created_at)
      : (order.order_date ?? order.created_at),
    filterSeller: seller
      ? { id: seller.id, name: seller.full_name || row.buyer?.name || "Vendedor" }
      : sellerId
        ? { id: sellerId, name: row.buyer?.name ?? "Vendedor" }
        : null,
    filterTeams: teams,
    filterItems: items,
    filterSuppliers: suppliers,
    filterOrigin: origin,
    filterSearch: [
      row.number,
      order.number,
      row.delivery_recipient_name,
      row.delivery_recipient_document,
      row.shipping_city,
      row.notes,
      row.buyer?.name,
      seller?.full_name,
      ...items.map((i: any) => i.name),
      ...suppliers.map((s: any) => s.name),
    ]
      .filter(Boolean)
      .join(" "),
  };
}
