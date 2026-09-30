/** Utilitários de exportação usados pelos relatórios e pelo catálogo. */

export function toCsv(rows: (string | number | null | undefined)[][]) {
  return rows
    .map((r) =>
      r
        .map((cell) => {
          const value = cell === null || cell === undefined ? "" : String(cell);
          return /[";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(";"),
    )
    .join("\n");
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/** Baixa o PDF localmente, sem navegar ou reenviar o relatório ao servidor. */
export function downloadPdfBlob(blob: Blob, filename: string) {
  downloadBlob(blob, filename);
}
function download(content: string, filename: string, mime: string) {
  const blob = new Blob(["\uFEFF" + content], { type: `${mime};charset=utf-8;` });
  downloadBlob(blob, filename);
}

export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  download(toCsv(rows), filename, "text/csv");
}

export function downloadText(filename: string, content: string) {
  download(content, filename, "text/plain");
}

export function stamp() {
  return new Date().toISOString().slice(0, 10);
}
