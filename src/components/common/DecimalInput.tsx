import { useEffect, useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";

type DecimalInputProps = Omit<ComponentProps<typeof Input>, "value"> & {
  value: string | number;
};

/** Preserva a vírgula ou ponto enquanto o usuário digita um número decimal. */
export function DecimalInput({
  value, onChange, onFocus, onBlur, ...props
}: DecimalInputProps) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [value, focused]);

  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      value={focused ? draft : String(value)}
      onFocus={(event) => {
        setDraft(String(value));
        setFocused(true);
        onFocus?.(event);
      }}
      onChange={(event) => {
        setDraft(event.target.value);
        onChange?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
    />
  );
}
