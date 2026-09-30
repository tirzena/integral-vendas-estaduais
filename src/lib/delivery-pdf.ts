import { formatDate } from "@/lib/format";
import { jsPDF } from "jspdf";
import { downloadPdfBlob } from "@/lib/csv";

export type DeliveryPdfItem = {
  description: string;
  quantity: number;
  unit?: string | null;
};

export type DeliveryPdfData = {
  orderNumber: string;
  status: string;
  seller?: string | null;
  recipient?: string | null;
  recipientDocument?: string | null;
  pickup?: string | null;
  destination?: string | null;
  destinationCep?: string | null;
  notes?: string | null;
  deadline?: string | null;
  carrier?: string | null;
  trackingCode?: string | null;
  confirmationUrl?: string | null;
  items: DeliveryPdfItem[];
};

const present = (value?: string | null) => value?.trim() || "Não informado";

function dateLabel(value?: string | null) {
  if (!value) return "Não informada";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return formatDate(value);
}

function filePart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "pedido";
}

/** Gera a ordem operacional em PDF sem expor cliente, preços ou dados financeiros. */
export async function downloadDeliveryPdf(data: DeliveryPdfData) {
  const qrCodeModule = await import("qrcode");
  const QRCode = qrCodeModule.default;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  let y = 18;

  const ensureSpace = (height: number) => {
    if (y + height <= pageHeight - 18) return;
    doc.addPage();
    y = 18;
  };

  const writeField = (label: string, value?: string | null) => {
    const lines = doc.splitTextToSize(present(value), contentWidth - 4);
    const height = 8 + lines.length * 5;
    ensureSpace(height);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(label.toUpperCase(), margin, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(20);
    doc.text(lines, margin, y);
    y += lines.length * 5 + 5;
  };

  doc.setFillColor(26, 188, 120);
  doc.roundedRect(margin, y, 24, 2.5, 1.2, 1.2, "F");
  y += 12;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(20);
  doc.text("ORDEM DE ENTREGA", margin, y);
  doc.setFontSize(12);
  doc.text(data.orderNumber, pageWidth - margin, y, { align: "right" });
  y += 8;
  doc.setDrawColor(220);
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;

  writeField("Status da entrega", data.status);
  writeField("Vendedor responsável", data.seller);
  writeField("Quem receberá", data.recipient);
  writeField("CPF ou documento do destinatário", data.recipientDocument);
  writeField("Retirar em", data.pickup);
  writeField("Entregar em", data.destination);
  writeField("CEP de entrega", data.destinationCep);
  writeField("Previsão de entrega", dateLabel(data.deadline));
  writeField("Transportadora", data.carrier);
  writeField("Código de rastreio", data.trackingCode);
  writeField("Observações", data.notes);

  ensureSpace(22);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Produtos para entrega", margin, y);
  y += 7;
  doc.setFillColor(243, 244, 246);
  doc.rect(margin, y, contentWidth, 9, "F");
  doc.setFontSize(9);
  doc.text("PRODUTO", margin + 3, y + 6);
  doc.text("QUANTIDADE", pageWidth - margin - 3, y + 6, { align: "right" });
  y += 9;

  for (const item of data.items) {
    const description = item.description?.trim() || "Produto sem descrição";
    const quantity = `${Number(item.quantity || 0).toLocaleString("pt-BR")} ${item.unit || "UN"}`;
    const descriptionLines = doc.splitTextToSize(description, contentWidth - 55);
    const rowHeight = Math.max(10, descriptionLines.length * 5 + 5);
    ensureSpace(rowHeight);
    doc.setDrawColor(225);
    doc.line(margin, y, pageWidth - margin, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(descriptionLines, margin + 3, y + 6);
    doc.setFont("helvetica", "bold");
    doc.text(quantity, pageWidth - margin - 3, y + 6, { align: "right" });
    y += rowHeight;
  }

  if (data.confirmationUrl) {
    ensureSpace(58);
    y += 6;
    doc.setDrawColor(220);
    doc.roundedRect(margin, y, contentWidth, 48, 3, 3);
    const qrDataUrl = await QRCode.toDataURL(data.confirmationUrl, {
      errorCorrectionLevel: "H",
      margin: 1,
      width: 320,
    });
    doc.addImage(qrDataUrl, "PNG", margin + 5, y + 5, 38, 38);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Confirmação da entrega", margin + 49, y + 11);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const instructions = doc.splitTextToSize(
      "Leia o QR Code com o acesso autorizado para registrar a entrega no sistema.",
      contentWidth - 57,
    );
    doc.text(instructions, margin + 49, y + 18);
    doc.setTextColor(30, 110, 85);
    const linkLines = doc.splitTextToSize(data.confirmationUrl, contentWidth - 57);
    doc.text(linkLines, margin + 49, y + 31);
    doc.link(margin + 49, y + 27, contentWidth - 57, 14, { url: data.confirmationUrl });
    doc.setTextColor(20);
    y += 53;
  }

  const generatedAt = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date());
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`Gerado em ${generatedAt}`, margin, pageHeight - 8);
    doc.text(`Página ${page} de ${pageCount}`, pageWidth - margin, pageHeight - 8, {
      align: "right",
    });
  }

  downloadPdfBlob(doc.output("blob"), `ordem-entrega-${filePart(data.orderNumber)}.pdf`);
}
