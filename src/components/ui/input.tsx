import * as React from "react";

import { cn } from "@/lib/utils";
import { normalizeDecimalInput } from "@/lib/decimal";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onChange, onBlur, inputMode, min, max, step, value, ...props }, ref) => {
    const [draft, setDraft] = React.useState<string | null>(null);
    const isDecimal = type === "number" && String(step) !== "1" && inputMode !== "numeric";
    const supportsDecimalDraft = isDecimal || inputMode === "decimal";
    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      if (supportsDecimalDraft) {
        const typed = event.currentTarget.value;
        if (value !== undefined) setDraft(typed);
        const normalized = normalizeDecimalInput(typed);
        if (event.currentTarget.value !== normalized) event.currentTarget.value = normalized;
        const raw = event.currentTarget.value;
        const amount = Number(raw);
        let error = "";
        if (raw && (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw) || !Number.isFinite(amount)))
          error = "Informe um número válido.";
        else if (raw && min !== undefined && amount < Number(min))
          error = `O valor mínimo é ${min}.`;
        else if (raw && max !== undefined && amount > Number(max))
          error = `O valor máximo é ${max}.`;
        else if (raw && step && step !== "any" && Number(step) > 0) {
          const increments = (amount - (min === undefined ? 0 : Number(min))) / Number(step);
          if (Math.abs(increments - Math.round(increments)) > 1e-7)
            error = `Use incrementos de ${step}.`;
        }
        if (isDecimal) event.currentTarget.setCustomValidity(error);
      }
      onChange?.(event);
    };

    return (
      <input
        type={isDecimal ? "text" : type}
        inputMode={inputMode ?? (isDecimal ? "decimal" : undefined)}
        min={min}
        max={max}
        step={step}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
        value={draft ?? value}
        onChange={handleChange}
        onBlur={(event) => {
          onBlur?.(event);
          setDraft(null);
        }}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
