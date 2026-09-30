/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Atualizar estoque por texto: lê a lista diária do fornecedor, mostra tudo em
 * prévia (nada é ignorado em silêncio) e só aplica pelo servidor, em lote único.
 */
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Check, History, Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import {
  contentHash,
  matchRows,
  normalizeText,
  parseSupplierList,
  type Currency,
  type MatchedRow,
  type NumberFormat,
} from "@/lib/supplier-import";
import {
  applySupplierImport,
  getSupplierTemplate,
  listImportBatches,
  listSupplierMappings,
  saveSupplierMapping,
  saveSupplierTemplate,
  undoSupplierImport,
} from "@/lib/imports.functions";
import { useRows } from "@/lib/db";
import { useRates } from "@/hooks/useRates";
import { useBaseCurrency } from "@/hooks/useBaseCurrency";
import { formatMoney, formatNumber } from "@/lib/format";
import { CurrencyValues } from "@/components/common/CurrencyValues";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type QtyMode = "absoluto" | "entrada" | "disponibilidade" | "nenhum";
type ValueTarget = "custo" | "preco" | "nenhum";

const STATE_LABEL: Record<string, string> = {
  exata: "Correspondência exata",
  sugestao: "Sugestão — confirmar",
  ambigua: "Ambígua",
  nao_encontrada: "Produto não encontrado",
  invalida: "Linha inválida",
  duplicada: "Duplicada na lista",
  sem_valor: "Sem preço e sem quantidade",
};

const STATE_TONE: Record<string, string> = {
  exata: "bg-emerald-500/15 text-emerald-600",
  sugestao: "bg-amber-500/15 text-amber-600",
  ambigua: "bg-amber-500/15 text-amber-600",
  nao_encontrada: "bg-muted text-muted-foreground",
  invalida: "bg-destructive/15 text-destructive",
  duplicada: "bg-destructive/15 text-destructive",
  sem_valor: "bg-muted text-muted-foreground",
};

type RowUi = MatchedRow & { apply: boolean; overrideItemId: string | null; remember: boolean };

export function SupplierImportDialog({
  open,
  onOpenChange,
  items,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: any[];
}) {
  const queryClient = useQueryClient();
  const baseCurrency = useBaseCurrency();
  const { factors } = useRates();
  const suppliers = useRows("suppliers", {
    orderBy: { column: "name", ascending: true },
    limit: 300,
  });

  const apply = useServerFn(applySupplierImport);
  const undo = useServerFn(undoSupplierImport);
  const saveMapping = useServerFn(saveSupplierMapping);
  const loadMappings = useServerFn(listSupplierMappings);
  const loadTemplate = useServerFn(getSupplierTemplate);
  const storeTemplate = useServerFn(saveSupplierTemplate);
  const loadBatches = useServerFn(listImportBatches);

  const [supplierId, setSupplierId] = useState("");
  const [listCurrency, setListCurrency] = useState<Currency>("USD");
  const [numberFormat, setNumberFormat] = useState<NumberFormat>("auto");
  const [valueTarget, setValueTarget] = useState<ValueTarget>("custo");
  const [qtyMode, setQtyMode] = useState<QtyMode>("absoluto");
  const [applyMarkup, setApplyMarkup] = useState(false);
  const [priceLimit, setPriceLimit] = useState(30);
  const [qtyLimit, setQtyLimit] = useState(10000);
  const [text, setText] = useState("");
  const [rows, setRows] = useState<RowUi[] | null>(null);
  const [aliases, setAliases] = useState<any[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [batches, setBatches] = useState<any[] | null>(null);

  useEffect(() => {
    if (!baseCurrency.loading) setListCurrency((c) => c ?? baseCurrency.currency);
  }, [baseCurrency.loading, baseCurrency.currency]);

  useEffect(() => {
    if (!supplierId) {
      setAliases([]);
      return;
    }
    loadMappings({ data: { supplier_id: supplierId } })
      .then((r: any) => setAliases(r ?? []))
      .catch(() => setAliases([]));
    loadTemplate({ data: { supplier_id: supplierId } })
      .then((t: any) => {
        const cfg = t?.config;
        if (!cfg) return;
        if (cfg.listCurrency) setListCurrency(cfg.listCurrency);
        if (cfg.numberFormat) setNumberFormat(cfg.numberFormat);
        if (cfg.valueTarget) setValueTarget(cfg.valueTarget);
        if (cfg.qtyMode) setQtyMode(cfg.qtyMode);
        if (typeof cfg.applyMarkup === "boolean") setApplyMarkup(cfg.applyMarkup);
      })
      .catch(() => undefined);
  }, [supplierId, loadMappings, loadTemplate]);

  const matchItems = useMemo(
    () =>
      items.map((i: any) => ({
        id: i.id,
        name: i.name,
        sku: i.sku ?? null,
        barcode: i.barcode ?? null,
        variation: i.variation ?? null,
        quantity: Number(i.quantity ?? 0),
        cost: i.cost === null || i.cost === undefined ? null : Number(i.cost),
        price: i.price === null || i.price === undefined ? null : Number(i.price),
        currency: (i.currency ?? "USD") as Currency,
        product_id: i.product_id ?? null,
      })),
    [items],
  );
  const itemById = useMemo(() => new Map(matchItems.map((i) => [i.id, i])), [matchItems]);

  function analyse() {
    if (!supplierId) {
      toast.error("Selecione o fornecedor da lista.");
      return;
    }
    const parsed = parseSupplierList(text, { numberFormat, defaultCurrency: listCurrency });
    if (parsed.length === 0) {
      toast.info("Nenhuma linha para analisar.");
      return;
    }
    const matched = matchRows(parsed, matchItems, aliases as any);
    setRows(
      matched.map((r) => ({
        ...r,
        overrideItemId: null,
        remember: false,
        apply: r.state === "exata",
      })),
    );
  }

  function rowItem(r: RowUi) {
    const id = r.overrideItemId ?? r.itemId;
    return id ? (itemById.get(id) ?? null) : null;
  }

  function convertValue(value: number, to: Currency) {
    if (listCurrency === to) return value;
    const f = factors[`${listCurrency}-${to}`];
    return f ? value * f : null;
  }

  function rowWarnings(r: RowUi) {
    const item = rowItem(r);
    const warns = [...r.notes];
    if (!item) return warns;
    if (r.value !== null && r.value !== undefined) {
      const converted = convertValue(r.value, item.currency);
      if (converted === null) warns.push("Sem cotação disponível para converter");
      else {
        const previous = valueTarget === "custo" ? item.cost : item.price;
        if (previous && previous > 0) {
          const variation = Math.abs((converted - previous) / previous) * 100;
          if (variation > priceLimit) warns.push(`Variação de ${variation.toFixed(0)}% no valor`);
        }
        if (valueTarget === "custo" && item.price && converted > item.price) {
          warns.push("Custo informado maior que o preço de venda");
        }
        if (valueTarget === "preco" && item.cost && converted < item.cost) {
          warns.push("Preço de venda abaixo do custo");
        }
      }
    }
    if (r.qty !== null && r.qty !== undefined) {
      const target = qtyMode === "entrada" ? Number(item.quantity ?? 0) + r.qty : r.qty;
      if (target > qtyLimit) warns.push("Saldo resultante muito alto");
    }
    return warns;
  }

  const blockedStates = new Set([
    "ambigua",
    "invalida",
    "duplicada",
    "sem_valor",
    "nao_encontrada",
  ]);

  const summary = useMemo(() => {
    const list = rows ?? [];
    const ready = list.filter((r) => rowItem(r) && !blockedStates.has(r.state)).length;
    const withAlert = list.filter((r) => rowWarnings(r).length > 0).length;
    const blocked = list.filter((r) =>
      ["ambigua", "invalida", "duplicada"].includes(r.state),
    ).length;
    const missing = list.filter((r) => r.state === "nao_encontrada" && !r.overrideItemId).length;
    return { total: list.length, ready, withAlert, blocked, missing };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, valueTarget, qtyMode, priceLimit, qtyLimit, factors]);

  const selectedRows = (rows ?? []).filter(
    (r) => r.apply && rowItem(r) && r.state !== "invalida" && r.state !== "ambigua",
  );

  async function confirmApply() {
    if (!supplierId || selectedRows.length === 0) return;
    setSaving(true);
    try {
      const hash = await contentHash(supplierId, text);
      const rates: Record<string, number> = {
        BRL: factors["BRL-USD"] ?? 0,
        USD: 1,
        PYG: factors["PYG-USD"] ?? 0,
      };
      for (const key of Object.keys(rates)) {
        if (!rates[key] || rates[key]! <= 0) {
          throw new Error("Cotações ainda não carregaram. Tente novamente em instantes.");
        }
      }
      const payloadRows = selectedRows.map((r) => {
        const item = rowItem(r)!;
        return {
          line_no: r.lineNo,
          item_id: item.id,
          raw_text: r.raw.slice(0, 500),
          supplier_code: r.code ?? null,
          description: r.description?.slice(0, 300) ?? null,
          unit: r.unit ?? null,
          qty: qtyMode === "nenhum" ? null : (r.qty ?? null),
          value: valueTarget === "nenhum" ? null : (r.value ?? null),
          warning: rowWarnings(r).join(" | ").slice(0, 300) || null,
        };
      });
      const result: any = await apply({
        data: {
          supplier_id: supplierId,
          content_hash: hash,
          list_currency: listCurrency,
          base_currency: baseCurrency.currency,
          rates,
          qty_mode: qtyMode,
          value_target: valueTarget,
          apply_markup: applyMarkup,
          rows: payloadRows,
        },
      });

      for (const r of selectedRows) {
        if (!r.remember) continue;
        const item = rowItem(r);
        if (!item) continue;
        await saveMapping({
          data: {
            supplier_id: supplierId,
            inventory_item_id: item.id,
            supplier_code: r.code ?? null,
            alias_normalized: r.code ? null : normalizeText(r.description),
            received_description: r.description?.slice(0, 300) ?? null,
          },
        }).catch(() => undefined);
      }

      toast.success(
        `Lote aplicado: ${result?.qty_changes ?? 0} quantidade(s) e ${result?.value_changes ?? 0} valor(es) atualizados.`,
      );
      setConfirming(false);
      setRows(null);
      setText("");
      onOpenChange(false);
      queryClient.invalidateQueries();
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível aplicar a lista.");
    } finally {
      setSaving(false);
    }
  }

  async function persistTemplate() {
    if (!supplierId) return;
    try {
      await storeTemplate({
        data: {
          supplier_id: supplierId,
          name: "Padrão",
          config: { listCurrency, numberFormat, valueTarget, qtyMode, applyMarkup },
        },
      });
      toast.success("Modelo de leitura salvo para este fornecedor.");
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível salvar o modelo.");
    }
  }

  async function openHistory() {
    try {
      const list: any = await loadBatches();
      setBatches(list ?? []);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível carregar o histórico.");
    }
  }

  async function undoBatch(id: string) {
    if (!window.confirm("Desfazer este lote e restaurar os valores anteriores?")) return;
    try {
      await undo({ data: { batch_id: id } });
      toast.success("Lote desfeito.");
      openHistory();
      queryClient.invalidateQueries();
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível desfazer o lote.");
    }
  }

  const supplierName = (id: string) =>
    (suppliers.data ?? []).find((s: any) => s.id === id)?.["name"] ?? "—";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Atualizar estoque por texto</DialogTitle>
            <DialogDescription>
              Cole a lista do fornecedor (WhatsApp, e-mail, planilha ou CSV). Cada linha aparece na
              prévia com o que será alterado; nada é aplicado sem sua confirmação.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="lista" onValueChange={(v) => v === "historico" && openHistory()}>
            <TabsList>
              <TabsTrigger value="lista">Lista</TabsTrigger>
              <TabsTrigger value="historico">
                <History className="mr-1 size-4" /> Importações
              </TabsTrigger>
            </TabsList>

            <TabsContent value="lista" className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <Label>Fornecedor *</Label>
                  <Select value={supplierId} onValueChange={setSupplierId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {(suppliers.data ?? []).map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Moeda da lista</Label>
                  <Select
                    value={listCurrency}
                    onValueChange={(v) => setListCurrency(v as Currency)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BRL">Real (R$)</SelectItem>
                      <SelectItem value="USD">Dólar (US$)</SelectItem>
                      <SelectItem value="PYG">Guarani (₲)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Formato numérico</Label>
                  <Select
                    value={numberFormat}
                    onValueChange={(v) => setNumberFormat(v as NumberFormat)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Detectar automaticamente</SelectItem>
                      <SelectItem value="br">Brasileiro (1.234,56)</SelectItem>
                      <SelectItem value="us">Americano (1,234.56)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>O valor da lista é</Label>
                  <Select
                    value={valueTarget}
                    onValueChange={(v) => setValueTarget(v as ValueTarget)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="custo">Custo de compra</SelectItem>
                      <SelectItem value="preco">Preço de venda</SelectItem>
                      <SelectItem value="nenhum">Ignorar valores</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Quantidade da lista</Label>
                  <Select value={qtyMode} onValueChange={(v) => setQtyMode(v as QtyMode)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="absoluto">Definir saldo absoluto informado</SelectItem>
                      <SelectItem value="entrada">Registrar entrada (somar ao saldo)</SelectItem>
                      <SelectItem value="disponibilidade">
                        Atualizar disponibilidade do fornecedor
                      </SelectItem>
                      <SelectItem value="nenhum">Ignorar quantidades</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-4">
                  <div className="flex-1">
                    <Label>Alerta de variação (%)</Label>
                    <Input
                      type="number"
                      value={priceLimit}
                      onChange={(e) => setPriceLimit(Number(e.target.value) || 0)}
                    />
                  </div>
                  <div className="flex-1">
                    <Label>Saldo máximo esperado</Label>
                    <Input
                      type="number"
                      value={qtyLimit}
                      onChange={(e) => setQtyLimit(Number(e.target.value) || 0)}
                    />
                  </div>
                </div>
              </div>

              {valueTarget === "custo" && (
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={applyMarkup} onCheckedChange={setApplyMarkup} />
                  Recalcular preço de venda pela regra de markup do produto
                </label>
              )}

              <Textarea
                rows={8}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  "SKU-100;Produto Exemplo;10;620\nProduto Premium 5 un 950 dólares\n7891234567895\tItem Comercial\t24\tUS$ 12,50"
                }
              />

              <div className="flex flex-wrap justify-between gap-2">
                <Button variant="ghost" onClick={persistTemplate} disabled={!supplierId}>
                  Salvar modelo de leitura
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={analyse}>
                    <Wand2 className="mr-2 size-4" /> Analisar lista
                  </Button>
                  <Button
                    onClick={() => setConfirming(true)}
                    disabled={selectedRows.length === 0 || saving}
                  >
                    Revisar e aplicar ({selectedRows.length})
                  </Button>
                </div>
              </div>

              {rows && (
                <>
                  <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
                    {[
                      ["Linhas", summary.total],
                      ["Prontas", summary.ready],
                      ["Com alerta", summary.withAlert],
                      ["Bloqueadas", summary.blocked],
                      ["Sem correspondência", summary.missing],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="rounded-lg border p-2">
                        <p className="text-muted-foreground text-xs">{label}</p>
                        <p className="font-semibold">{String(value)}</p>
                      </div>
                    ))}
                  </div>

                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10" />
                          <TableHead>Texto original</TableHead>
                          <TableHead>Situação</TableHead>
                          <TableHead>Produto</TableHead>
                          <TableHead>Valor</TableHead>
                          <TableHead>Quantidade</TableHead>
                          <TableHead>Avisos</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((r, index) => {
                          const item = rowItem(r);
                          const blocked = ["invalida", "ambigua", "duplicada"].includes(r.state);
                          const warns = rowWarnings(r);
                          const converted =
                            item && r.value !== null && r.value !== undefined
                              ? convertValue(r.value, item.currency)
                              : null;
                          const previous = item
                            ? valueTarget === "custo"
                              ? item.cost
                              : item.price
                            : null;
                          const newQty =
                            item && r.qty !== null && r.qty !== undefined
                              ? qtyMode === "entrada"
                                ? Number(item.quantity ?? 0) + r.qty
                                : r.qty
                              : null;
                          const update = (patch: Partial<RowUi>) =>
                            setRows((list) =>
                              (list ?? []).map((x, i) => (i === index ? { ...x, ...patch } : x)),
                            );
                          return (
                            <TableRow key={`${r.lineNo}-${index}`}>
                              <TableCell>
                                <Checkbox
                                  checked={r.apply}
                                  disabled={blocked || !item}
                                  onCheckedChange={(v) => update({ apply: Boolean(v) })}
                                />
                              </TableCell>
                              <TableCell className="max-w-[220px] text-xs">{r.raw}</TableCell>
                              <TableCell>
                                <Badge className={STATE_TONE[r.state]}>
                                  {STATE_LABEL[r.state]}
                                </Badge>
                                {r.matchedBy && (
                                  <p className="text-muted-foreground mt-1 text-[11px]">
                                    por {r.matchedBy}
                                  </p>
                                )}
                              </TableCell>
                              <TableCell className="min-w-[220px]">
                                {r.state === "exata" && item ? (
                                  <span className="text-sm">{item.name}</span>
                                ) : (
                                  <Select
                                    value={r.overrideItemId ?? r.itemId ?? ""}
                                    onValueChange={(v) =>
                                      update({
                                        overrideItemId: v,
                                        apply: true,
                                        state: "exata" as any,
                                      })
                                    }
                                  >
                                    <SelectTrigger className="h-8">
                                      <SelectValue placeholder="Mapear manualmente" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {(r.candidates.length ? r.candidates : matchItems).map(
                                        (c: any) => (
                                          <SelectItem key={c.id} value={c.id}>
                                            {c.name}
                                          </SelectItem>
                                        ),
                                      )}
                                    </SelectContent>
                                  </Select>
                                )}
                                {item && (
                                  <label className="text-muted-foreground mt-1 flex items-center gap-1 text-[11px]">
                                    <Checkbox
                                      checked={r.remember}
                                      onCheckedChange={(v) => update({ remember: Boolean(v) })}
                                    />
                                    memorizar apelido do fornecedor
                                  </label>
                                )}
                              </TableCell>
                              <TableCell className="text-xs">
                                {valueTarget === "nenhum" || r.value === null || !item ? (
                                  "—"
                                ) : (
                                  <>
                                    {previous ? (
                                      <CurrencyValues
                                        value={previous}
                                        currency={item.currency}
                                        layout="inline"
                                      />
                                    ) : (
                                      "sem valor"
                                    )}{" "}
                                    →{" "}
                                    {converted === null ? (
                                      "sem cotação"
                                    ) : (
                                      <CurrencyValues
                                        value={converted}
                                        currency={item.currency}
                                        layout="inline"
                                      />
                                    )}
                                  </>
                                )}
                              </TableCell>
                              <TableCell className="text-xs">
                                {qtyMode === "nenhum" || r.qty === null || !item ? (
                                  "—"
                                ) : qtyMode === "disponibilidade" ? (
                                  `disponibilidade: ${formatNumber(r.qty)}`
                                ) : (
                                  <>
                                    {formatNumber(Number(item.quantity ?? 0))} →{" "}
                                    {formatNumber(newQty ?? 0)}
                                  </>
                                )}
                              </TableCell>
                              <TableCell className="text-xs">
                                {warns.length === 0 ? (
                                  <span className="text-muted-foreground">—</span>
                                ) : (
                                  <span className="text-amber-600">{warns.join(" • ")}</span>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    Produtos que não aparecem na lista continuam como estão: nada é zerado,
                    inativado ou excluído por esta operação. Produtos novos ficam como rascunho para
                    revisão no módulo de estoque e não são criados automaticamente.
                  </p>
                </>
              )}
            </TabsContent>

            <TabsContent value="historico">
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Fornecedor</TableHead>
                      <TableHead>Modo</TableHead>
                      <TableHead>Situação</TableHead>
                      <TableHead>Alterações</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(batches ?? []).map((b: any) => (
                      <TableRow key={b.id}>
                        <TableCell className="text-xs">
                          {new Date(b.applied_at ?? b.created_at).toLocaleString("pt-BR")}
                        </TableCell>
                        <TableCell className="text-xs">{supplierName(b.supplier_id)}</TableCell>
                        <TableCell className="text-xs">
                          {b.qty_mode} / {b.value_target} ({b.list_currency})
                        </TableCell>
                        <TableCell className="text-xs">{b.status}</TableCell>
                        <TableCell className="text-xs">
                          {b.counts?.linhas ?? 0} linhas · {b.counts?.quantidades ?? 0} qtd ·{" "}
                          {b.counts?.valores ?? 0} valores
                        </TableCell>
                        <TableCell>
                          {b.status === "aplicado" && (
                            <Button size="sm" variant="ghost" onClick={() => undoBatch(b.id)}>
                              Desfazer lote
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {batches && batches.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="text-muted-foreground text-center text-sm"
                        >
                          Nenhuma importação registrada ainda.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar aplicação</DialogTitle>
            <DialogDescription>
              Revise antes de gravar. A aplicação acontece em um único lote no servidor.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-1 text-sm">
            <li>
              <strong>Fornecedor:</strong> {supplierName(supplierId)}
            </li>
            <li>
              <strong>Linhas selecionadas:</strong> {selectedRows.length}
            </li>
            <li>
              <strong>Quantidades:</strong>{" "}
              {qtyMode === "nenhum"
                ? "não serão alteradas"
                : qtyMode === "absoluto"
                  ? "saldo absoluto informado"
                  : qtyMode === "entrada"
                    ? "entrada somada ao saldo"
                    : "disponibilidade do fornecedor (estoque próprio não muda)"}
            </li>
            <li>
              <strong>Valores:</strong>{" "}
              {valueTarget === "nenhum"
                ? "não serão alterados"
                : valueTarget === "custo"
                  ? `custo de compra em ${listCurrency}${applyMarkup ? " + recálculo do preço por markup" : ""}`
                  : `preço de venda em ${listCurrency}`}
            </li>
            <li>
              <strong>Com alerta:</strong>{" "}
              {selectedRows.filter((r) => rowWarnings(r).length > 0).length}
            </li>
          </ul>
          {selectedRows.some((r) => rowWarnings(r).length > 0) && (
            <p className="flex items-start gap-2 text-xs text-amber-600">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              Existem linhas com alerta entre as selecionadas.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Voltar
            </Button>
            <Button onClick={confirmApply} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Check className="mr-2 size-4" />
              )}
              Aplicar lote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
