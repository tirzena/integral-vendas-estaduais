import { expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { reportSummary, SIMPLIFIED_REPORT_HEADERS } from "../src/lib/report-summary";
import { buildReportSummaryPdf } from "../src/lib/report-summary-pdf";

const expectedHeaders = ["Pedido", "Data", "Cliente", "Vendedor", "Situação", "Data(s) do pagamento", "Produtos", "Unidades", "Total BRL", "Total USD", "Total PYG", "Pago BRL", "Pago USD", "Pago PYG", "A receber BRL", "A receber USD", "A receber PYG", "Frete BRL", "Frete USD", "Frete PYG", "Estoque"];

it("keeps exactly the requested fields and groups their currencies without adding other data", () => {
 const original = {headers: ["Rastreio", ...[...expectedHeaders].reverse(), "Custo total BRL", "Lucro bruto USD", "A pagar BRL"], rows: [["TRACKING_PRIVATE", ...[...expectedHeaders].reverse().map((name,index)=>`${name}: ${index}`), "COST_PRIVATE", "PROFIT_PRIVATE", "PAYABLE_PRIVATE"]], highlights: [{label:"Total",value:"HIGHLIGHT_PRIVATE"}], sections: [{title:"Detalhes",headers:["Item"],rows:[["DETAIL_PRIVATE"]]}]};
 const before=JSON.stringify(original), summary=reportSummary(original);
 expect(summary.headers).toEqual(["Pedido", "Data", "Cliente", "Vendedor", "Situação", "Data(s) do pagamento", "Produtos", "Unidades", "Total", "Pago", "A receber", "Frete", "Estoque"]);
 expect(summary.headers).toHaveLength(13);
 expectedHeaders.forEach(name=>expect(summary.rows[0]!.join("\n")).toContain(String(original.rows[0]?.[original.headers.indexOf(name)])));
 for(const value of ["TRACKING_PRIVATE", "COST_PRIVATE", "PROFIT_PRIVATE", "PAYABLE_PRIVATE", "HIGHLIGHT_PRIVATE", "DETAIL_PRIVATE"]) expect(JSON.stringify(summary)).not.toContain(value);
 expect(summary.highlights).toEqual([]);expect(summary.sections).toEqual([]);expect(summary.pdfDocument).toBeUndefined();
 expect(JSON.stringify(original)).toBe(before);
});

it("keeps numeric zero and never shifts values when an input column is missing", () => {
 const summary=reportSummary({headers:["Pago BRL", "A receber BRL"],rows:[[0, "R$ 50,00"]]});
 expect(summary.rows[0]?.[summary.headers.indexOf("Pago")]).toContain("BRL: 0");
 expect(summary.rows[0]?.[summary.headers.indexOf("A receber")]).toContain("BRL: R$ 50,00");
 expect(summary.rows[0]?.[summary.headers.indexOf("Estoque")]).toBe("—");
 expect(SIMPLIFIED_REPORT_HEADERS).toEqual(expectedHeaders);
});

it("paginates long lists and unusually long cells without dropping the last row", () => {
  const rows=Array.from({length:100},(_,index)=>[String(index), index===99?"FINAL_MARKER":"Produto ".repeat(50)]);
  const pdf=buildReportSummaryPdf({headers:["Pedido","Produtos"],rows},{title:"Lista de teste"});
  expect(pdf.getNumberOfPages()).toBeGreaterThan(1);
  expect(pdf.output()).toContain("FINAL_MARKER");
});

it("creates a branded PDF preview with requested fields and grouped currencies", () => {
  const headers=["Pedido","Data","Cliente","Vendedor","Situação","Data(s) do pagamento","Produtos","Unidades",... ["Total","Pago","A receber","Frete"].flatMap(label=>["BRL","USD","PYG"].map(currency=>`${label} ${currency}`)),"Estoque","Rastreio"];
  const row=["#02.3","14/08/2026","Cliente exemplo","Vendedor exemplo","Pagamento parcial","11/09/2026","Produto A | Produto B",10,...Array.from({length:4},()=>["R$ 5.680,00","$ 1,096.55","Gs. 8.000.000"]).flat(),"Principal","Aguardando"];
  const pdf=buildReportSummaryPdf(reportSummary({headers,rows:Array.from({length:12},(_,index)=>[...row.slice(0,0),`#${index+1}.3`,...row.slice(1)]),highlights:[{label:"Pedidos",value:"12"},{label:"Valor total",value:"R$ 68.160,00 | USD 13,158.60 | PYG 96.000.000"}]}),{title:"Relatório - Pagamento parcial",filters:["Base: filtros da tela | Vendedor: Todos | Situação: Pagamento parcial"]});
  expect(pdf.output()).toContain("sistemaintegral");
  writeFileSync("/tmp/report-summary-preview.pdf",Buffer.from(pdf.output("arraybuffer")));
});
