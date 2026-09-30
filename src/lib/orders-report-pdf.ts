import { jsPDF } from "jspdf";
import { downloadPdfBlob, stamp } from "@/lib/csv";

export type OrderPdfRecord = {
  title: string;
  fields: { label: string; value: string }[];
  itemHeaders: string[];
  itemRows: string[][];
  summary: { label: string; value: string }[];
  notes?: string;
};

export type OrdersPdfDocument = {
  brand: string;
  company?: string;
  title: string;
  filters: string[];
  orders: OrderPdfRecord[];
};

/** Formato A4 dos documentos internos: cabeçalho, seções, itens e totais por pedido. */
export function downloadOrdersReportPdf(document: OrdersPdfDocument, filename: string) {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const left = 13;
  const width = pageWidth - left * 2;
  const bottom = pageHeight - 16;
  const navy: [number, number, number] = [19, 34, 51];
  let y = 36;

  const header = () => {
    pdf.setTextColor(...navy);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.text(document.brand || "OS", left, 16);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text(document.title, pageWidth - left, 14, { align: "right" });
    pdf.setDrawColor(...navy);
    pdf.setLineWidth(0.6);
    pdf.line(left, 23, pageWidth - left, 23);
    pdf.setTextColor(30, 41, 59);
    y = 36;
  };
  const nextPage = () => {
    pdf.addPage();
    header();
  };
  const space = (height: number) => {
    if (y + height > bottom) nextPage();
  };
  const section = (label: string) => {
    space(13);
    y += 3;
    pdf.setFillColor(241, 243, 246);
    pdf.roundedRect(left, y, width, 8, 1, 1, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(...navy);
    pdf.text(label, left + 3, y + 5.5);
    y += 12;
  };
  const paragraph = (value: string, fontSize = 9) => {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(fontSize);
    pdf.setTextColor(37, 48, 62);
    const lines = pdf.splitTextToSize(value || "—", width - 6) as string[];
    for (const line of lines) {
      space(5);
      pdf.text(line, left + 3, y + 3);
      y += 5;
    }
  };
  const fieldGrid = (fields: OrderPdfRecord["fields"]) => {
    const col = width / 2;
    for (let index = 0; index < fields.length; index += 2) {
      const pair = fields.slice(index, index + 2);
      const wraps = pair.map((field) =>
        pdf.splitTextToSize(field.value || "—", col - 10) as string[],
      );
      const height = Math.max(11, ...wraps.map((lines) => 7 + lines.length * 4));
      space(height + 2);
      pair.forEach((field, offset) => {
        const x = left + offset * col;
        pdf.setDrawColor(225, 229, 234);
        pdf.roundedRect(x, y, col - 2, height, 1, 1, "S");
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(7);
        pdf.setTextColor(105, 114, 126);
        pdf.text(field.label.toUpperCase(), x + 3, y + 4);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(8.5);
        pdf.setTextColor(30, 41, 59);
        pdf.text(wraps[offset], x + 3, y + 8.5);
      });
      y += height + 2;
    }
  };
  const itemsTable = (order: OrderPdfRecord) => {
    const hasCosts = order.itemHeaders.length === 6;
    const widths = hasCosts ? [58, 14, 29, 29, 27, 27] : [88, 20, 38, 38];
    const tableHeader = () => {
      space(9);
      pdf.setFillColor(241, 243, 246);
      pdf.rect(left, y, width, 8, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(7);
      pdf.setTextColor(...navy);
      let x = left;
      order.itemHeaders.forEach((label, index) => {
        pdf.text(label, index === 0 ? x + 2 : x + widths[index] - 2, y + 5, {
          align: index === 0 ? "left" : "right",
        });
        x += widths[index];
      });
      y += 8;
    };
    tableHeader();
    for (const row of order.itemRows) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.5);
      const wrapped = row.map((cell, index) =>
        pdf.splitTextToSize(cell || "—", widths[index] - 4) as string[],
      );
      const height = Math.max(9, ...wrapped.map((lines) => lines.length * 4 + 3));
      if (y + height > bottom) {
        nextPage();
        tableHeader();
      }
      pdf.setTextColor(36, 45, 57);
      let x = left;
      wrapped.forEach((lines, index) => {
        pdf.text(lines, index === 0 ? x + 2 : x + widths[index] - 2, y + 5, {
          align: index === 0 ? "left" : "right",
        });
        x += widths[index];
      });
      pdf.setDrawColor(225, 229, 234);
      pdf.line(left, y + height, left + width, y + height);
      y += height;
    }
    if (!order.itemRows.length) paragraph("Nenhum item neste pedido.");
  };

  header();
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(15);
  pdf.text(document.title, left, y);
  y += 7;
  if (document.company) paragraph(document.company, 8);
  paragraph(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 8);
  section("Filtros aplicados");
  paragraph(document.filters.length ? document.filters.join("   |   ") : "Todos os pedidos");
  paragraph(`${document.orders.length} pedido(s) no relatório`, 8);

  document.orders.forEach((order, index) => {
    if (index > 0) nextPage();
    section(order.title);
    fieldGrid(order.fields);
    section("Produtos e valores");
    itemsTable(order);
    section("Resumo financeiro");
    fieldGrid(order.summary);
    if (order.notes) {
      section("Observações");
      paragraph(order.notes);
    }
  });
  if (!document.orders.length) {
    section("Pedidos");
    paragraph("Nenhum pedido encontrado para os filtros selecionados.");
  }
  const count = pdf.getNumberOfPages();
  for (let page = 1; page <= count; page += 1) {
    pdf.setPage(page);
    pdf.setDrawColor(225, 229, 234);
    pdf.line(left, pageHeight - 13, pageWidth - left, pageHeight - 13);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(105, 114, 126);
    pdf.text("Relatório interno · OS", left, pageHeight - 9);
    pdf.text(`Página ${page} de ${count}`, pageWidth - left, pageHeight - 9, {
      align: "right",
    });
  }
  downloadPdfBlob(pdf.output("blob"), `${filename}-${stamp()}.pdf`);
}
