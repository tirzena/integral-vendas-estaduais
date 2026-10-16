/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/useAuth";
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
  canSeeMoney: boolean;
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
  const { userId } = useCurrentUser();
  const from = periodStart(period)?.toISOString() ?? null;
  const query = useQuery({
    queryKey: ["ranking-summary", userId, period, productId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("integral_ranking_summary", {
        p_from: from,
        p_product_id: productId === "todos" ? null : productId,
      });
      if (error) throw error;
      return (data ?? []) as Array<{
        userId: string;
        name: string;
        orders: number;
        sales: number;
        units: number;
        canSeeMoney: boolean;
        revenue: { currency: Currency; amount: number }[] | null;
        bonus: { currency: Currency; amount: number }[] | null;
        products: ProductSales[];
      }>;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const rows = useMemo<RankingRow[]>(() => {
    const sum = (amounts: { currency: Currency; amount: number }[] | null) =>
      (amounts ?? []).reduce(
        (total, value) => total + (convert(Number(value.amount), value.currency, display) ?? 0),
        0,
      );
    return (query.data ?? []).map((row) => ({
      ...row,
      orders: Number(row.orders),
      sales: Number(row.sales),
      units: Number(row.units),
      conversion: Number(row.orders) ? (Number(row.sales) / Number(row.orders)) * 100 : 0,
      revenue: sum(row.revenue),
      bonus: sum(row.bonus),
    }));
  }, [query.data, display, convert]);
  return { rows, loading: query.isLoading, error: query.error, ratesReady: ready };
}
