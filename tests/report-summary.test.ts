import { expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { reportSummary } from "../src/lib/report-summary";
import { buildReportSummaryPdf } from "../src/lib/report-summary-pdf";

const original = {
 headers: ["Pedido", "Cliente", "Total BRL", "Pago BRL", "A receber BRL", "A receber USD", "A pagar BRL", "Custo BRL"],
 rows: [["#02.3", "Cliente exemplo", "TOTAL_PRIVATE", "PAID_SENTINEL", "R$ 500,00", "$ 100.00", "R$ 80,00", "COST_PRIVATE"]],
 highlights: [{label:"Valor total",value:"TOTAL_HIGHLIGHT"}],
 sections: [{title:"Detalhes",headers:["Item"],rows:[["Detalhe completo"]]}],
};
it("exports exactly receivable and payable balances without mutating the complete report", () => {
 const before=JSON.stringify(original), summary=reportSummary(original);
 expect(summary.headers).toEqual(["A receber", "A pagar"]);
 expect(summary.rows).toEqual([["BRL: R$ 500,00\nUSD: $ 100.00", "BRL: R$ 80,00"]]);
 expect(summary.highlights).toEqual([]);expect(summary.sections).toEqual([]);expect(summary.pdfDocument).toBeUndefined();
 for(const value of ["PAID_SENTINEL", "TOTAL_PRIVATE", "COST_PRIVATE", "Cliente exemplo", "TOTAL_HIGHLIGHT"]) expect(JSON.stringify(summary)).not.toContain(value);
 expect(JSON.stringify(original)).toBe(before);
});
it("shows missing payable as unavailable instead of using paid amounts", () => {
 const summary=reportSummary({headers:["Pago BRL", "A receber BRL"],rows:[["R$ 100,00", "R$ 50,00"]]});
 expect(summary.headers).toEqual(["A receber", "A pagar"]);
 expect(summary.rows).toEqual([["BRL: R$ 50,00", "—"]]);
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
