import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMarketQuotes, type MarketQuote } from "@/lib/rates.functions";

/**
 * Cotações ao vivo de ativos livres (criptos, ações, índices, moedas).
 * Atualiza sozinho enquanto a tela estiver aberta.
 */
export function useMarketQuotes(symbols: string[], refetchInterval = 5_000) {
  const fetchQuotes = useServerFn(getMarketQuotes);
  const list = useMemo(
    () => Array.from(new Set(symbols.filter(Boolean).map((s) => s.trim().toUpperCase()))).sort(),
    [symbols],
  );

  const query = useQuery({
    queryKey: ["market-quotes", list.join(",")],
    queryFn: () => fetchQuotes({ data: { symbols: list } }),
    enabled: list.length > 0,
    refetchInterval,
    refetchIntervalInBackground: true,
  });

  const quotes = (query.data?.quotes ?? {}) as Record<string, MarketQuote>;
  const priceOf = (symbol?: string | null) =>
    symbol ? (quotes[symbol.trim().toUpperCase()]?.price ?? null) : null;

  return { quotes, priceOf, loading: query.isLoading, updatedAt: query.dataUpdatedAt };
}
