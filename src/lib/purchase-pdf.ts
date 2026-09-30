import { jsPDF } from "jspdf";
import { downloadPdfBlob } from "@/lib/csv";

export type PurchasePdfData = {
  number: number;
  status: string;
  supplier: Record<string, string | null | undefined>;
  buyer: Record<string, string | null | undefined>;
  warehouse: Record<string, string | null | undefined>;
  purchaseDate: string;
  dueDate?: string | null;
  currency: string;
  sourceOrder?: { number: number; revision_no?: number | null } | null;
  items: Array<{
    description: string;
    sku?: string | null;
    quantity: number;
    bonusQuantity: number;
    payableQuantity: number;
    unitCost: number;
    total: number;
  }>;
  merchandiseTotal: number;
  freightCost: number;
  variableCost: number;
  total: number;
  amountPaid: number;
  amountPayable: number;
  payments: Array<{
    installment: number;
    paidAt: string;
    method: string;
    amount: number;
    registeredBy?: string | null;
    reference?: string | null;
  }>;
  notes?: string | null;
  money: (value: number) => string;
};

const date = (value?: string | null) => {
  if (!value) return "Não informada";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(
    new Date(`${value}T12:00:00`),
  );
};

export async function downloadPurchasePdf(data: PurchasePdfData) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const width = pageWidth - margin * 2;
  let y = 17;

  const ensure = (height: number) => {
    if (y + height < pageHeight - 16) return;
    doc.addPage();
    y = 17;
  };
  const field = (label: string, value?: string | null) => {
    ensure(16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(label.toUpperCase(), margin, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(20);
    const lines = doc.splitTextToSize(value?.trim() || "Não informado", width);
    doc.text(lines, margin, y);
    y += lines.length * 5 + 5;
  };

  doc.setFillColor(26, 188, 120);
  doc.roundedRect(margin, y, 25, 2.5, 1.2, 1.2, "F");
  y += 12;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(20);
  doc.text("ORDEM DE COMPRA", margin, y);
  doc.setFontSize(13);
  doc.text(`#OC-${String(data.number).padStart(2, "0")}`, pageWidth - margin, y, {
    align: "right",
  });
  y += 8;
  doc.setDrawColor(220);
  doc.line(margin, y, pageWidth - margin, y);
  y += 9;

  field("Situação", data.status);
  if (data.sourceOrder) {
    field(
      "Pedido de venda vinculado",
      `#${String(data.sourceOrder.number).padStart(2, "0")}${
        Number(data.sourceOrder.revision_no ?? 1) > 1
          ? `.${Number(data.sourceOrder.revision_no) - 1}`
          : ""
      }`,
    );
  }
  field(
    "Fornecedor",
    [data.supplier.name, data.supplier.document, data.supplier.contact_name]
      .filter(Boolean)
      .join(" · "),
  );
  field(
    "Contato do fornecedor",
    [data.supplier.phone, data.supplier.email].filter(Boolean).join(" · "),
  );
  field("Endereço do fornecedor", data.supplier.address);
  field("Comprado por", [data.buyer.name, data.buyer.email].filter(Boolean).join(" · "));
  field(
    "Entrada no estoque",
    [data.warehouse.name, data.warehouse.address, data.warehouse.city, data.warehouse.state]
      .filter(Boolean)
      .join(" · "),
  );
  field("Datas", `Emissão: ${date(data.purchaseDate)} · Vencimento: ${date(data.dueDate)}`);

  ensure(20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Produtos comprados", margin, y);
  y += 7;
  doc.setFillColor(243, 244, 246);
  doc.rect(margin, y, width, 9, "F");
  doc.setFontSize(7.5);
  doc.text("PRODUTO", margin + 2, y + 6);
  doc.text("RECEBIDO", margin + 83, y + 6, { align: "right" });
  doc.text("BÔNUS", margin + 104, y + 6, { align: "right" });
  doc.text("PAGO", margin + 124, y + 6, { align: "right" });
  doc.text("CUSTO UNIT.", margin + 151, y + 6, { align: "right" });
  doc.text("TOTAL", pageWidth - margin - 2, y + 6, { align: "right" });
  y += 9;
  for (const item of data.items) {
    ensure(13);
    const name = doc.splitTextToSize(`${item.description}${item.sku ? ` · ${item.sku}` : ""}`, 72);
    const rowHeight = Math.max(11, name.length * 4 + 4);
    doc.setDrawColor(230);
    doc.line(margin, y, pageWidth - margin, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(name, margin + 2, y + 6);
    doc.text(item.quantity.toLocaleString("pt-BR"), margin + 83, y + 6, { align: "right" });
    doc.text(item.bonusQuantity.toLocaleString("pt-BR"), margin + 104, y + 6, {
      align: "right",
    });
    doc.text(item.payableQuantity.toLocaleString("pt-BR"), margin + 124, y + 6, {
      align: "right",
    });
    doc.text(data.money(item.unitCost), margin + 151, y + 6, { align: "right" });
    doc.text(data.money(item.total), pageWidth - margin - 2, y + 6, { align: "right" });
    y += rowHeight;
  }

  ensure(48);
  y += 4;
  const totals = [
    ["Produtos", data.merchandiseTotal],
    ["Frete", data.freightCost],
    ["Outros custos", data.variableCost],
    ["Total da compra", data.total],
    ["Total pago", data.amountPaid],
    ["Saldo a pagar", data.amountPayable],
  ] as const;
  for (const [label, value] of totals) {
    doc.setFont("helvetica", label === "Total da compra" ? "bold" : "normal");
    doc.setFontSize(label === "Total da compra" ? 10.5 : 9);
    doc.text(label, pageWidth - margin - 70, y);
    doc.text(data.money(value), pageWidth - margin, y, { align: "right" });
    y += 6;
  }

  if (data.payments.length) {
    ensure(18);
    y += 5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Pagamentos registrados", margin, y);
    y += 7;
    for (const payment of data.payments) {
      ensure(12);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      const detail = [
        `Parcela ${payment.installment}`,
        date(payment.paidAt),
        payment.method,
        data.money(payment.amount),
        payment.registeredBy ? `registrado por ${payment.registeredBy}` : null,
        payment.reference ? `ref. ${payment.reference}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      doc.text(doc.splitTextToSize(detail, width), margin, y);
      y += 8;
    }
  }

  if (data.notes) field("Observações", data.notes);

  const generatedAt = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date());
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`Gerado em ${generatedAt}`, margin, pageHeight - 8);
    doc.text(`Página ${page} de ${pages}`, pageWidth - margin, pageHeight - 8, { align: "right" });
  }

  downloadPdfBlob(
    doc.output("blob"),
    `ordem-compra-OC-${String(data.number).padStart(2, "0")}.pdf`,
  );
}
