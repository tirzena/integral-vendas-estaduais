import type { ReportData } from "@/components/common/ReportButton";

/** Group equivalent currency columns without summing or changing their values. */
export function reportSummary(data: ReportData): ReportData {
  const groups: { title: string; indexes: number[] }[] = [];
  data.headers.forEach((header, index) => {
    const match = header.match(/^(.*) (BRL|USD|PYG)$/);
    const title = match?.[1] ?? header;
    const existing = match ? groups.find(group => group.title === title) : undefined;
    if (existing) existing.indexes.push(index);
    else groups.push({title, indexes: [index]});
  });
  const result: ReportData = {
    ...data,
    headers: groups.map(group => group.title),
    rows: data.rows.map(row => groups.map(group => group.indexes.length === 1
      ? row[group.indexes[0]!]
      : group.indexes.map(index => `${data.headers[index]!.split(" ").at(-1)}: ${row[index] ?? "—"}`).join("\n"))),
    sections: [],
  };
  delete result.pdfDocument;
  return result;
}
