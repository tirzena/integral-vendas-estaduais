import type { Currency } from "@/lib/format";
export type OrderExchange = {
  base: Currency;
  BRL: number;
  USD: number;
  PYG: number;
  mode: "automatic" | "manual";
};
export function manualExchange(
  base: Currency,
  brlPerUsd: number,
  pygPerUsd: number,
): OrderExchange | null {
  if (![brlPerUsd, pygPerUsd].every((n) => Number.isFinite(n) && n > 0)) return null;
  const usdValues = { USD: 1, BRL: brlPerUsd, PYG: pygPerUsd };
  const divisor = usdValues[base];
  return {
    base,
    USD: 1 / divisor,
    BRL: brlPerUsd / divisor,
    PYG: pygPerUsd / divisor,
    mode: "manual",
  };
}
export function exchangeConvert(
  value: number,
  from: Currency,
  to: Currency,
  exchange: OrderExchange | null,
) {
  if (from === to) return value;
  if (!exchange || !(exchange[from] > 0) || !(exchange[to] > 0)) return null;
  return (value * exchange[to]) / exchange[from];
}
export const isPix = (method: string) => method.trim().toLowerCase() === "pix";
