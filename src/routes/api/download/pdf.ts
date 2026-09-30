import { createFileRoute } from "@tanstack/react-router";

const MAX_PDF_SIZE = 4 * 1024 * 1024;

function safeFilename(value: string) {
  const cleaned = value
    .replace(/[\r\n"\\/]+/g, "-")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  const name = cleaned || "documento.pdf";
  return name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`;
}

export const Route = createFileRoute("/api/download/pdf")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestUrl = new URL(request.url);
        const origin = request.headers.get("origin");
        if (!origin || origin !== requestUrl.origin) {
          return new Response("Origem não autorizada.", { status: 403 });
        }

        const formData = await request.formData();
        const file = formData.get("file");
        if (!(file instanceof File)) {
          return new Response("Arquivo PDF não informado.", { status: 400 });
        }
        if (file.size <= 0 || file.size > MAX_PDF_SIZE) {
          return new Response("Tamanho de PDF inválido.", { status: 413 });
        }

        const bytes = new Uint8Array(await file.arrayBuffer());
        const signature = new TextDecoder().decode(bytes.slice(0, 5));
        if (file.type !== "application/pdf" || signature !== "%PDF-") {
          return new Response("O arquivo informado não é um PDF válido.", { status: 415 });
        }

        const filename = safeFilename(file.name);
        return new Response(bytes, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Cache-Control": "no-store, max-age=0",
            "X-Content-Type-Options": "nosniff",
          },
        });
      },
    },
  },
});
