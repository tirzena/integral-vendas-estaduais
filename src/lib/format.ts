export type Currency = "BRL" | "USD" | "PYG";

export const CURRENCIES: { value: Currency; label: string }[] = [
  { value: "BRL", label: "Real (R$)" },
  { value: "USD", label: "Dólar (US$)" },
  { value: "PYG", label: "Guarani (₲)" },
];

const localeByCurrency: Record<Currency, string> = {
  BRL: "pt-BR",
  USD: "en-US",
  PYG: "es-PY",
};

export function formatMoney(value: number | null | undefined, currency: Currency = "BRL") {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat(localeByCurrency[currency] ?? "pt-BR", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "PYG" ? 0 : 2,
  }).format(amount);
}

export function formatNumber(value: number | null | undefined, digits = 0) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: digits }).format(
    Number(value ?? 0),
  );
}

/** Mantém a precisão útil das cotações, inclusive zeros finais como em 5,250. */
export function formatExchangeRate(value: number | null | undefined) {
  const amount = Number(value ?? 0);
  const options =
    Math.abs(amount) >= 1000
      ? { minimumFractionDigits: 0, maximumFractionDigits: 2 }
      : Math.abs(amount) >= 1
        ? { minimumFractionDigits: 3, maximumFractionDigits: 4 }
        : Math.abs(amount) >= 0.01
          ? { minimumFractionDigits: 5, maximumFractionDigits: 5 }
          : { minimumFractionDigits: 8, maximumFractionDigits: 8 };
  return new Intl.NumberFormat("pt-BR", options).format(amount);
}

export function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(date);
}

export function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(value),
  );
}

export function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}
