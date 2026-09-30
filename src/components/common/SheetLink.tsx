/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Link2, Loader2 } from "lucide-react";
import { readGoogleSheet, writeGoogleSheet, type SheetData } from "@/lib/sheets.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleSheetsConnection } from "@/components/common/GoogleSheetsConnection";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Cell = string | number | null | undefined;

const asText = (rows: Cell[][]) =>
  rows.map((r) => r.map((c) => (c === null || c === undefined ? "" : String(c))));

/** Envia os dados da tela direto para uma planilha do Google informada por link. */
export function SheetLinkExportButton({
  build,
  label = "Enviar para link",
  variant = "outline",
  size = "default",
}: {
  build: () => Cell[][];
  label?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm";
}) {
  const read = useServerFn(readGoogleSheet);
  const write = useServerFn(writeGoogleSheet);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [sheet, setSheet] = useState<SheetData | null>(null);
  const [tab, setTab] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);

  async function load() {
    if (!url.trim()) return void toast.error("Cole o link da planilha do Google.");
    setBusy(true);
    try {
      const data = await read({ data: { url: url.trim() } });
      setSheet(data);
      setTab(data.tab);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível abrir a planilha.");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!sheet) return;
    setBusy(true);
    try {
      const rows = asText(build());
      await write({
        data: { spreadsheetId: sheet.spreadsheetId, tab: tab || sheet.tab, values: rows },
      });
      toast.success("Dados enviados para a planilha do Google.");
      setOpen(false);
      setSheet(null);
      setUrl("");
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível salvar na planilha.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        <Link2 className="mr-1.5 size-4" /> {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Enviar para planilha do Google</DialogTitle>
            <DialogDescription>
              Cole o link de uma planilha do Google compartilhada com a conta conectada. O conteúdo
              da aba escolhida será substituído pelos dados desta tela.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <GoogleSheetsConnection onConnectedChange={setGoogleConnected} />
            <div>
              <Label>Link da planilha</Label>
              <div className="mt-1.5 flex gap-2">
                <Input
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={!googleConnected}
                />
                <Button variant="outline" onClick={load} disabled={busy || !googleConnected}>
                  {busy && <Loader2 className="mr-2 size-4 animate-spin" />} Abrir
                </Button>
              </div>
            </div>
            {sheet && (
              <div>
                <Label>Aba de destino</Label>
                <Select value={tab} onValueChange={setTab}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sheet.tabs.map((t) => (
                      <SelectItem key={t.title} value={t.title}>
                        {t.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={send} disabled={!sheet || busy}>
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />} Enviar dados
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Lê uma planilha do Google por link e devolve as linhas para a tela importar. */
export function SheetLinkImportButton({
  onRows,
  label = "Importar por link",
  variant = "outline",
  size = "default",
}: {
  onRows: (rows: string[][]) => Promise<void> | void;
  label?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm";
}) {
  const read = useServerFn(readGoogleSheet);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [sheet, setSheet] = useState<SheetData | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);

  async function load(tab?: string) {
    if (!url.trim()) return void toast.error("Cole o link da planilha do Google.");
    setBusy(true);
    try {
      const data = await read({ data: { url: url.trim(), ...(tab ? { tab } : {}) } });
      setSheet(data);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível abrir a planilha.");
    } finally {
      setBusy(false);
    }
  }

  async function importRows() {
    if (!sheet) return;
    setBusy(true);
    try {
      await onRows(sheet.values);
      setOpen(false);
      setSheet(null);
      setUrl("");
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível importar a planilha.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        <Link2 className="mr-1.5 size-4" /> {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Importar por link do Google</DialogTitle>
            <DialogDescription>
              Cole o link de uma planilha do Google compartilhada com a conta conectada. A primeira
              linha deve conter os títulos das colunas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <GoogleSheetsConnection onConnectedChange={setGoogleConnected} />
            <div className="flex gap-2">
              <Input
                placeholder="https://docs.google.com/spreadsheets/d/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={!googleConnected}
              />
              <Button variant="outline" onClick={() => load()} disabled={busy || !googleConnected}>
                {busy && <Loader2 className="mr-2 size-4 animate-spin" />} Abrir
              </Button>
            </div>
            {sheet && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{sheet.title}</span>
                  <Select value={sheet.tab} onValueChange={(v) => load(v)}>
                    <SelectTrigger className="h-8 w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {sheet.tabs.map((t) => (
                        <SelectItem key={t.title} value={t.title}>
                          {t.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground">
                    {Math.max(0, sheet.values.length - 1)} linhas de dados
                  </span>
                </div>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-xs">
                    <tbody>
                      {sheet.values.slice(0, 15).map((row, i) => (
                        <tr key={i} className={i === 0 ? "bg-muted font-medium" : ""}>
                          {row.map((cell, j) => (
                            <td key={j} className="border-b px-2 py-1 whitespace-nowrap">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={importRows} disabled={!sheet || busy}>
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />} Importar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
