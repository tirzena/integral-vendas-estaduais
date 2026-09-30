/** Normaliza números digitados com vírgula ou ponto decimal para o formato do JavaScript. */
export function normalizeDecimalInput(value: string): string {
  const compact = value.replace(/\s/g, "").replace(/[^\d.,-]/g, "");
  const sign = compact.startsWith("-") ? "-" : "";
  const unsigned = compact.replace(/-/g, "");
  const commas = [...unsigned.matchAll(/,/g)].map((match) => match.index);
  const dots = [...unsigned.matchAll(/\./g)].map((match) => match.index);
  const lastComma = commas.at(-1) ?? -1;
  const lastDot = dots.at(-1) ?? -1;
  const separators = commas.length + dots.length;
  if (separators === 0) return sign + unsigned;

  // Repeated groups of three without a decimal part are thousands separators.
  if ((commas.length === separators || dots.length === separators) &&
      separators > 1 && /^\d{1,3}([.,]\d{3})+$/.test(unsigned)) {
    return sign + unsigned.replace(/[.,]/g, "");
  }
  const decimalAt = Math.max(lastComma, lastDot);
  const integer = unsigned.slice(0, decimalAt).replace(/[.,]/g, "");
  const fraction = unsigned.slice(decimalAt + 1).replace(/[.,]/g, "");
  return sign + integer + "." + fraction;
}

/** Número de um campo de formulário, sem transformar entrada inválida em zero. */
export function parseDecimal(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  const normalized = normalizeDecimalInput(String(value ?? ""));
  if (!normalized || normalized === "-" || normalized === ".") return Number.NaN;
  return Number(normalized);
}
