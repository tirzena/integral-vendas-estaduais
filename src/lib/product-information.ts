export function informationSourceUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function publicProductInformation(item: Record<string, unknown>, rules: Record<string, unknown> = {}) {
  const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
  return {
    description: text(item["public_description"]) ?? text(rules["public_description"]),
    intendedUse: text(item["intended_use"]),
    usageInstructions: text(item["usage_instructions"]),
    informationSourceUrl: informationSourceUrl(item["information_source_url"]),
  };
}
