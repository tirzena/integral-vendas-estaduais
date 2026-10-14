import { expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { reportSummary } from "../src/lib/report-summary";
import { buildReportSummaryPdf } from "../src/lib/report-summary-pdf";

const original = {
  headers: ["Pedido","Cliente","Total BRL","Total USD","Total PYG","Pago BRL","Pago USD","Pago PYG"],
  rows: [["#02.3","Cliente exemplo","R$ 5.680,00","$ 1,096.55","Gs. 8.000.000","R$ 100,00","$ 20.00","Gs. 140.000"]],
  highlights: [{label:"Pedidos",value:"1"}],
  sections: [{title:"Detalhes",headers:["Item"],rows:[["Detalhe completo"]]}],
};

it("groups currencies without altering amounts, order numbers or the complete report", () => {
  const before=JSON.stringify(original), summary=reportSummary(original);
  expect(summary.headers).toEqual(["Pedido","Cliente","Total","Pago"]);
  expect(summary.rows[0]?.[0]).toBe("#02.3");
  for(const value of original.rows[0]!.slice(2)) expect(summary.rows[0]!.join(" ")).toContain(value);
  expect(summary.sections).toEqual([]);expect(summary.pdfDocument).toBeUndefined();
  expect(summary.highlights).toEqual(original.highlights);
  expect(JSON.stringify(original)).toBe(before);
});

it("keeps only available columns, never inventing privileged financial fields", () => {
  expect(reportSummary({headers:["Pedido","Situação"],rows:[["#01","Parcial"]]}).headers).toEqual(["Pedido","Situação"]);
});

it("paginates long lists and unusually long cells without dropping the last row", () => {
  const rows=Array.from({length:100},(_,index)=>[String(index), index===99?"FINAL_MARKER":"Produto ".repeat(50)]);
  const pdf=buildReportSummaryPdf({headers:["Pedido","Produtos"],rows},{title:"Lista de teste"});
  expect(pdf.getNumberOfPages()).toBeGreaterThan(1);
  expect(pdf.output()).toContain("FINAL_MARKER");
});

it("creates a branded PDF preview with all grouped values", () => {
  const headers=["Pedido","Data","Cliente","Vendedor","Situação","Data(s) do pagamento","Produtos","Unidades",... ["Total","Pago","A receber","Frete"].flatMap(label=>["BRL","USD","PYG"].map(currency=>`${label} ${currency}`)),"Estoque","Rastreio"];
  const row=["#02.3","14/08/2026","Cliente exemplo","Vendedor exemplo","Pagamento parcial","11/09/2026","Produto A | Produto B",10,...Array.from({length:4},()=>["R$ 5.680,00","$ 1,096.55","Gs. 8.000.000"]).flat(),"Principal","Aguardando"];
  const pdf=buildReportSummaryPdf(reportSummary({headers,rows:Array.from({length:12},(_,index)=>[...row.slice(0,0),`#${index+1}.3`,...row.slice(1)]),highlights:[{label:"Pedidos",value:"12"},{label:"Valor total",value:"R$ 68.160,00 | USD 13,158.60 | PYG 96.000.000"}]}),{title:"Relatório - Pagamento parcial",filters:["Base: filtros da tela | Vendedor: Todos | Situação: Pagamento parcial"]});
  expect(pdf.output()).toContain("sistemaintegral");
  writeFileSync("/tmp/report-summary-preview.pdf",Buffer.from(pdf.output("arraybuffer")));
});
