import { createContext, useContext } from "react";
import { cn } from "@/lib/utils";
import { formatMoney, type Currency } from "@/lib/format";
import { useRates } from "@/hooks/useRates";

export const DisplayCurrencyContext = createContext<Currency | null>(null);

const DISPLAY_ORDER: Currency[] = ["BRL", "USD", "PYG"];

type CurrencyValuesProps = {
  convert?: (value: number | null | undefined, from: Currency, to: Currency) => number | null;
  value: number | null | undefined;
  currency?: Currency | null;
  className?: string;
  layout?: "stacked" | "inline";
  emphasize?: boolean;
  primaryFirst?: boolean;
};

/** Exibe qualquer valor monetário do OS em real, dólar e guarani. */
export function CurrencyValues({
  convert,
  value,
  currency = "BRL",
  className,
  layout = "stacked",
  emphasize = false,
  primaryFirst = false,
}: CurrencyValuesProps) {
  const rates = useRates();
  const source = currency ?? "BRL";
  const selectedCurrency = useContext(DisplayCurrencyContext);
  const displayOrder = selectedCurrency
    ? [selectedCurrency]
    : primaryFirst
      ? [source, ...DISPLAY_ORDER.filter((target) => target !== source)]
      : DISPLAY_ORDER;

  const values = displayOrder.map((target) => {
    const converted = (convert ?? rates.convert)(value, source, target);
    return converted === null ? `${target}: —` : formatMoney(converted, target);
  });

  if (layout === "inline") {
    return (
      <span className={cn(emphasize && "font-semibold", className)}>{values.join(" · ")}</span>
    );
  }

  return (
    <span
      className={cn("inline-flex flex-col leading-snug", emphasize && "font-semibold", className)}
    >
      {values.map((formatted, index) => (
        <span key={displayOrder[index]}>{formatted}</span>
      ))}
    </span>
  );
}
