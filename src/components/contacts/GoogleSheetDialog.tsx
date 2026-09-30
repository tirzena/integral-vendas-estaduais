/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Link2, Save, Plus, Trash2, Download } from "lucide-react";
import {
  linkContactSheet,
  readGoogleSheet,
  syncContactSheet,
  writeGoogleSheet,
  type SheetData,
} from "@/lib/sheets.functions";
import { Button } from "@/components/ui/button";
import { GoogleSheetsConnection } from "@/components/common/GoogleSheetsConnection";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  listId: string | null;
};

export function GoogleSheetDialog({ open, onOpenChange, listId }: Props) {
  const read = useServerFn(readGoogleSheet);
  const write = useServerFn(writeGoogleSheet);
  const link = useServerFn(linkContactSheet);
  const sync = useServerFn(syncContactSheet);

  const [url, setUrl] = useState("");
  const [sheet, setSheet] = useState<SheetData | null>(null);
  const [grid, setGrid] = useState<string[][]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);

  async function load(tab?: string) {
    if (!url.trim()) return void toast.error("Cole o link da planilha do Google.");
    setLoading(true);
    try {
      const data = await read({ data: { url: url.trim(), ...(tab ? { tab } : {}) } });
      setSheet(data);
      const width = Math.max(1, ...data.values.map((r) => r.length));
      setGrid(data.values.map((r) => [...r, ...Array(Math.max(0, width - r.length)).fill("")]));
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível abrir a planilha.");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!sheet) return;
    setSaving(true);
    try {
      await write({ data: { spreadsheetId: sheet.spreadsheetId, tab: sheet.tab, values: grid } });
      toast.success("Alterações salvas na planilha do Google.");
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível salvar no Google.");
    } finally {
      setSaving(false);
    }
  }

  async function linkAndSync() {
    if (!sheet || !listId) return void toast.error("Escolha uma lista antes de vincular.");
    setSaving(true);
    try {
      await link({
        data: { listId, spreadsheetId: sheet.spreadsheetId, title: sheet.title, tab: sheet.tab },
      });
      await sync({ data: { listId } });
      toast.success("Planilha vinculada. A lista e o Google estão sincronizados.");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível vincular a planilha.");
    } finally {
      setSaving(false);
    }
  }

  function setCell(r: number, c: number, value: string) {
    setGrid((g) =>
      g.map((row, i) => (i === r ? row.map((cell, j) => (j === c ? value : cell)) : row)),
    );
  }

  const width = grid[0]?.length ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Planilha do Google</DialogTitle>
          <DialogDescription>
            Cole o link, visualize e edite aqui. Ao salvar, as mudanças vão direto para a planilha
            no Google. A planilha precisa estar compartilhada com a conta Google indicada abaixo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <GoogleSheetsConnection onConnectedChange={setGoogleConnected} />
          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="grid gap-1">
              <Label>Link da planilha</Label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                disabled={!googleConnected}
              />
            </div>
            <Button onClick={() => void load()} disabled={loading || !googleConnected}>
              {loading ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Link2 className="mr-2 size-4" />
              )}
              Abrir
            </Button>
          </div>

          {sheet && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{sheet.title}</span>
                {sheet.tabs.length > 1 && (
                  <Select value={sheet.tab} onValueChange={(v) => void load(v)}>
                    <SelectTrigger className="w-48">
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
                )}
                <div className="ml-auto flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setGrid((g) => [...g, Array(Math.max(1, width)).fill("")])}
                  >
                    <Plus className="mr-2 size-4" /> Nova linha
                  </Button>
                  <Button variant="outline" onClick={() => void save()} disabled={saving}>
                    {saving ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 size-4" />
                    )}
                    Salvar no Google
                  </Button>
                  <Button onClick={() => void linkAndSync()} disabled={saving || !listId}>
                    <Download className="mr-2 size-4" /> Vincular e sincronizar
                  </Button>
                </div>
              </div>

              <div className="max-h-[50vh] overflow-auto rounded-lg border">
                <table className="w-full text-sm">
                  <tbody>
                    {grid.map((row, r) => (
                      <tr key={r} className={r === 0 ? "bg-muted/60 font-medium" : ""}>
                        <td className="w-10 border-r px-2 text-center text-xs text-muted-foreground">
                          {r === 0 ? "" : r}
                        </td>
                        {row.map((cell, c) => (
                          <td key={c} className="border-r p-0 last:border-r-0">
                            <input
                              value={cell}
                              onChange={(e) => setCell(r, c, e.target.value)}
                              className="w-full bg-transparent px-2 py-1 outline-none focus:bg-accent/40"
                            />
                          </td>
                        ))}
                        <td className="w-10 text-center">
                          {r > 0 && (
                            <button
                              type="button"
                              aria-label="Remover linha"
                              className="text-muted-foreground hover:text-destructive"
                              onClick={() => setGrid((g) => g.filter((_, i) => i !== r))}
                            >
                              <Trash2 className="size-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
