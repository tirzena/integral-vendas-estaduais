export type PeriodKey = "hoje" | "7d" | "mes" | "ano" | "tudo";

export const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: "hoje", label: "Hoje" },
  { value: "7d", label: "Últimos 7 dias" },
  { value: "mes", label: "Este mês" },
  { value: "ano", label: "Este ano" },
  { value: "tudo", label: "Todo o período" },
];

/** Data inicial (inclusive) do período. `null` significa sem limite. */
export function periodStart(period: PeriodKey, now = new Date()): Date | null {
  const d = new Date(now);
  switch (period) {
    case "hoje":
      d.setHours(0, 0, 0, 0);
      return d;
    case "7d":
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - 6);
      return d;
    case "mes":
      return new Date(d.getFullYear(), d.getMonth(), 1);
    case "ano":
      return new Date(d.getFullYear(), 0, 1);
    default:
      return null;
  }
}

export function inPeriod(value: string | null | undefined, period: PeriodKey): boolean {
  if (period === "tudo") return true;
  if (!value) return false;
  const start = periodStart(period);
  if (!start) return true;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() >= start.getTime();
}
