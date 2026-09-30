import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getLiveRates, type Currency } from "@/lib/rates.functions";
import { formatMoney } from "@/lib/format";

export type { Currency };

export const DISPLAY_CURRENCIES: { value: Currency; label: string; short: string }[] = [
  { value: "USD", label: "Ver em dólar (US$)", short: "US$" },
  { value: "BRL", label: "Ver em real (R$)", short: "R$" },
  { value: "PYG", label: "Ver em guarani (₲)", short: "₲" },
];

/**
 * Cotações ao vivo compartilhadas: devolve conversores entre BRL, USD e PYG.
 * Reaproveita a mesma consulta do ticker, sem gravar nada no histórico.
 */
export function useRates(refetchInterval = 60_000) {
  const live = useServerFn(getLiveRates);
  const query = useQuery({
    queryKey: ["live-rates-shared"],
    queryFn: () => live(),
    refetchInterval,
  });

  const factors = useMemo(() => {
    const map: Record<string, number> = { "USD-USD": 1, "BRL-BRL": 1, "PYG-PYG": 1 };
    const data = query.data as any;
    if (data?.ok) {
      for (const p of data.pairs as { base: Currency; quote: Currency; rate: number }[]) {
        map[`${p.base}-${p.quote}`] = p.rate;
      }
    }
    return map;
  }, [query.data]);

  const ready = Object.keys(factors).length > 3;

  /** Converte um valor de uma moeda para outra. Devolve null enquanto não há cotação. */
  const convert = (value: number | null | undefined, from: Currency, to: Currency) => {
    const amount = Number(value ?? 0);
    if (from === to) return amount;
    const factor = factors[`${from}-${to}`];
    if (!factor) return null;
    return amount * factor;
  };

  /** Converte e já formata na moeda de destino. */
  const money = (value: number | null | undefined, from: Currency, to: Currency) => {
    const converted = convert(value, from, to);
    return converted === null ? "—" : formatMoney(converted, to);
  };

  /** Mostra o mesmo valor nas três moedas, útil nos resumos. */
  const allCurrencies = (value: number | null | undefined, from: Currency) =>
    (["USD", "BRL", "PYG"] as Currency[]).map((c) => ({
      currency: c,
      text: money(value, from, c),
    }));

  return { ready, loading: query.isLoading, convert, money, allCurrencies, factors };
}
