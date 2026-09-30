import { jsPDF } from "jspdf";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { BarChart3, Download, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { downloadCsv, downloadPdfBlob, stamp } from "@/lib/csv";
import { downloadOrdersReportPdf, type OrdersPdfDocument } from "@/lib/orders-report-pdf";

export type ReportSection = {
  title: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
};
import { SheetLinkExportButton } from "@/components/common/SheetLink";

export type ReportData = {
  /** Cartões de resumo mostrados acima da tabela. */
  highlights?: { label: string; value: string }[];
  headers: string[];
  rows: (string | number | null | undefined)[][];
  sections?: ReportSection[];
  pdfDocument?: OrdersPdfDocument;
};

type Props = {
  title: string;
  description?: string;
  filename: string;
  build: () => ReportData;
  label?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  filters?: ReactNode;
  refreshKey?: string;
};

/** Botão de relatório: abre um resumo na tela e permite baixar a planilha. */
export function ReportButton({
  title,
  description,
  filename,
  build,
  label = "Relatórios",
  variant = "outline",
  filters,
  refreshKey,
}: Props) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ReportData | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const buildRef = useRef(build);
  buildRef.current = build;

  useEffect(() => {
    if (!open || refreshKey === undefined) return;
    try {
      setData(buildRef.current());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o relatório.");
    }
  }, [open, refreshKey]);

  function openReport() {
    try {
      setData(build());
      setOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o relatório.");
    }
  }

  function exportCsv() {
    const current = build();
    const sectionRows = (current.sections ?? []).flatMap((section) => [
      [],
      [section.title],
      section.headers,
      ...section.rows,
    ]);
    downloadCsv(`${filename}-${stamp()}.csv`, [current.headers, ...current.rows, ...sectionRows]);
  }

  async function exportPdf() {
    setExportingPdf(true);
    try {
      const current = build();
      if (current.pdfDocument) {
        downloadOrdersReportPdf(current.pdfDocument, filename);
        return;
      }
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 12;
      const contentWidth = pageWidth - margin * 2;
      let y = margin;

      const addPageIfNeeded = (height: number) => {
        if (y + height <= pageHeight - margin) return;
        pdf.addPage();
        y = margin;
      };
      const addWrappedText = (value: string, fontSize = 8, gap = 2) => {
        pdf.setFontSize(fontSize);
        const lines = pdf.splitTextToSize(value, contentWidth) as string[];
        const height = Math.max(1, lines.length) * (fontSize * 0.4) + gap;
        addPageIfNeeded(height);
        pdf.text(lines, margin, y);
        y += height;
      };

      pdf.setFont("helvetica", "bold");
      addWrappedText(title, 16, 4);
      pdf.setFont("helvetica", "normal");
      if (description) addWrappedText(description, 9, 4);
      if (current.highlights?.length) {
        addWrappedText(
          current.highlights.map((item) => `${item.label}: ${item.value}`).join("   |   "),
          9,
          4,
        );
      }

      pdf.setFont("helvetica", "bold");
      addWrappedText(current.headers.join(" | "), 8, 3);
      pdf.setFont("helvetica", "normal");
      for (const row of current.rows) {
        addWrappedText(row.map((cell) => String(cell ?? "—")).join(" | "), 7, 2);
        pdf.setDrawColor(225);
        pdf.line(margin, y - 1, pageWidth - margin, y - 1);
      }
      for (const section of current.sections ?? []) {
        addPageIfNeeded(14);
        y += 3;
        pdf.setFont("helvetica", "bold");
        addWrappedText(section.title, 11, 3);
        addWrappedText(section.headers.join(" | "), 8, 3);
        pdf.setFont("helvetica", "normal");
        for (const row of section.rows) {
          addWrappedText(row.map((cell) => String(cell ?? "—")).join(" | "), 7, 2);
          pdf.setDrawColor(225);
          pdf.line(margin, y - 1, pageWidth - margin, y - 1);
        }
      }

      const pageCount = pdf.getNumberOfPages();
      for (let page = 1; page <= pageCount; page += 1) {
        pdf.setPage(page);
        pdf.setFontSize(7);
        pdf.setTextColor(120);
        pdf.text(`Página ${page} de ${pageCount}`, pageWidth - margin, pageHeight - 5, {
          align: "right",
        });
      }
      downloadPdfBlob(pdf.output("blob"), `${filename}-${stamp()}.pdf`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o PDF.");
    } finally {
      setExportingPdf(false);
    }
  }

  return (
    <>
      <Button variant={variant} onClick={openReport}>
        <BarChart3 className="mr-2 size-4" /> {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          {filters ? <div className="rounded-lg border bg-muted/30 p-3">{filters}</div> : null}

          {data?.highlights?.length ? (
            <div className="grid gap-3 sm:grid-cols-3">
              {data.highlights.map((h) => (
                <div key={h.label} className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">{h.label}</p>
                  <p className="font-display text-lg font-semibold break-words">{h.value}</p>
                </div>
              ))}
            </div>
          ) : null}

          {data
            ? [
                { title: "Resumo", headers: data.headers, rows: data.rows },
                ...(data.sections ?? []),
              ].map((section) => (
                <section key={section.title} className="space-y-2">
                  <h3 className="font-semibold">{section.title}</h3>
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {section.headers.map((h) => (
                            <TableHead key={h}>{h}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {section.rows.slice(0, 60).map((r, i) => (
                          <TableRow key={i}>
                            {r.map((cell, j) => (
                              <TableCell key={j}>{cell ?? "—"}</TableCell>
                            ))}
                          </TableRow>
                        ))}
                        {section.rows.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={Math.max(1, section.headers.length)}>
                              Sem dados para este relatório.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </section>
              ))
            : null}

          <div className="flex flex-wrap justify-end gap-2">
            <SheetLinkExportButton
              build={() => {
                const current = build();
                return [
                  current.headers,
                  ...current.rows,
                  ...(current.sections ?? []).flatMap((section) => [
                    [],
                    [section.title],
                    section.headers,
                    ...section.rows,
                  ]),
                ];
              }}
            />
            <Button variant="outline" onClick={() => void exportPdf()} disabled={exportingPdf}>
              {exportingPdf ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <FileText className="mr-2 size-4" />
              )}
              Baixar PDF
            </Button>
            <Button onClick={exportCsv}>
              <Download className="mr-2 size-4" /> Baixar planilha
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
