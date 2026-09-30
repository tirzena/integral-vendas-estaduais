import type { Currency } from "@/hooks/useRates";

type LiveConvert = (value: number, from: Currency, to: Currency) => number | null;

const SNAPSHOT_FIELD: Record<Currency, string> = {
  BRL: "settled_amount_brl",
  USD: "settled_amount_usd",
  PYG: "settled_amount_pyg",
};

/** Usa a conversão congelada para valores quitados e a cotação atual para valores em aberto. */
export function convertFinancialAmount(row: any, to: Currency, convert: LiveConvert) {
  const settled = row?.status === "pago" || Boolean(row?.paid_at);
  const snapshot = row?.[SNAPSHOT_FIELD[to]];
  if (settled && snapshot !== null && snapshot !== undefined && Number.isFinite(Number(snapshot))) {
    return Number(snapshot);
  }
  const amount = Number(row?.amount ?? 0);
  const currency = (row?.currency ?? "USD") as Currency;
  return convert(amount, currency, to) ?? (currency === to ? amount : 0);
}

