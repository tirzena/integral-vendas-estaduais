/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRates, type Currency } from "@/hooks/useRates";

export type RankingPeriod =
  "1d" | "7d" | "15d" | "mes" | "30d" | "90d" | "trimestre" | "semestre" | "ano" | "tudo";

/** Períodos de campeonato: mensal, trimestral, semestral e anual. */
export const CHAMPIONSHIP_OPTIONS: { value: RankingPeriod; label: string }[] = [
  { value: "mes", label: "Campeonato mensal" },
  { value: "trimestre", label: "Campeonato trimestral" },
  { value: "semestre", label: "Campeonato semestral" },
  { value: "ano", label: "Campeonato anual" },
];

export const PERIOD_OPTIONS: { value: RankingPeriod; label: string }[] = [
  { value: "1d", label: "Hoje" },
  { value: "7d", label: "Últimos 7 dias" },
  { value: "15d", label: "Últimos 15 dias" },
  { value: "mes", label: "Este mês" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "90d", label: "Últimos 90 dias" },
  { value: "ano", label: "Este ano" },
  { value: "tudo", label: "Todo o período" },
];

/** Pedidos que já viraram venda de verdade. */
export const SOLD_STATUSES = ["faturado", "enviado", "entregue"];

export function periodStart(period: RankingPeriod): Date | null {
  const now = new Date();
  if (period === "tudo") return null;
  if (period === "ano") return new Date(now.getFullYear(), 0, 1);
  if (period === "semestre") return new Date(now.getFullYear(), now.getMonth() < 6 ? 0 : 6, 1);
  if (period === "trimestre")
    return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  if (period === "mes") return new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === "1d") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = period === "7d" ? 7 : period === "15d" ? 15 : period === "30d" ? 30 : 90;
  return new Date(now.getTime() - days * 86_400_000);
}

export type ProductSales = { id: string; name: string; sales: number; units: number };

export type RankingRow = {
  userId: string;
  name: string;
  orders: number;
  sales: number;
  conversion: number;
  revenue: number;
  bonus: number;
  units: number;
  products: ProductSales[];
};

export function useRanking(
  period: RankingPeriod,
  productId: string | "todos",
  display: Currency = "USD",
) {
  const { convert, ready } = useRates();

  const query = useQuery({
    queryKey: ["ranking-data", productId],
    queryFn: async () => {
      const pid = productId === "todos" ? null : productId;
      let ordersQuery = supabase
        .from("orders")
        .select("id,seller_id,status,total,currency,created_at,product_id,workflow_stage,order_date")
        .is("deleted_at", null)
        .is("superseded_at", null)
        .limit(3000);
      if (pid) ordersQuery = ordersQuery.eq("product_id", pid);
      const [ordersResult, profilesResult, awardsResult, rolesResult] = await Promise.all([
        ordersQuery,
        supabase.from("profiles").select("id,full_name,email,is_active"),
        supabase.from("bonus_awards").select("user_id,amount,currency,created_at,status"),
        supabase.from("user_roles").select("user_id").eq("role", "vendedor"),
      ]);
      for (const result of [ordersResult, profilesResult, awardsResult, rolesResult]) if (result.error) throw result.error;
      const orders = ordersResult.data; const profiles = profilesResult.data; const awards = awardsResult.data; const sellers = rolesResult.data;
      const ids = (orders ?? []).map((o: any) => o.id);
      const items: any[] = [];
      for (let offset = 0; offset < ids.length; offset += 200) {
        const { data, error } = await supabase
          .from("order_items")
          .select("id,order_id,item_id,description,quantity")
          .in("order_id", ids.slice(offset, offset + 200));
        if (error) throw error;
        items.push(...(data ?? []));
      }
      return {
        orders: orders ?? [],
        profiles: profiles ?? [],
        awards: awards ?? [],
        sellers: sellers ?? [],
        items,
      };
    },
  });

  const rows = useMemo<RankingRow[]>(() => {
    const data = query.data;
    if (!data) return [];
    const from = periodStart(period);
    const now = new Date();
    const inPeriod = (d: string | null) => {
      if (!d) return !from;
      const date = new Date(d.length === 10 ? `${d}T00:00:00` : d);
      return date <= now && (!from || date >= from);
    };
    const nameOf = (id: string) => {
      const p = data.profiles.find((x: any) => x.id === id);
      return p?.full_name || p?.email || "Sem responsável";
    };

    const itemsByOrder = new Map<string, any[]>();
    for (const it of data.items as any[]) {
      const current = itemsByOrder.get(it.order_id) ?? [];
      current.push(it);
      itemsByOrder.set(it.order_id, current);
    }

    const map = new Map<string, RankingRow>();
    const ensure = (id: string) => {
      if (!map.has(id))
        map.set(id, {
          userId: id,
          name: nameOf(id),
          orders: 0,
          sales: 0,
          conversion: 0,
          revenue: 0,
          bonus: 0,
          units: 0,
          products: [],
        });
      return map.get(id)!;
    };

    const sellerIds = new Set(data.sellers.map((role: any) => role.user_id));
    for (const id of sellerIds) ensure(id as string);

    for (const o of data.orders as any[]) {
      if (!o.seller_id || !sellerIds.has(o.seller_id) || !inPeriod(o.order_date ?? o.created_at) || o.status === "cancelado" || o.workflow_stage === "cancelado") continue;
      const row = ensure(o.seller_id);
      row.orders += 1;
      if (SOLD_STATUSES.includes(String(o.status))) {
        row.sales += 1;
        const value = convert(Number(o.total ?? 0), (o.currency ?? "USD") as Currency, display);
        row.revenue += value ?? 0;
        const orderItems = itemsByOrder.get(o.id) ?? [];
        const units = orderItems.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
        row.units += units;
        for (const item of orderItems) {
          const productKey = item.item_id ?? `${item.description}:${item.id}`;
          const product = row.products.find((entry) => entry.id === productKey);
          if (product) {
            product.sales += 1;
            product.units += Number(item.quantity ?? 0);
          } else {
            row.products.push({
              id: productKey,
              name: item.description || "Produto sem nome",
              sales: 1,
              units: Number(item.quantity ?? 0),
            });
          }
        }
      }
    }

    for (const a of data.awards as any[]) {
      if (!a.user_id || !sellerIds.has(a.user_id) || !inPeriod(a.created_at)) continue;
      const row = ensure(a.user_id);
      const value = convert(Number(a.amount ?? 0), (a.currency ?? "USD") as Currency, display);
      row.bonus += value ?? 0;
    }

    return [...map.values()]
      .map((r) => ({
        ...r,
        conversion: r.orders ? (r.sales / r.orders) * 100 : 0,
        products: [...r.products].sort((a, b) => b.units - a.units || b.sales - a.sales),
      }))
      .sort((a, b) => b.units - a.units || b.sales - a.sales || b.revenue - a.revenue);
  }, [query.data, period, display, convert]);

  return { rows, loading: query.isLoading, error: query.error, ratesReady: ready };
}
