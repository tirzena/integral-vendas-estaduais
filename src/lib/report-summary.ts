import type { ReportData } from "@/components/common/ReportButton";

/** Exactly the requested balances; paid amounts are never reclassified as payable. */
export function reportSummary(data: ReportData): ReportData {
  const headers = ["A receber", "A pagar"];
  const groups = headers.map(title => data.headers.flatMap((header, index) => {
    const match = header.trim().replace(/\s+/g, " ").match(/^(a receber|a pagar)(?: (BRL|USD|PYG))?$/i);
    return match && match[1]?.toLowerCase() === title.toLowerCase() ? [{index, currency: match[2]}] : [];
  }));
  return {
    headers,
    rows: data.rows.map(row => groups.map(group => group.length === 0 ? "—" : group.map(({index, currency}) => {
      const value = row[index] ?? "—";
      return currency ? `${currency.toUpperCase()}: ${value}` : String(value);
    }).join("\n"))),
    highlights: [],
    sections: [],
  };
}
