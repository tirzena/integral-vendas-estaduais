import type { ReportData } from "@/components/common/ReportButton";

export const SIMPLIFIED_REPORT_HEADERS = [
  "Pedido", "Data", "Cliente", "Vendedor", "Situação", "Data(s) do pagamento",
  "Produtos", "Unidades", "Total BRL", "Total USD", "Total PYG",
  "Pago BRL", "Pago USD", "Pago PYG", "A receber BRL", "A receber USD",
  "A receber PYG", "Frete BRL", "Frete USD", "Frete PYG", "Estoque",
] as const;

/** Only the requested fields, with equivalent currencies grouped without summing. */
export function reportSummary(data: ReportData): ReportData {
  const groups: {title: string; cells: {index: number; currency?: string}[]}[] = [];
  for (const header of SIMPLIFIED_REPORT_HEADERS) {
    const match = header.match(/^(.*) (BRL|USD|PYG)$/);
    const title = match?.[1] ?? header;
    const cell = {index: data.headers.indexOf(header), ...(match?.[2] ? {currency: match[2]} : {})};
    const existing = match ? groups.find(group => group.title === title) : undefined;
    if (existing) existing.cells.push(cell);
    else groups.push({title, cells: [cell]});
  }
  return {
    headers: groups.map(group => group.title),
    rows: data.rows.map(row => groups.map(group => {
      if (group.cells.length === 1) return row[group.cells[0]!.index] ?? "—";
      return group.cells.map(({index,currency}) => `${currency}: ${index < 0 ? "—" : row[index] ?? "—"}`).join("\n");
    })),
    highlights: [],
    sections: [],
  };
}
