/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { ShieldCheck, Download, Pause, Play, Search } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/useAuth";
import {
  getAuthenticityAdmin,
  getAuthenticityLabels,
  setAuthenticityActive,
} from "@/lib/authenticity.functions";
import { formatBoxCode, type AuthenticityBatch } from "@/lib/authenticity";
import { downloadAuthenticityLabels } from "@/lib/authenticity-labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/common/PageHeader";
export const Route = createFileRoute("/_authenticated/autenticidade")({
  component: AuthenticityAdmin,
  validateSearch: (search: Record<string, unknown>) => ({
    purchaseId: typeof search["purchaseId"] === "string" ? search["purchaseId"] : undefined,
    batchId: typeof search["batchId"] === "string" ? search["batchId"] : undefined,
  }),
});
function AuthenticityAdmin() {
  const { isAdmin } = useCurrentUser();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { batchId } = Route.useSearch();
  const [codeSearch, setCodeSearch] = useState("");
  const [codePage, setCodePage] = useState(0);
  const codes = useQuery({
    queryKey: ["authenticity-codes", batchId],
    queryFn: () => getAuthenticityLabels({ data: { batchId: batchId! } }),
    enabled: isAdmin && !!batchId,
    retry: false,
  });
  const [selected, setSelected] = useState<AuthenticityBatch | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ["authenticity-admin", batchId],
    queryFn: () => getAuthenticityAdmin({ data: { batchId } }),
    enabled: isAdmin,
    retry: false,
  });
  const url = (b: AuthenticityBatch) => `${window.location.origin}/verificar/${b.id}`;
  const toggle = useMutation({
    mutationFn: (b: AuthenticityBatch) =>
      setAuthenticityActive({ data: { batchId: b.id, active: !b.active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["authenticity-admin"] }),
    onError: (e) => toast.error(e.message),
  });
  async function exportCodes(batch: AuthenticityBatch, pdf: boolean) {
    setBusy(true);
    try {
      const rows = await getAuthenticityLabels({ data: { batchId: batch.id } });
      if (pdf) await downloadAuthenticityLabels(batch, rows, url(batch));
      else {
        const csv =
          "unidade,lote,codigo,link,primeira_validacao\r\n" +
          rows
            .map((r: any) =>
              [
                r.serial,
                batch.lot_number,
                formatBoxCode(r.print_code),
                url(batch),
                r.first_validated_at ?? "",
              ]
                .map((v) => '"' + String(v).replaceAll('"', '""') + '"')
                .join(","),
            )
            .join("\r\n");
        const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
        const link = document.createElement("a");
        const object = URL.createObjectURL(blob);
        link.href = object;
        link.download = `codigos-${batch.id}.csv`;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(object), 30000);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Exportação indisponível.");
    } finally {
      setBusy(false);
    }
  }
  if (!isAdmin) return <p>Controle de autenticidade disponível apenas à administração.</p>;
  const batches = (query.data?.batches ?? []) as AuthenticityBatch[];

  const attempts = query.data?.attempts ?? [];
  return (
    <div className="space-y-6">
      <PageHeader
        title={
          batchId
            ? `Lote ${batches.find((b) => b.id === batchId)?.lot_number ?? ""}`
            : "Controle de falsificação"
        }
        description="Lotes, códigos exclusivos por caixinha e histórico de validação."
        actions={
          <Button onClick={() => navigate({ to: "/fornecedores" })}>
            Registrar lote no fornecedor
          </Button>
        }
      />
      {batchId && (
        <Button variant="outline" onClick={() => navigate({ to: "/autenticidade", search: {} })}>
          Voltar aos lotes
        </Button>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Lotes", batches.length],
          ["Caixinhas registradas", batches.reduce((n, b) => n + b.quantity, 0)],
          ["Lotes ativos", batches.filter((b) => b.active).length],
        ].map(([name, value]) => (
          <div key={String(name)} className="rounded-2xl border bg-card p-5">
            <ShieldCheck className="mb-3 text-emerald-500" />
            <p className="text-sm text-muted-foreground">{name}</p>
            <strong className="text-3xl">{Number(value).toLocaleString("pt-BR")}</strong>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Search className="size-4" />
        <Input
          aria-label="Buscar lote"
          placeholder="Buscar por lote ou produto"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {query.isPending ? (
        <p>Carregando…</p>
      ) : query.isError ? (
        <p role="alert">{query.error.message}</p>
      ) : batches.length === 0 ? (
        <p>
          Nenhum lote registrado. Cadastre a compra de lote na ficha do fornecedor. Ele aparecerá
          aqui automaticamente, com QR Code e códigos para todas as unidades.
        </p>
      ) : (
        batches
          .filter((b) => !batchId || b.id === batchId)
          .filter((b) =>
            `${b.lot_number} ${b.product_name}`.toLowerCase().includes(search.toLowerCase()),
          )
          .map((b) => (
            <div
              key={b.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-card p-5"
            >
              <div>
                <h2 className="font-bold">
                  {b.product_name} · {b.lot_number}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {b.quantity.toLocaleString("pt-BR")} unidades · {b.active ? "Ativo" : "Suspenso"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Fabricação {b.manufacture_date.slice(0, 7)} · validade {b.expiry_date.slice(0, 7)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {!batchId && (
                  <Button
                    onClick={() => {
                      setCodePage(0);
                      setCodeSearch("");
                      navigate({ to: "/autenticidade", search: { batchId: b.id } });
                    }}
                  >
                    Abrir lote e códigos
                  </Button>
                )}
                <Button variant="outline" onClick={() => setSelected(b)}>
                  QR Code
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => exportCodes(b, false)}>
                  <Download className="mr-2 size-4" />
                  Códigos CSV
                </Button>
                <Button disabled={busy} onClick={() => exportCodes(b, true)}>
                  Etiquetas PDF
                </Button>
                <Button
                  variant="outline"
                  disabled={toggle.isPending}
                  onClick={() => toggle.mutate(b)}
                >
                  {b.active ? <Pause className="mr-2 size-4" /> : <Play className="mr-2 size-4" />}
                  {b.active ? "Suspender" : "Ativar"}
                </Button>
              </div>
            </div>
          ))
      )}
      {batchId && batches.some((b) => b.id === batchId) && (
        <section className="space-y-4 rounded-2xl border bg-card p-5">
          <h2 className="font-bold">QR Code e códigos deste lote</h2>
          <div className="w-fit rounded-xl bg-white p-4">
            <QRCodeSVG value={url(batches.find((b) => b.id === batchId)!)} size={200} level="M" />
          </div>
          <p className="break-all text-sm">{url(batches.find((b) => b.id === batchId)!)}</p>
          <Input
            aria-label="Buscar código do lote"
            placeholder="Buscar código ou número da unidade"
            value={codeSearch}
            onChange={(e) => {
              setCodeSearch(e.target.value);
              setCodePage(0);
            }}
          />
          {codes.isPending ? (
            <p>Carregando códigos…</p>
          ) : codes.isError ? (
            <p role="alert">{codes.error.message}</p>
          ) : (
            (() => {
              const rows = (codes.data ?? []).filter((r: any) =>
                `${r.serial} ${formatBoxCode(r.print_code)} ${r.print_code}`
                  .toLowerCase()
                  .includes(codeSearch.toLowerCase()),
              );
              return (
                <>
                  <div className="overflow-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr>
                          <th className="p-2">Unidade</th>
                          <th className="p-2">Código exclusivo</th>
                          <th className="p-2">Validação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.slice(codePage * 50, (codePage + 1) * 50).map((r: any) => (
                          <tr key={r.serial} className="border-t">
                            <td className="p-2">{r.serial}</td>
                            <td className="p-2 font-mono whitespace-nowrap">
                              {formatBoxCode(r.print_code)}
                            </td>
                            <td className="p-2">
                              {r.first_validated_at
                                ? new Date(r.first_validated_at).toLocaleString("pt-BR", {
                                    timeZone: "America/Sao_Paulo",
                                  }) + " (Brasília)"
                                : "Não utilizado"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {rows.length === 0 && <p>Nenhum código encontrado.</p>}
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      disabled={codePage === 0}
                      onClick={() => setCodePage(codePage - 1)}
                    >
                      Anterior
                    </Button>
                    <span>
                      Página {codePage + 1} de {Math.max(1, Math.ceil(rows.length / 50))} ·{" "}
                      {rows.length.toLocaleString("pt-BR")} códigos
                    </span>
                    <Button
                      variant="outline"
                      disabled={(codePage + 1) * 50 >= rows.length}
                      onClick={() => setCodePage(codePage + 1)}
                    >
                      Próxima
                    </Button>
                  </div>
                </>
              );
            })()
          )}
        </section>
      )}
      {batchId && !query.isPending && !query.isError && !batches.some((b) => b.id === batchId) && (
        <p role="alert">Lote não encontrado.</p>
      )}
      <section className="rounded-2xl border bg-card p-5">
        <h2 className="mb-4 font-bold">
          Últimas consultas{batchId ? " deste lote" : " (até 100)"}
        </h2>
        {attempts.filter((a: any) => !batchId || a.batch_id === batchId).length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem consultas.</p>
        ) : (
          <div className="max-h-80 overflow-auto">
            {attempts
              .filter((a: any) => !batchId || a.batch_id === batchId)
              .map((a: any) => (
                <div key={a.id} className="flex justify-between gap-3 border-b py-2 text-sm">
                  <span>{batches.find((b) => b.id === a.batch_id)?.lot_number ?? "Lote"}</span>
                  <span>
                    {a.result === "registered"
                      ? "Primeira validação"
                      : a.result === "already_used"
                        ? "Código já utilizado"
                        : "Código não encontrado"}
                  </span>
                  <time>{new Date(a.created_at).toLocaleString("pt-BR")}</time>
                </div>
              ))}
          </div>
        )}
      </section>
      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>QR Code do lote {selected?.lot_number}</DialogTitle>
          </DialogHeader>
          {selected && (
            <>
              <div className="mx-auto rounded-xl bg-white p-4">
                <QRCodeSVG id="batch-qr" value={url(selected)} size={240} level="M" />
              </div>
              <p className="break-all text-sm">{url(selected)}</p>
              <Button
                onClick={() => {
                  const svg = document.getElementById("batch-qr");
                  if (!svg) return;
                  const blob = new Blob([new XMLSerializer().serializeToString(svg)], {
                    type: "image/svg+xml",
                  });
                  const obj = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = obj;
                  a.download = `qr-${selected.id}.svg`;
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(obj), 30000);
                }}
              >
                Baixar QR Code SVG
              </Button>
              <p className="text-xs text-muted-foreground">
                Imprima o código individual em área protegida ou lacrada. O QR é compartilhado pelo
                lote e não contém o segredo da caixinha.
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
