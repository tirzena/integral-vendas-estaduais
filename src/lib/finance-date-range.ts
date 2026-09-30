export type FinanceDateRange = { from: Date | null; through: Date };

export function financeDateRange(from: string, to: string): FinanceDateRange {
  const start = from ? new Date(`${from}T00:00:00`) : to ? new Date(0) : null;
  const end = to ? new Date(`${to}T23:59:59.999`) : new Date();
  const now = new Date();
  return {
    from: start && !Number.isNaN(start.getTime()) ? start : null,
    through: Number.isNaN(end.getTime()) || end > now ? now : end,
  };
}

export function financeDateMatches(value: string | null | undefined, range: FinanceDateRange) {
  if (!value) return !range.from;
  const date = new Date(value.length === 10 ? value + "T12:00:00" : value);
  return !Number.isNaN(date.getTime()) && (!range.from || date >= range.from) && date <= range.through;
}
