import { jsPDF } from "jspdf";
import { formatMoney, type Currency } from "./format";

export function cashReceiptForSignature(input: {
  orderNumber: string;
  customer: string;
  amount: number;
  currency: Currency;
  date: string;
  reference: string;
}) {
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text("Recibo de recebimento em dinheiro", 20, 25);
  doc.setFontSize(11);
  const lines = [
    `Pedido: #${input.orderNumber}`,
    `Cliente: ${input.customer || "Conforme pedido"}`,
    `Valor recebido: ${formatMoney(input.amount, input.currency)}`,
    `Data: ${input.date.split("-").reverse().join("/")}`,
    `Referência: ${input.reference}`,
  ];
  lines.forEach((line, i) => doc.text(doc.splitTextToSize(line, 170), 20, 42 + i * 12));
  doc.text(
    doc.splitTextToSize(
      "Declaramos o recebimento do valor acima em dinheiro, referente ao pedido identificado. Após as assinaturas, anexe este recibo ao lançamento para conferência financeira.",
      170,
    ),
    20,
    112,
  );
  doc.line(25, 160, 185, 160);
  doc.text("Vendedor / responsável pelo recebimento", 105, 168, { align: "center" });
  doc.line(25, 205, 185, 205);
  doc.text("Financeiro ou administrador / conferência", 105, 213, { align: "center" });
  doc.setFontSize(9);
  doc.text("Este recibo precisa ser assinado e conferido para comprovar o recebimento.", 20, 250);
  doc.save(`recibo-pedido-${input.orderNumber}.pdf`);
}

export function memberReceiptForSignature(input: {
  member: string;
  amount: number;
  currency: Currency;
  date: string;
  reference: string;
  description: string;
}) {
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text("Recibo de pagamento ao membro", 20, 25);
  doc.setFontSize(11);
  const lines = [
    `Membro: ${input.member}`,
    `Valor recebido: ${formatMoney(input.amount, input.currency)}`,
    `Data: ${input.date?.split("-").reverse().join("/") ?? "Conforme registro"}`,
    `Referência: ${input.reference}`,
  ];
  let y = 45;
  const write = (text: string) => {
    for (const line of doc.splitTextToSize(text, 170) as string[]) {
      if (y > 268) {
        doc.addPage();
        y = 25;
      }
      doc.text(line, 20, y);
      y += 6;
    }
    y += 5;
  };
  lines.forEach(write);
  write(`Referente a: ${input.description || "Pagamento registrado na folha"}`);
  write(
    "Declaro ter recebido o valor acima, referente ao pagamento identificado. Este recibo assinado deve ser anexado ao registro correspondente no sistema.",
  );
  if (y + 100 > 275) {
    doc.addPage();
    y = 30;
  }
  doc.line(25, y + 30, 185, y + 30);
  doc.text("Assinatura do membro / recebedor", 105, y + 38, { align: "center" });
  doc.line(25, y + 75, 185, y + 75);
  doc.text("Responsável pelo pagamento", 105, y + 83, { align: "center" });
  doc.save(`recibo-membro-${input.reference.slice(0, 8)}.pdf`);
}
