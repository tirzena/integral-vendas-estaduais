/* eslint-disable @typescript-eslint/no-explicit-any */
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ChevronsUpDown,
  Download,
  History,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SheetLinkExportButton, SheetLinkImportButton } from "@/components/common/SheetLink";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
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
import { useRows, logAudit } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { formatNumber } from "@/lib/format";
import { toNumber } from "@/lib/sales";
import { type Currency, useRates } from "@/hooks/useRates";

type Named = { id: string; name: string };
type Sub = Named & { product_id: string };
type Item = Record<string, any>;

function MultiSelect({
  label,
  options,
  selected,
  onChange,
  disabled,
}: {
  label: string;
  options: Named[];
  selected: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
}) {
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className="min-w-[180px] justify-between font-normal"
        >
          <span className="truncate">
            {label}
            {selected.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {selected.length}
              </Badge>
            )}
          </span>
          <ChevronsUpDown className="ml-2 size-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="max-h-72 w-64 overflow-y-auto p-1" align="start">
        {options.length === 0 && (
          <p className="p-3 text-sm text-muted-foreground">Nada para filtrar.</p>
        )}
        {options.map((o) => (
          <button
            key={o.id}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
            onClick={() => toggle(o.id)}
          >
            <Checkbox checked={selected.includes(o.id)} className="pointer-events-none" />
            <span className="truncate">{o.name}</span>
          </button>
        ))}
        {selected.length > 0 && (
          <button
            className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted"
            onClick={() => onChange([])}
          >
            <X className="size-3.5" /> Limpar seleção
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function toCsv(rows: string[][]) {
  return rows
    .map((r) =>
      r
        .map((c) => {
          const v = c ?? "";
          return /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
        })
        .join(";"),
    )
    .join("\n");
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cell = "";
  let row: string[] = [];
  let quoted = false;
  const sep = text.split("\n")[0]?.includes(";") ? ";" : ",";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") cell += ch;
  }
  row.push(cell.trim());
  if (row.some((c) => c !== "")) rows.push(row);
  return rows.filter((r) => r.some((c) => c !== ""));
}

const HEADERS = [
  "Categoria",
  "Subcategoria",
  "Produto",
  "Variação",
  "SKU",
  "Tamanho",
  "Peso",
  "Volume",
  "Unidade",
  "Quantidade",
  "Quantidade mínima",
  "Custo na moeda cadastrada",
  "Valor sugerido de venda na moeda cadastrada",
];

export function StockControl({
  macros,
  subs,
  convert,
  warehouseId,
}: {
  macros: Named[];
  subs: Sub[];
  convert: (usd: any, source?: Currency) => string;
  warehouseId?: string | null;
}) {
  const queryClient = useQueryClient();
  const rates = useRates();
  const fileRef = useRef<HTMLInputElement>(null);
  const [macroSel, setMacroSel] = useState<string[]>([]);
  const [subSel, setSubSel] = useState<string[]>([]);
  const [itemSel, setItemSel] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [warehouseSel, setWarehouseSel] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [edit, setEdit] = useState<Item | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [linkForm, setLinkForm] = useState({
    item_id: "",
    quantity: "0",
    bonus_quantity: "0",
    min_quantity: "0",
    location: "",
    source_warehouse_id: "",
    unit_cost: "",
    freight_cost: "0",
    variable_cost: "0",
    currency: "USD",
    payment_status: "pendente",
  });
  const [linkOpen, setLinkOpen] = useState(false);
  const [movingStock, setMovingStock] = useState(false);

  useEffect(() => {
    if (warehouseId) setWarehouseSel([warehouseId]);
  }, [warehouseId]);

  const itemsQuery = useRows<Item>("inventory_items", {
    orderBy: { column: "name", ascending: true },
    limit: 2000,
  });
  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data]);
  const warehousesQuery = useRows<Item>("warehouses", {
    orderBy: { column: "name", ascending: true },
    limit: 200,
  });
  const warehouses = useMemo(() => warehousesQuery.data ?? [], [warehousesQuery.data]);
  const currentWarehouse = warehouses.find((warehouse) => warehouse["id"] === warehouseId);
  const isPrincipal = currentWarehouse?.["level"] === "principal";
  useEffect(() => {
    if (!linkOpen || !currentWarehouse || currentWarehouse["level"] === "principal") return;
    setLinkForm((form) => ({
      ...form,
      source_warehouse_id: form.source_warehouse_id || String(currentWarehouse["parent_id"] ?? ""),
    }));
  }, [currentWarehouse, linkOpen]);
  const locationsQuery = useRows<Item>("warehouse_inventory", { limit: 5000 });
  const locations = useMemo(() => locationsQuery.data ?? [], [locationsQuery.data]);
  const locationsByItem = useMemo(() => {
    const map = new Map<string, Item>();
    for (const location of locations) {
      if (warehouseId && location["warehouse_id"] !== warehouseId) continue;
      const itemId = String(location["item_id"] ?? "");
      if (itemId && !map.has(itemId)) map.set(itemId, location);
    }
    return map;
  }, [locations, warehouseId]);
  const locationOf = (itemId: any) => locationsByItem.get(String(itemId));
  const warehouseOf = (itemId: any) =>
    warehouses.find((w) => w["id"] === locationOf(itemId)?.["warehouse_id"]);

  const historyQuery = useRows<Item>("audit_logs", {
    select: "id,created_at,action,entity,entity_id,details,user_id",
    filter: { action: "delete" },
    orderBy: { column: "created_at", ascending: false },
    limit: 100,
  });
  const peopleQuery = useRows<Item>("profiles", {
    select: "id,full_name,email",
    orderBy: { column: "full_name", ascending: true },
    limit: 500,
  });
  const history = (historyQuery.data ?? []).filter((h) =>
    ["products", "product_categories", "inventory_items"].includes(String(h["entity"])),
  );
  const personName = (id: any) => {
    const p = (peopleQuery.data ?? []).find((x) => x["id"] === id);
    return p ? String(p["full_name"] || p["email"] || "—") : "Usuário removido";
  };
  const entityLabel = (e: any) =>
    e === "products" ? "Macro categoria" : e === "product_categories" ? "Subcategoria" : "Produto";

  const subsForEdit = (macroIdSel: any) => subs.filter((s) => s.product_id === macroIdSel);

  const saveEdit = async () => {
    if (!edit?.["id"]) return;
    const { error } = await (supabase.from("inventory_items") as any)
      .update({
        name: edit["name"],
        sku: edit["sku"] || null,
        product_id: edit["product_id"],
        category_id: edit["category_id"] ?? null,
        price: edit["price"] === "" || edit["price"] === null ? null : Number(edit["price"]),
      })
      .eq("id", edit["id"]);
    if (error) return void toast.error("Não foi possível salvar este produto.");
    const targetWarehouse = warehouseId || edit["warehouse_id"];
    if (!targetWarehouse) return void toast.error("Estoque não identificado.");
    const { error: locationError } = await (supabase.from("warehouse_inventory") as any)
      .update({
        min_quantity: Number(edit["min_quantity"] ?? 0),
        location: edit["location"] || null,
      })
      .eq("warehouse_id", targetWarehouse)
      .eq("item_id", edit["id"]);
    if (locationError)
      return void toast.error("Produto salvo, mas não foi possível definir o estoque.");
    setEdit(null);
    toast.success("Produto atualizado.");
    queryClient.invalidateQueries();
  };

  const linkProduct = async () => {
    if (!warehouseId || !linkForm.item_id)
      return void toast.error("Escolha o produto que será vinculado.");
    const quantity = toNumber(linkForm.quantity);
    if (!(quantity > 0)) return void toast.error("Informe uma quantidade maior que zero.");
    if (isPrincipal && !(toNumber(linkForm.unit_cost) > 0))
      return void toast.error("Informe o custo unitário desta compra.");
    if (!isPrincipal && !linkForm.source_warehouse_id)
      return void toast.error("Escolha o estoque de origem da transferência.");
    setMovingStock(true);
    try {
      const { error } = await (supabase as any).rpc("inventory_replenish", {
        p_target_warehouse_id: warehouseId,
        p_item_id: linkForm.item_id,
        p_quantity: quantity,
        p_bonus_quantity: isPrincipal ? Math.max(0, toNumber(linkForm.bonus_quantity)) : 0,
        p_min_quantity: Math.max(0, toNumber(linkForm.min_quantity)),
        p_location: linkForm.location || null,
        p_source_warehouse_id: isPrincipal ? null : linkForm.source_warehouse_id,
        p_unit_cost: isPrincipal ? toNumber(linkForm.unit_cost) : null,
        p_freight_cost: isPrincipal ? Math.max(0, toNumber(linkForm.freight_cost)) : 0,
        p_variable_cost: isPrincipal ? Math.max(0, toNumber(linkForm.variable_cost)) : 0,
        p_currency: linkForm.currency,
        p_payment_status: linkForm.payment_status,
      });
      if (error) throw error;
      setLinkOpen(false);
      setLinkForm({
        item_id: "",
        quantity: "0",
        bonus_quantity: "0",
        min_quantity: "0",
        location: "",
        source_warehouse_id: "",
        unit_cost: "",
        freight_cost: "0",
        variable_cost: "0",
        currency: "USD",
        payment_status: "pendente",
      });
      toast.success(
        isPrincipal
          ? "Compra registrada no estoque e no financeiro."
          : "Transferência de estoque concluída.",
      );
      queryClient.invalidateQueries();
    } catch (error: any) {
      toast.error(error?.message ?? "Não foi possível movimentar o estoque.");
    } finally {
      setMovingStock(false);
    }
  };

  const removeItem = async (i: Item) => {
    if (!confirm(`Excluir o produto "${i["name"]}" do estoque?`)) return;
    const { error } = await (supabase.from("inventory_items") as any).delete().eq("id", i["id"]);
    if (error) return void toast.error("Não foi possível excluir este produto.");
    await logAudit("inventory_items", "delete", i["id"], {
      nome: i["name"],
      categoria: macroName(i["product_id"]),
    });
    toast.success("Produto excluído.");
    queryClient.invalidateQueries();
  };

  const macroName = (id: any) => macros.find((m) => m.id === id)?.name ?? "—";
  const subName = (id: any) => subs.find((s) => s.id === id)?.name ?? "—";

  const subOptions = useMemo(
    () => (macroSel.length ? subs.filter((s) => macroSel.includes(s.product_id)) : subs),
    [subs, macroSel],
  );

  const itemsInSelectedWarehouses = useMemo(() => {
    if (!warehouseSel.length) return null;
    const selectedWarehouses = new Set(warehouseSel);
    return new Set(
      locations
        .filter((location) => selectedWarehouses.has(String(location["warehouse_id"] ?? "")))
        .map((location) => String(location["item_id"] ?? "")),
    );
  }, [locations, warehouseSel]);

  const filtered = useMemo(() => {
    const term = deferredSearch.trim().toLowerCase();
    const selectedMacros = new Set(macroSel);
    const selectedSubs = new Set(subSel);
    const selectedItems = new Set(itemSel);
    return items.filter((item) => {
      if (selectedMacros.size && !selectedMacros.has(item["product_id"])) return false;
      if (selectedSubs.size && !selectedSubs.has(item["category_id"])) return false;
      if (selectedItems.size && !selectedItems.has(item["id"])) return false;
      if (itemsInSelectedWarehouses && !itemsInSelectedWarehouses.has(String(item["id"])))
        return false;
      if (!term) return true;
      return ["name", "sku", "variation", "size"].some((key) =>
        String(item[key] ?? "")
          .toLowerCase()
          .includes(term),
      );
    });
  }, [deferredSearch, itemSel, items, itemsInSelectedWarehouses, macroSel, subSel]);

  const itemOptions = useMemo(
    () =>
      items
        .filter((i) => (macroSel.length ? macroSel.includes(i["product_id"]) : true))
        .filter((i) => (subSel.length ? subSel.includes(i["category_id"]) : true))
        .map((i) => ({ id: i["id"] as string, name: String(i["name"] ?? "") })),
    [items, macroSel, subSel],
  );

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc: { qty: number; value: number | null }, item) => {
          const qty = Number(
            locationsByItem.get(String(item["id"]))?.["quantity"] ??
              (warehouseId ? 0 : (item["quantity"] ?? 0)),
          );
          acc.qty += qty;
          const converted = rates.convert(
            Number(item["price"] ?? 0) * qty,
            (item["currency"] ?? "USD") as Currency,
            "USD",
          );
          acc.value = acc.value === null || converted === null ? null : acc.value + converted;
          return acc;
        },
        { qty: 0, value: 0 },
      ),
    [filtered, locationsByItem, warehouseId, rates],
  );

  const exportRows = () => {
    return [
      [
        ...HEADERS,
        "Moeda cadastrada",
        "Custo BRL",
        "Custo PYG",
        "Valor sugerido BRL",
        "Valor sugerido PYG",
      ],
      ...filtered.map((i) => [
        macroName(i["product_id"]),
        i["category_id"] ? subName(i["category_id"]) : "",
        String(i["name"] ?? ""),
        String(i["variation"] ?? ""),
        String(i["sku"] ?? ""),
        String(i["size"] ?? ""),
        String(i["weight"] ?? ""),
        String(i["volume"] ?? ""),
        String(i["unit"] ?? ""),
        String(locationOf(i["id"])?.["quantity"] ?? (warehouseId ? 0 : (i["quantity"] ?? 0))),
        String(i["min_quantity"] ?? 0),
        String(i["cost"] ?? ""),
        String(i["price"] ?? ""),
        String(i["currency"] ?? "USD"),
        rates.money(Number(i["cost"] ?? 0), (i["currency"] ?? "USD") as Currency, "BRL"),
        rates.money(Number(i["cost"] ?? 0), (i["currency"] ?? "USD") as Currency, "PYG"),
        rates.money(Number(i["price"] ?? 0), (i["currency"] ?? "USD") as Currency, "BRL"),
        rates.money(Number(i["price"] ?? 0), (i["currency"] ?? "USD") as Currency, "PYG"),
      ]),
    ];
  };

  const exportCsv = () => {
    const rows = exportRows();
    const blob = new Blob(["\uFEFF" + toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `estoque-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadModel = () => {
    const rows = [
      HEADERS,
      [
        "Perfumes e cosméticos",
        "Perfumes importados",
        "Perfume X",
        "100ml",
        "PX-100",
        "100 ml",
        "250 g",
        "100 mg",
        "un",
        "10",
        "2",
        "25",
        "60",
      ],
    ];
    const blob = new Blob(["\uFEFF" + toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo-estoque.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importRows = async (rows: string[][]) => {
    setImporting(true);
    try {
      if (rows.length < 2) throw new Error("A planilha está vazia.");
      const body = rows.slice(1);
      const macroMap = new Map(macros.map((m) => [m.name.trim().toLowerCase(), m.id]));
      const subMap = new Map(
        subs.map((s) => [`${s.product_id}|${s.name.trim().toLowerCase()}`, s.id]),
      );
      const payload: any[] = [];
      let created = 0;

      for (const r of body) {
        const [cat, sub, name, variation, sku, size, weight, volume, unit, qty, min, cost, price] =
          r;
        if (!name) continue;
        const catKey = (cat ?? "").trim().toLowerCase();
        if (!catKey) throw new Error(`Informe a categoria do produto "${name}".`);
        let macroId = macroMap.get(catKey);
        if (!macroId) {
          const { data, error } = await (supabase.from("products") as any)
            .insert({ name: (cat ?? "").trim() })
            .select("id")
            .single();
          if (error) throw error;
          macroId = data.id as string;
          macroMap.set(catKey, macroId);
          created++;
        }
        let subIdVal: string | null = null;
        const subName2 = (sub ?? "").trim();
        if (subName2) {
          const key = `${macroId}|${subName2.toLowerCase()}`;
          subIdVal = subMap.get(key) ?? null;
          if (!subIdVal) {
            const { data, error } = await (supabase.from("product_categories") as any)
              .insert({ product_id: macroId, name: subName2 })
              .select("id")
              .single();
            if (error) throw error;
            subIdVal = data.id as string;
            subMap.set(key, subIdVal);
          }
        }
        const num = (v: any) => {
          const n = Number(String(v ?? "").replace(",", "."));
          return Number.isFinite(n) ? n : null;
        };
        payload.push({
          product_id: macroId,
          category_id: subIdVal,
          name,
          variation: variation || null,
          sku: sku || null,
          size: size || null,
          weight: weight || null,
          volume: volume || null,
          unit: unit || null,
          quantity: num(qty) ?? 0,
          min_quantity: num(min) ?? 0,
          cost: num(cost),
          price: num(price),
          currency: "USD",
        });
      }

      if (payload.length === 0) throw new Error("Nenhum produto válido encontrado.");
      const { error } = await (supabase.from("inventory_items") as any).insert(payload);
      if (error) throw error;
      queryClient.invalidateQueries();
      toast.success(
        `${payload.length} produto(s) importado(s)${created ? ` e ${created} categoria(s) criada(s)` : ""}.`,
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível importar a planilha.");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const importCsv = async (file: File) => {
    if (file.name.toLowerCase().endsWith(".xlsx")) {
      const { default: readXlsxFile } = await import("read-excel-file");
      const rows = await readXlsxFile(file);
      await importRows(rows.map((r) => r.map((c) => String(c ?? ""))));
      return;
    }
    await importRows(parseCsv(await file.text()));
  };

  return (
    <section className="mt-6 rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
        <div>
          <h2 className="font-semibold">Controle de estoque</h2>
          <p className="text-sm text-muted-foreground">
            Filtre por várias categorias, subcategorias e produtos ao mesmo tempo.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {warehouseId &&
            (isPrincipal ? (
              <Button asChild>
                <Link to="/compras">
                  <Plus className="mr-1 size-4" />
                  Comprar lote
                </Link>
              </Button>
            ) : (
              <Button onClick={() => setLinkOpen(true)}>
                <Plus className="mr-1 size-4" />
                Transferir produto
              </Button>
            ))}
          <Button variant="ghost" onClick={() => setShowHistory((v) => !v)}>
            <History className="mr-1 size-4" /> Histórico
          </Button>
          <Button variant="ghost" onClick={downloadModel}>
            Modelo CSV
          </Button>
          <Button variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download className="mr-1 size-4" /> Exportar
          </Button>
          <Button variant="outline" disabled={importing} onClick={() => fileRef.current?.click()}>
            <Upload className="mr-1 size-4" /> {importing ? "Importando…" : "Importar"}
          </Button>
          <SheetLinkExportButton build={exportRows} />
          <SheetLinkImportButton onRows={importRows} />
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importCsv(f);
            }}
          />
        </div>
      </div>

      {warehouseId &&
        filtered.some((item) => {
          const balance = locationOf(item["id"]);
          return Number(balance?.["quantity"] ?? 0) <= Number(balance?.["min_quantity"] ?? 0);
        }) && (
          <div className="flex items-start gap-2 border-b bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              Há produto no mínimo ou abaixo dele neste estoque.{" "}
              {isPrincipal
                ? "Registre uma nova compra para evitar falta de mercadoria."
                : "Transfira saldo do estoque de origem antes de novos pedidos."}
            </span>
          </div>
        )}

      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <MultiSelect
          label="Categorias"
          options={macros}
          selected={macroSel}
          onChange={(v) => {
            setMacroSel(v);
            setSubSel([]);
            setItemSel([]);
          }}
        />
        <MultiSelect
          label="Subcategorias"
          options={subOptions}
          selected={subSel}
          onChange={(v) => {
            setSubSel(v);
            setItemSel([]);
          }}
        />
        <MultiSelect
          label="Produtos"
          options={itemOptions}
          selected={itemSel}
          onChange={setItemSel}
        />
        <MultiSelect
          label="Estoques"
          options={warehouses.map((w: any) => ({
            id: w.id,
            name: `${w.name} · ${w.city}/${w.state}`,
          }))}
          selected={warehouseSel}
          onChange={setWarehouseSel}
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar no estoque"
          className="min-w-[180px] flex-1"
        />
        {(macroSel.length > 0 ||
          subSel.length > 0 ||
          itemSel.length > 0 ||
          warehouseSel.length > 0 ||
          search !== "") && (
          <Button
            variant="ghost"
            onClick={() => {
              setMacroSel([]);
              setSubSel([]);
              setItemSel([]);
              setWarehouseSel([]);
              setSearch("");
            }}
          >
            Limpar filtros
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">
          Nenhum item encontrado com esses filtros.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Subcategoria</TableHead>
                <TableHead>Especificações</TableHead>
                <TableHead>Estoque</TableHead>
                <TableHead>Qtd.</TableHead>
                <TableHead>Valor sugerido</TableHead>
                <TableHead>Total</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((i) => (
                <TableRow key={i["id"]}>
                  <TableCell>
                    <p className="font-medium">{i["name"]}</p>
                    <p className="text-xs text-muted-foreground">
                      {[i["variation"], i["sku"]].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </TableCell>
                  <TableCell className="text-sm">{macroName(i["product_id"])}</TableCell>
                  <TableCell className="text-sm">
                    {i["category_id"] ? subName(i["category_id"]) : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {[i["size"], i["weight"], i["volume"], i["unit"]].filter(Boolean).join(" · ") ||
                      "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    <p className="font-medium">
                      {warehouseOf(i["id"])?.["name"] ?? "Não definido"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {warehouseOf(i["id"])
                        ? `${warehouseOf(i["id"])["city"]}/${warehouseOf(i["id"])["state"]}`
                        : "—"}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        Number(
                          locationOf(i["id"])?.["quantity"] ??
                            (warehouseId ? 0 : (i["quantity"] ?? 0)),
                        ) <= Number(locationOf(i["id"])?.["min_quantity"] ?? i["min_quantity"] ?? 0)
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {formatNumber(
                        locationOf(i["id"])?.["quantity"] ?? (warehouseId ? 0 : i["quantity"]),
                        2,
                      )}
                    </Badge>
                  </TableCell>
                  <TableCell>{convert(i["price"], (i["currency"] ?? "USD") as Currency)}</TableCell>
                  <TableCell>
                    {convert(
                      Number(i["price"] ?? 0) *
                        Number(
                          locationOf(i["id"])?.["quantity"] ??
                            (warehouseId ? 0 : (i["quantity"] ?? 0)),
                        ),
                      (i["currency"] ?? "USD") as Currency,
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Editar / mover de categoria"
                        onClick={() =>
                          setEdit({
                            ...i,
                            warehouse_id:
                              locationOf(i["id"])?.["warehouse_id"] ?? warehouseId ?? "",
                            quantity:
                              locationOf(i["id"])?.["quantity"] ??
                              (warehouseId ? 0 : i["quantity"]),
                            min_quantity:
                              locationOf(i["id"])?.["min_quantity"] ?? i["min_quantity"],
                            location: locationOf(i["id"])?.["location"] ?? "",
                          })
                        }
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Excluir"
                        onClick={() => void removeItem(i)}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/40 font-medium">
                <TableCell colSpan={5}>{filtered.length} item(ns)</TableCell>
                <TableCell>{formatNumber(totals.qty, 2)}</TableCell>
                <TableCell />
                <TableCell>{totals.value === null ? "—" : convert(totals.value)}</TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
      {showHistory && (
        <div className="border-t p-3">
          <h3 className="mb-2 text-sm font-semibold">Histórico de exclusões</h3>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma exclusão registrada ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>Quem</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Detalhes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((h) => {
                    const d = (h["details"] ?? {}) as Record<string, any>;
                    return (
                      <TableRow key={h["id"]}>
                        <TableCell className="text-sm">
                          {new Date(h["created_at"]).toLocaleString("pt-BR")}
                        </TableCell>
                        <TableCell className="text-sm">{personName(h["user_id"])}</TableCell>
                        <TableCell className="text-sm">{entityLabel(h["entity"])}</TableCell>
                        <TableCell className="text-sm">{d["nome"] ?? "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {[
                            d["categoria"] ? `Categoria: ${d["categoria"]}` : null,
                            d["subcategorias"] != null
                              ? `${d["subcategorias"]} subcategoria(s)`
                              : null,
                            d["produtos"] != null ? `${d["produtos"]} produto(s)` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar produto</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Nome</Label>
              <Input
                value={String(edit?.["name"] ?? "")}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              />
            </div>
            <div>
              <Label>SKU</Label>
              <Input
                value={String(edit?.["sku"] ?? "")}
                onChange={(e) => setEdit({ ...edit, sku: e.target.value })}
              />
            </div>
            <div>
              <Label>Macro categoria</Label>
              <Select
                value={String(edit?.["product_id"] ?? "")}
                onValueChange={(v) => setEdit({ ...edit, product_id: v, category_id: null })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {macros.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Subcategoria</Label>
              <Select
                value={String(edit?.["category_id"] ?? "nenhuma")}
                onValueChange={(v) => setEdit({ ...edit, category_id: v === "nenhuma" ? null : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sem subcategoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhuma">Sem subcategoria</SelectItem>
                  {subsForEdit(edit?.["product_id"]).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Local interno</Label>
              <Input
                value={String(edit?.["location"] ?? "")}
                onChange={(e) => setEdit({ ...edit, location: e.target.value })}
                placeholder="Ex.: corredor A, prateleira 3"
              />
            </div>
            <div>
              <Label>Quantidade mínima</Label>
              <Input
                type="number"
                value={String(edit?.["min_quantity"] ?? 0)}
                onChange={(e) => setEdit({ ...edit, min_quantity: e.target.value })}
              />
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
              Quantidade e custo são alterados somente por compra ou transferência, para manter o
              financeiro e o histórico corretos.
            </div>
            <div>
              <Label>
                Valor sugerido de venda (
                {edit?.["currency"] === "BRL" ? "R$" : edit?.["currency"] === "PYG" ? "Gs." : "US$"}
                )
              </Label>
              <Input
                type="number"
                value={String(edit?.["price"] ?? "")}
                onChange={(e) => setEdit({ ...edit, price: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void saveEdit()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isPrincipal
                ? "Comprar produto para o estoque principal"
                : "Transferir produto para este estoque"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Produto</Label>
              <Select
                value={linkForm.item_id}
                onValueChange={(v) => setLinkForm((f) => ({ ...f, item_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o produto" />
                </SelectTrigger>
                <SelectContent>
                  {items.map((item: any) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} · {macroName(item.product_id)}
                      {item.category_id ? ` / ${subName(item.category_id)}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quantidade</Label>
              <Input
                type="number"
                value={linkForm.quantity}
                onChange={(e) => setLinkForm((f) => ({ ...f, quantity: e.target.value }))}
              />
            </div>
            {!isPrincipal && (
              <div className="sm:col-span-2">
                <Label>Estoque de origem</Label>
                <Select
                  value={linkForm.source_warehouse_id}
                  onValueChange={(v) => setLinkForm((f) => ({ ...f, source_warehouse_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione de onde sairá o produto" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses
                      .filter((warehouse: any) => warehouse.id !== warehouseId)
                      .map((warehouse: any) => (
                        <SelectItem key={warehouse.id} value={warehouse.id}>
                          {warehouse.name} · {warehouse.city}/{warehouse.state}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {isPrincipal && (
              <>
                <div>
                  <Label>Quantidade bonificada</Label>
                  <Input
                    inputMode="decimal"
                    value={linkForm.bonus_quantity}
                    onChange={(e) => setLinkForm((f) => ({ ...f, bonus_quantity: e.target.value }))}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Entra no estoque, mas é abatida do valor a pagar ao fornecedor.
                  </p>
                </div>
                <div>
                  <Label>Custo unitário da compra</Label>
                  <Input
                    inputMode="decimal"
                    value={linkForm.unit_cost}
                    onChange={(e) => setLinkForm((f) => ({ ...f, unit_cost: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Moeda</Label>
                  <Select
                    value={linkForm.currency}
                    onValueChange={(v) => setLinkForm((f) => ({ ...f, currency: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BRL">BRL</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="PYG">PYG</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Frete da compra</Label>
                  <Input
                    inputMode="decimal"
                    value={linkForm.freight_cost}
                    onChange={(e) => setLinkForm((f) => ({ ...f, freight_cost: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Outros custos variáveis</Label>
                  <Input
                    inputMode="decimal"
                    value={linkForm.variable_cost}
                    onChange={(e) => setLinkForm((f) => ({ ...f, variable_cost: e.target.value }))}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Situação do pagamento da compra</Label>
                  <Select
                    value={linkForm.payment_status}
                    onValueChange={(v) => setLinkForm((f) => ({ ...f, payment_status: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pendente">A pagar</SelectItem>
                      <SelectItem value="pago">Pago</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div>
              <Label>Quantidade mínima</Label>
              <Input
                type="number"
                value={linkForm.min_quantity}
                onChange={(e) => setLinkForm((f) => ({ ...f, min_quantity: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Local interno</Label>
              <Input
                value={linkForm.location}
                onChange={(e) => setLinkForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="Corredor, prateleira ou posição"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={movingStock} onClick={() => void linkProduct()}>
              {movingStock ? "Salvando…" : isPrincipal ? "Registrar compra" : "Transferir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
