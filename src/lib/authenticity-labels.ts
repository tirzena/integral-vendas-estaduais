import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { downloadPdfBlob } from "@/lib/csv";
import { formatBoxCode, type AuthenticityBatch } from "./authenticity";
export async function downloadAuthenticityLabels(
  batch: AuthenticityBatch,
  rows: Array<{ serial: number; print_code: string }>,
  url: string,
) {
  const qr = await QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 2, width: 300 });
  // Keep print jobs manageable without truncating the batch.
  {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    rows.forEach((row, index) => {
      if (index > 0 && index % 24 === 0) doc.addPage();
      const position = index % 24;
      const x = 8 + (position % 3) * 66;
      const y = 8 + Math.floor(position / 3) * 35;
      doc.setDrawColor(160);
      doc.roundedRect(x, y, 63, 32, 2, 2);
      doc.addImage(qr, "PNG", x + 2, y + 3, 24, 24);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text(doc.splitTextToSize(batch.product_name, 32), x + 28, y + 6);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.text(`Lote: ${batch.lot_number}`, x + 28, y + 14);
      doc.text(`Unidade: ${row.serial}`, x + 28, y + 18);
      doc.setFontSize(5.8);
      doc.text(formatBoxCode(row.print_code), x + 2, y + 30);
    });
    downloadPdfBlob(doc.output("blob"), `etiquetas-${batch.id}.pdf`);
  }
}
