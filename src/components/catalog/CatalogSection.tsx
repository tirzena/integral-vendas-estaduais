/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  Download,
  ExternalLink,
  FileText,
  Globe,
  Image as ImageIcon,
  LayoutGrid,
  Link2,
  List,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  Video,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRows } from "@/lib/db";
import { useRates, DISPLAY_CURRENCIES, type Currency } from "@/hooks/useRates";
import { catalogPriceBreakdown, convertCatalogPriceRules } from "@/lib/catalog-pricing";
import { useBaseCurrency } from "@/hooks/useBaseCurrency";
import {
  saveProductCatalogConfig,
  uploadProductImage,
  uploadProductMedia,
  useProductCatalogConfigs,
  useProductImages,
} from "@/lib/storage";
import { downloadCsv, downloadText, stamp } from "@/lib/csv";
import { SheetLinkExportButton } from "@/components/common/SheetLink";
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
import { ReportButton } from "@/components/common/ReportButton";
import { SupplierImportDialog } from "@/components/catalog/SupplierImportDialog";
import { cn } from "@/lib/utils";

type Macro = { id: string; name: string };
type Sub = { id: string; product_id: string; name: string };

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const PAYMENT_OPTIONS = [
  "Dinheiro",
  "PIX",
  "Cartão de débito",
  "Cartão de crédito",
  "Transferência",
  "Boleto",
];

function slugify(s: string) {
  return normalize(s)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function pricingError(rules: any, items: any[]) {
  if (!rules) return null;
  try {
    for (const item of items) {
      const detail = catalogPriceBreakdown(item, rules, "USD", (value) => value);
      if (detail.sale == null) return `Cadastre o custo ou informe o preço manual de ${item.name}.`;
    }
  } catch (error) {
    return (error as Error).message;
  }
  return null;
}

function CatalogPricing({
  value,
  onChange,
  items,
  currency,
  convert,
  onCurrencyChange,
}: {
  onCurrencyChange?: (currency: Currency) => void;
  value: any;
  onChange: (value: any) => void;
  items: any[];
  currency: Currency;
  convert: (value: number, from: Currency, to: Currency) => number | null;
}) {
  const rules = value ?? {};
  const [search, setSearch] = useState("");
  const money = (amount: number | null) => (amount == null ? "—" : formatMoney(amount, currency));
  return (
    <div className="space-y-4 rounded-lg border p-4 sm:col-span-2">
      {onCurrencyChange && (
        <div>
          <Label>Moeda dos valores do catálogo</Label>
          <Select value={currency} onValueChange={(value) => onCurrencyChange(value as Currency)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="BRL">Real (R$)</SelectItem>
              <SelectItem value="USD">Dólar (US$)</SelectItem>
              <SelectItem value="PYG">Guarani (Gs.)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="flex items-center gap-2">
        <Switch
          checked={!!rules.enabled}
          onCheckedChange={(enabled) => onChange({ ...rules, enabled })}
        />
        <Label>Calcular preço de venda sobre o custo</Label>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium">Padrão para os produtos deste catálogo</p>
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            ["freight", "Frete (%)"],
            ["commission", "Comissão (%)"],
            ["markup", "Markup (%)"],
            ["discount", "Desconto (%)"],
          ].map(([key, label]) => (
            <div key={key}>
              <Label className="text-xs">{label}</Label>
              <Input
                aria-label={`Padrão ${label}`}
                inputMode="decimal"
                value={rules[key] ?? "0"}
                onChange={(e) => onChange({ ...rules, [key]: e.target.value })}
              />
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Defina abaixo os valores de cada produto para este catálogo. Valores monetários em{" "}
        {currency}. Frete e comissão em percentual sobre o custo de compra; markup sobre o custo
        total e desconto sobre a venda sugerida. Frete adicional da aba Entrega é cobrado
        separadamente.
      </p>
      <Input
        aria-label="Buscar produto para precificar"
        placeholder="Buscar produto neste catálogo..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="space-y-3">
        {items
          .filter((item) => normalize(item.name).includes(normalize(search)))
          .map((item) => {
            const custom = rules.products?.[item.id] ?? {};
            let detail: ReturnType<typeof catalogPriceBreakdown> | null = null;
            let error = "";
            try {
              detail = catalogPriceBreakdown(item, rules, currency, convert);
            } catch (e) {
              error = (e as Error).message;
            }
            const update = (key: string, raw: string) => {
              const defaults = {
                tax: item.tax_percent ?? 0,
                extra:
                  convert(Number(item.extra_cost ?? 0), item.currency ?? "USD", currency) ?? "",
                ...custom,
              };
              onChange({
                ...rules,
                products: { ...rules.products, [item.id]: { ...defaults, [key]: raw } },
              });
            };
            return (
              <details
                key={item.id}
                className="rounded-lg border bg-muted/10"
                open={items.length === 1 ? true : undefined}
              >
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 p-3 text-sm font-medium">
                  <span>{item.name}</span>
                  <span className="text-primary">Venda: {money(detail?.sale ?? null)}</span>
                </summary>
                <div className="space-y-4 border-t p-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <Label>Moeda dos valores</Label>
                      <Input
                        value={
                          currency === "BRL"
                            ? "Real (R$)"
                            : currency === "USD"
                              ? "Dólar (US$)"
                              : "Guarani (Gs.)"
                        }
                        readOnly
                      />
                    </div>
                    <div>
                      <Label>Custo de compra</Label>
                      <Input
                        aria-label={`Custo de ${item.name}`}
                        inputMode="decimal"
                        placeholder={money(detail?.cost ?? null)}
                        value={custom.cost ?? ""}
                        onChange={(e) => update("cost", e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Vazio: custo cadastrado, convertido.
                      </p>
                    </div>
                    <div>
                      <Label>Impostos (%)</Label>
                      <Input
                        inputMode="decimal"
                        value={custom.tax ?? item.tax_percent ?? 0}
                        onChange={(e) => update("tax", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Outros custos por unidade</Label>
                      <Input
                        inputMode="decimal"
                        value={custom.extra ?? ""}
                        placeholder={money(
                          convert(Number(item.extra_cost ?? 0), item.currency ?? "USD", currency),
                        )}
                        onChange={(e) => update("extra", e.target.value)}
                      />
                    </div>
                    {[
                      ["freight", "Frete (%)"],
                      ["commission", "Comissão (%)"],
                      ["markup", "Markup (%)"],
                      ["discount", "Desconto (%)"],
                    ].map(([key, label]) => (
                      <div key={key}>
                        <Label>{label}</Label>
                        <Input
                          inputMode="decimal"
                          value={custom[key] ?? ""}
                          placeholder={String(rules[key] ?? 0)}
                          onChange={(e) => update(key, e.target.value)}
                        />
                      </div>
                    ))}
                    <div>
                      <Label>Preço de venda</Label>
                      <Input
                        aria-label={`Preço de ${item.name}`}
                        inputMode="decimal"
                        value={rules.prices?.[item.id] ?? ""}
                        placeholder={money(detail?.suggested ?? null)}
                        onChange={(e) =>
                          onChange({
                            ...rules,
                            prices: { ...rules.prices, [item.id]: e.target.value },
                          })
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Vazio: usa a sugestão automaticamente.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm">
                      Preço sugerido: <strong>{money(detail?.suggested ?? null)}</strong>
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={detail?.suggested == null}
                      onClick={() => {
                        if (!detail || detail.suggested == null) return;
                        onChange({
                          ...rules,
                          prices: {
                            ...rules.prices,
                            [item.id]: String(Math.round(detail.suggested * 100) / 100),
                          },
                        });
                      }}
                    >
                      Aplicar preço sugerido
                    </Button>
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  {!error && detail?.sale == null && (
                    <p className="text-sm text-destructive">
                      Informe o custo ou um preço de venda manual.
                    </p>
                  )}
                  <div className="grid gap-3 rounded-lg border bg-background p-3 sm:grid-cols-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Custo total por unidade</p>
                      {detail?.totalCost == null ? (
                        "—"
                      ) : (
                        <CurrencyValues
                          convert={convert}
                          value={detail.totalCost}
                          currency={currency}
                          emphasize
                        />
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Lucro por unidade</p>
                      {detail?.profit == null ? (
                        "—"
                      ) : (
                        <CurrencyValues
                          convert={convert}
                          value={detail.profit}
                          currency={currency}
                          emphasize
                        />
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Margem</p>
                      <strong>
                        {detail?.profit == null ? "—" : `${detail.margin.toFixed(2)}%`}
                      </strong>
                      <p className="mt-2 text-xs text-muted-foreground">Venda nas três moedas</p>
                      {detail?.sale == null ? (
                        "—"
                      ) : (
                        <CurrencyValues convert={convert} value={detail.sale} currency={currency} />
                      )}
                    </div>
                  </div>
                </div>
              </details>
            );
          })}
      </div>
      {!items.length && (
        <p className="text-sm text-muted-foreground">
          Escolha os produtos, a categoria ou a subcategoria para definir os preços.
        </p>
      )}
    </div>
  );
}

export function CatalogSection({ macros, subs }: { macros: Macro[]; subs: Sub[] }) {
  const baseCurrency = useBaseCurrency();
  const [currency, setCurrency] = useState<Currency>("USD");
  const [currencyTouched, setCurrencyTouched] = useState(false);
  const [view, setView] = useState<"cards" | "lista">("cards");
  const [search, setSearch] = useState("");
  const [macroFilter, setMacroFilter] = useState("todos");
  const [subFilter, setSubFilter] = useState("todos");
  const [brandFilter, setBrandFilter] = useState("todos");
  const [supplierFilter, setSupplierFilter] = useState("todos");
  const [stockFilter, setStockFilter] = useState("todos");
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState("");
  const [form, setForm] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [catalogForm, setCatalogForm] = useState<any | null>(null);
  const [quick, setQuick] = useState<any | null>(null);
  const [quickSaving, setQuickSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const mediaFileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { convert, allCurrencies } = useRates();
  function changeCatalogCurrency(form: any, setter: (value: any) => void, target: Currency) {
    try {
      setter({
        ...form,
        currency: target,
        pricing_rules: convertCatalogPriceRules(
          form.pricing_rules,
          form.currency ?? "USD",
          target,
          convert,
        ),
      });
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  useEffect(() => {
    if (!currencyTouched && !baseCurrency.loading) setCurrency(baseCurrency.currency);
  }, [baseCurrency.currency, baseCurrency.loading, currencyTouched]);

  const itemsQuery = useRows<any>("inventory_items", {
    orderBy: { column: "name", ascending: true },
    limit: 1000,
  });
  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data]);
  const suppliersQuery = useRows<any>("suppliers", {
    select: "id,name",
    orderBy: { column: "name", ascending: true },
  });
  const suppliers = suppliersQuery.data ?? [];
  const catalogsQuery = useRows<any>("digital_catalogs", {
    orderBy: { column: "created_at", ascending: false },
  });
  const catalogs = catalogsQuery.data ?? [];
  const sellersQuery = useRows<any>("profiles", {
    select: "id,full_name,is_active",
    filter: { is_active: true },
    orderBy: { column: "full_name", ascending: true },
    limit: 500,
  });
  const sellerRolesQuery = useRows<any>("user_roles", {
    select: "user_id,role",
    filter: { role: "vendedor" },
    orderBy: { column: "created_at", ascending: true },
    limit: 500,
  });
  const sellerIds = useMemo(
    () => new Set((sellerRolesQuery.data ?? []).map((role: any) => role.user_id)),
    [sellerRolesQuery.data],
  );
  const sellers = useMemo(
    () => (sellersQuery.data ?? []).filter((seller: any) => sellerIds.has(seller.id)),
    [sellerIds, sellersQuery.data],
  );
  const catalogConfigsQuery = useProductCatalogConfigs();
  const catalogConfigs = useMemo(() => catalogConfigsQuery.data ?? {}, [catalogConfigsQuery.data]);
  const mediaPaths = useMemo(
    () =>
      Object.values(catalogConfigs).flatMap((config) =>
        config.media.map((media) => media.path).filter((path): path is string => !!path),
      ),
    [catalogConfigs],
  );
  const formMediaPaths = useMemo(
    () =>
      Array.isArray(form?.catalog_media)
        ? form.catalog_media.map((media: any) => media?.path).filter(Boolean)
        : [],
    [form?.catalog_media],
  );
  const imagesQuery = useProductImages([
    ...items.map((i: any) => i.image_url),
    ...mediaPaths,
    form?.image_url,
    ...formMediaPaths,
  ]);
  const imageOf = (i: any) => (i.image_url ? imagesQuery.data?.[i.image_url] : undefined);

  const macroNames = useMemo(
    () => new Map(macros.map((macro) => [macro.id, macro.name])),
    [macros],
  );
  const subNames = useMemo(() => new Map(subs.map((sub) => [sub.id, sub.name])), [subs]);
  const macroName = (id: string) => macroNames.get(id) ?? "Sem categoria";
  const subName = (id: string | null) => (id ? subNames.get(id) : undefined) ?? "Sem subcategoria";
  const supplierName = (id: string | null) => suppliers.find((s: any) => s.id === id)?.name ?? "—";

  const brands = [...new Set(items.map((i: any) => i.brand).filter(Boolean))] as string[];

  const price = (usd: any, from: Currency = "USD") => {
    const value = convert(Number(usd ?? 0), from, currency);
    return value === null ? "—" : formatMoney(value, currency);
  };

  const pricesInAllCurrencies = (value: any, from: Currency = "USD") =>
    allCurrencies(Number(value ?? 0), from);

  const priceTextInAllCurrencies = (value: any, from: Currency = "USD") =>
    pricesInAllCurrencies(value, from)
      .map((item) => item.text)
      .join(" · ");

  const stockValueTextInAllCurrencies = (list: any[]) =>
    (["BRL", "USD", "PYG"] as Currency[])
      .map((target) => {
        let unavailable = false;
        const total = list.reduce((sum, item) => {
          const converted = convert(
            Number(item.price ?? 0) * Number(item.quantity ?? 0),
            item.currency ?? "USD",
            target,
          );
          if (converted === null) unavailable = true;
          return sum + (converted ?? 0);
        }, 0);
        return unavailable ? `${target}: —` : formatMoney(total, target);
      })
      .join(" · ");

  const filtered = useMemo(() => {
    const term = normalize(search);
    return items.filter((i: any) => {
      if (
        term &&
        !normalize(`${i.name} ${i.sku ?? ""} ${i.barcode ?? ""} ${i.brand ?? ""}`).includes(term)
      )
        return false;
      if (macroFilter !== "todos" && i.product_id !== macroFilter) return false;
      if (subFilter !== "todos" && i.category_id !== subFilter) return false;
      if (brandFilter !== "todos" && i.brand !== brandFilter) return false;
      if (supplierFilter !== "todos" && i.supplier_id !== supplierFilter) return false;
      if (stockFilter === "com" && Number(i.quantity ?? 0) <= 0) return false;
      if (stockFilter === "sem" && Number(i.quantity ?? 0) > 0) return false;
      if (stockFilter === "baixo" && Number(i.quantity ?? 0) > Number(i.min_quantity ?? 0))
        return false;
      if (stockFilter === "inativos" && i.is_active !== false) return false;
      if (stockFilter !== "inativos" && i.is_active === false) return false;
      return true;
    });
  }, [items, search, macroFilter, subFilter, brandFilter, supplierFilter, stockFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const i of filtered) {
      const key = `${macroNames.get(i.product_id) ?? "Sem categoria"} › ${
        (i.category_id ? subNames.get(i.category_id) : undefined) ?? "Sem subcategoria"
      }`;
      const current = map.get(key);
      if (current) current.push(i);
      else map.set(key, [i]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered, macroNames, subNames]);

  function specOf(i: any) {
    return [i.variation, i.size, i.weight, i.volume].filter(Boolean).join(" · ");
  }

  function catalogRows() {
    return [
      [
        "Categoria",
        "Subcategoria",
        "Produto",
        "Marca",
        "Código de barras",
        "Especificação",
        "Quantidade",
        "Preço (BRL)",
        "Preço (USD)",
        "Preço (PYG)",
      ],
      ...filtered.map((i: any) => [
        macroName(i.product_id),
        subName(i.category_id),
        i.name,
        i.brand ?? "",
        i.barcode ?? "",
        specOf(i),
        i.quantity ?? 0,
        ...(["BRL", "USD", "PYG"] as Currency[]).map(
          (target) =>
            pricesInAllCurrencies(i.price, i.currency ?? "USD").find(
              (entry) => entry.currency === target,
            )?.text ?? `${target}: —`,
        ),
      ]),
    ];
  }

  function exportCsv() {
    downloadCsv(`catalogo-${stamp()}.csv`, catalogRows());
  }

  function exportText() {
    const lines: string[] = [`Catálogo OS — ${new Date().toLocaleDateString("pt-BR")}`, ""];
    for (const [group, list] of grouped) {
      lines.push(`*${group}*`);
      for (const i of list) {
        const spec = specOf(i);
        lines.push(
          `• ${i.name}${spec ? ` (${spec})` : ""} — ${priceTextInAllCurrencies(i.price, i.currency ?? "USD")} — ${formatNumber(i.quantity ?? 0)} un`,
        );
      }
      lines.push("");
    }
    downloadText(`catalogo-${stamp()}.txt`, lines.join("\n"));
  }

  /* ---------------- ficha do produto ---------------- */

  const openForm = (item?: any) => {
    const catalogConfig = item?.id ? catalogConfigs[item.id] : null;
    setForm(
      item
        ? {
            ...item,
            catalog_media: catalogConfig?.media ?? [],
            info_group_url: catalogConfig?.infoGroupUrl ?? "",
            catalog_seller_ids: catalogConfig?.sellerIds ?? [],
          }
        : {
            name: "",
            currency: "USD",
            quantity: 0,
            min_quantity: 0,
            cost: 0,
            price: 0,
            tax_percent: 0,
            extra_cost: 0,
            markup_percent: 0,
            is_active: true,
            product_id: macroFilter !== "todos" ? macroFilter : null,
            category_id: subFilter !== "todos" ? subFilter : null,
            catalog_media: [],
            info_group_url: "",
            catalog_seller_ids: [],
          },
    );
  };

  const totalCost =
    Number(form?.cost ?? 0) * (1 + Number(form?.tax_percent ?? 0) / 100) +
    Number(form?.extra_cost ?? 0);
  const profit = Number(form?.price ?? 0) - totalCost;
  const marginPct = Number(form?.price ?? 0) > 0 ? (profit / Number(form.price)) * 100 : 0;

  function applyMarkup() {
    const markup = Number(form?.markup_percent ?? 0);
    setForm({ ...form, price: Number((totalCost * (1 + markup / 100)).toFixed(2)) });
  }

  async function pickImage(file: File) {
    try {
      const path = await uploadProductImage(file);
      setForm((f: any) => ({ ...f, image_url: path }));
      toast.success("Foto enviada.");
    } catch {
      toast.error("Não foi possível enviar a foto.");
    }
  }

  async function pickCatalogMedia(file: File) {
    try {
      const path = await uploadProductMedia(file);
      setForm((current: any) => ({
        ...current,
        catalog_media: [
          ...(Array.isArray(current?.catalog_media) ? current.catalog_media : []),
          {
            id: crypto.randomUUID(),
            kind: file.type.startsWith("video/") ? "video" : "image",
            path,
            label: file.name,
          },
        ],
      }));
      toast.success(file.type.startsWith("video/") ? "Vídeo enviado." : "Foto adicionada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar o arquivo.");
    } finally {
      if (mediaFileRef.current) mediaFileRef.current.value = "";
    }
  }

  function addCatalogMediaLink() {
    const raw = String(form?.catalog_media_url ?? "").trim();
    if (!raw) return void toast.error("Cole o link da foto, vídeo ou rede social.");
    try {
      const parsed = new URL(raw);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
    } catch {
      return void toast.error("Informe um link válido iniciado por http:// ou https://.");
    }
    const media = Array.isArray(form?.catalog_media) ? form.catalog_media : [];
    setForm((current: any) => ({
      ...current,
      catalog_media: [
        ...media,
        {
          id: crypto.randomUUID(),
          kind: /\.(mp4|webm|ogg|mov)(\?|$)/i.test(raw) ? "video" : "link",
          url: raw,
          label: String(current.catalog_media_label ?? "").trim() || null,
        },
      ],
      catalog_media_url: "",
      catalog_media_label: "",
    }));
  }

  async function saveItem() {
    if (!form?.name) return void toast.error("Informe o nome do produto.");
    const groupUrl = String(form.info_group_url ?? "").trim();
    if (groupUrl) {
      try {
        const parsed = new URL(groupUrl);
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
      } catch {
        return void toast.error("Informe um link válido para o grupo de informações.");
      }
    }
    setSaving(true);
    const payload: any = {
      name: form.name,
      sku: form.sku || null,
      barcode: form.barcode || null,
      brand: form.brand || null,
      description: form.description || null,
      location: form.location || null,
      image_url: form.image_url || null,
      product_id: form.product_id || null,
      category_id: form.category_id || null,
      supplier_id: form.supplier_id || null,
      variation: form.variation || null,
      size: form.size || null,
      weight: form.weight || null,
      volume: form.volume || null,
      unit: form.unit || null,
      currency: form.currency ?? "USD",
      quantity: Number(form.quantity ?? 0),
      min_quantity: Number(form.min_quantity ?? 0),
      cost: Number(form.cost ?? 0),
      price: Number(form.price ?? 0),
      tax_percent: Number(form.tax_percent ?? 0),
      extra_cost: Number(form.extra_cost ?? 0),
      markup_percent: Number(form.markup_percent ?? 0),
      is_active: form.is_active !== false,
    };
    const result = form.id
      ? await supabase
          .from("inventory_items")
          .update(payload)
          .eq("id", form.id)
          .select("id")
          .single()
      : await supabase.from("inventory_items").insert(payload).select("id").single();
    const { data: savedItem, error } = result;
    if (!error && savedItem?.id) {
      try {
        await saveProductCatalogConfig(savedItem.id, {
          media: Array.isArray(form.catalog_media) ? form.catalog_media : [],
          infoGroupUrl: groupUrl || null,
          sellerIds: Array.isArray(form.catalog_seller_ids) ? form.catalog_seller_ids : [],
        });
      } catch {
        setSaving(false);
        return void toast.error(
          "O produto foi salvo, mas não foi possível salvar a mídia do catálogo.",
        );
      }
    }
    setSaving(false);
    if (error) return void toast.error("Não foi possível salvar o produto.");
    toast.success("Produto salvo.");
    setForm(null);
    queryClient.invalidateQueries();
  }

  /* ---------------- ações em massa ---------------- */

  const allSelected = filtered.length > 0 && selected.length === filtered.length;
  const toggleAll = (force?: boolean) =>
    setSelected(
      force ? filtered.map((i: any) => i.id) : allSelected ? [] : filtered.map((i: any) => i.id),
    );
  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  function openQuick(scope: "selecionados" | "categoria" | "subcategoria" = "selecionados") {
    setQuick({
      title: "",
      pricing_rules: {
        version: 2,
        enabled: true,
        freight: 0,
        commission: 0,
        markup: 0,
        discount: 0,
        prices: {},
      },
      scope,
      macroId: macroFilter !== "todos" ? macroFilter : (macros[0]?.id ?? ""),
      subId: subFilter !== "todos" ? subFilter : (subs[0]?.id ?? ""),
      is_published: true,
      show_prices: true,
      orders_enabled: true,
      currency,
      default_seller_id: "",
    });
  }

  async function bulk(action: string) {
    if (action === "catalogo") {
      openQuick(
        selected.length ? "selecionados" : macroFilter !== "todos" ? "categoria" : "selecionados",
      );
      return;
    }
    if (!selected.length) return;

    if (action === "exportar") {
      const list = filtered.filter((i: any) => selected.includes(i.id));
      downloadCsv(`selecionados-${stamp()}.csv`, [
        ["Produto", "Marca", "Quantidade", "Preço (BRL)", "Preço (USD)", "Preço (PYG)"],
        ...list.map((i: any) => [
          i.name,
          i.brand ?? "",
          i.quantity ?? 0,
          ...(["BRL", "USD", "PYG"] as Currency[]).map(
            (target) =>
              pricesInAllCurrencies(i.price, i.currency ?? "USD").find(
                (entry) => entry.currency === target,
              )?.text ?? `${target}: —`,
          ),
        ]),
      ]);
      return;
    }
    if (action === "excluir") {
      if (!window.confirm(`Excluir ${selected.length} produto(s)?`)) return;
      const { error } = await supabase.from("inventory_items").delete().in("id", selected);
      if (error) return void toast.error("Não foi possível excluir.");
    }
    if (action === "ativar" || action === "desativar") {
      const { error } = await supabase
        .from("inventory_items")
        .update({ is_active: action === "ativar" })
        .in("id", selected);
      if (error) return void toast.error("Não foi possível atualizar.");
    }
    if (action === "duplicar") {
      const list = items.filter((i: any) => selected.includes(i.id));
      const copies = list.map((i: any) => {
        const { id: _id, created_at, updated_at, ...rest } = i;
        return { ...rest, name: `${i.name} (cópia)` };
      });
      const { error } = await supabase.from("inventory_items").insert(copies);
      if (error) return void toast.error("Não foi possível duplicar.");
    }
    setSelected([]);
    toast.success("Pronto.");
    queryClient.invalidateQueries();
  }

  async function saveQuickCatalog() {
    const q = quick;
    if (!q) return;
    if (!q.title?.trim()) return void toast.error("Dê um nome ao catálogo.");
    if (q.scope === "selecionados" && !selected.length)
      return void toast.error("Selecione pelo menos um produto.");
    if (q.scope === "categoria" && !q.macroId) return void toast.error("Escolha a categoria.");
    if (q.scope === "subcategoria" && !q.subId) return void toast.error("Escolha a subcategoria.");
    const invalid = pricingError(
      q.pricing_rules,
      items.filter((i) =>
        q.scope === "selecionados"
          ? selected.includes(i.id)
          : q.scope === "categoria"
            ? i.product_id === q.macroId
            : i.category_id === q.subId,
      ),
    );
    if (invalid) return void toast.error(invalid);
    setQuickSaving(true);
    const slug = `${slugify(q.title) || "catalogo"}-${Math.random().toString(36).slice(2, 7)}`;
    const { data, error } = await supabase
      .from("digital_catalogs")
      .insert({
        pricing_rules: q.pricing_rules ?? null,
        title: q.title.trim(),
        slug,
        currency: q.currency ?? "USD",
        show_prices: !!q.show_prices,
        orders_enabled: !!q.orders_enabled,
        is_published: !!q.is_published,
        item_ids: q.scope === "selecionados" ? selected : [],
        product_ids: q.scope === "categoria" ? [q.macroId] : [],
        category_ids: q.scope === "subcategoria" ? [q.subId] : [],
        default_seller_id: q.default_seller_id || null,
      } as any)
      .select("slug")
      .maybeSingle();
    setQuickSaving(false);
    if (error || !data) return void toast.error("Não foi possível criar o catálogo.");
    try {
      await ensureCatalogContactList(q.title, data.slug, {
        productIds: q.scope === "categoria" ? [q.macroId] : [],
        categoryIds: q.scope === "subcategoria" ? [q.subId] : [],
        itemIds: q.scope === "selecionados" ? selected : [],
      });
    } catch {
      return void toast.error(
        "O catálogo foi criado, mas a lista de contatos não pôde ser criada.",
      );
    }
    await navigator.clipboard?.writeText(linkOf(data.slug)).catch(() => undefined);
    toast.success("Catálogo e lista de contatos criados. Link copiado.");
    setQuick(null);
    setSelected([]);
    setBulkAction("");
    queryClient.invalidateQueries();
  }

  /* ---------------- catálogos digitais ---------------- */

  function listProductId(scope: {
    productIds?: string[];
    categoryIds?: string[];
    itemIds?: string[];
    offerItemIds?: string[];
  }) {
    const ids = new Set((scope.productIds ?? []).filter(Boolean));
    for (const categoryId of scope.categoryIds ?? []) {
      const productId = subs.find((sub: any) => sub.id === categoryId)?.product_id;
      if (productId) ids.add(productId);
    }
    for (const itemId of [...(scope.itemIds ?? []), ...(scope.offerItemIds ?? [])]) {
      const productId = items.find((item: any) => item.id === itemId)?.product_id;
      if (productId) ids.add(productId);
    }
    return ids.size === 1 ? [...ids][0] : null;
  }

  async function ensureCatalogContactList(
    title: string,
    slug: string,
    scope: {
      productIds?: string[];
      categoryIds?: string[];
      itemIds?: string[];
      offerItemIds?: string[];
    },
  ) {
    const source = `catalogo:${slug}`;
    const listName = `Catálogo — ${title.trim()}`;
    const productId = listProductId(scope);
    const { data: existing, error: readError } = await supabase
      .from("contact_lists")
      .select("id")
      .eq("source", source)
      .maybeSingle();
    if (readError) throw readError;
    if (existing) {
      const { error } = await supabase
        .from("contact_lists")
        .update({
          name: listName,
          description: `Contatos originados no catálogo ${title.trim()}.`,
          product_id: productId,
        })
        .eq("id", existing.id);
      if (error) throw error;
      return existing.id;
    }
    const { data: auth } = await supabase.auth.getUser();
    const { data: created, error } = await supabase
      .from("contact_lists")
      .insert({
        name: listName,
        description: `Contatos originados no catálogo ${title.trim()}.`,
        source,
        product_id: productId,
        created_by: auth.user?.id ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;
    return created.id;
  }

  const openCatalogForm = (c?: any) =>
    setCatalogForm(
      c
        ? { ...c }
        : {
            pricing_rules: {
              version: 2,
              enabled: true,
              freight: 0,
              commission: 0,
              markup: 0,
              discount: 0,
              prices: {},
              products: {},
            },
            title: "",
            slug: "",
            description: "",
            about: "",
            show_prices: true,
            currency: "USD",
            whatsapp: "",
            contact_email: "",
            contact_phone: "",
            contact_address: "",
            logo_url: "",
            banner_url: "cc4778e7-458f-4f7a-b4d4-02409b0a65e9.png",
            primary_color: "",
            accent_color: "",
            sort_mode: "nome",
            consult_label: "Fazer pedido",
            require_identification: true,
            show_availability: true,
            orders_enabled: true,
            success_message: "",
            installments_enabled: false,
            installments_max: 12,
            payment_methods: [],
            pickup_enabled: true,
            pickup_address: "",
            delivery_enabled: false,
            shipping_mode: "combinar",
            shipping_fee: 0,
            shipping_days: null,
            shipping_regions: [],
            product_ids: [],
            category_ids: [],
            item_ids: [],
            offer_item_ids: [],
            is_published: true,
          },
    );

  async function saveCatalog() {
    const f = catalogForm;
    if (!f?.title) return void toast.error("Dê um nome ao catálogo.");
    const invalid = pricingError(
      f.pricing_rules,
      items.filter((i) =>
        f.item_ids?.length
          ? f.item_ids.includes(i.id)
          : f.category_ids?.length
            ? f.category_ids.includes(i.category_id)
            : f.product_ids?.length
              ? f.product_ids.includes(i.product_id)
              : true,
      ),
    );
    if (invalid) return void toast.error(invalid);
    const slug = slugify(f.slug || f.title) || `catalogo-${Date.now()}`;
    const payload: any = {
      pricing_rules: f.pricing_rules ?? null,
      title: f.title,
      slug,
      description: f.description || null,
      about: f.about || null,
      show_prices: !!f.show_prices,
      default_seller_id: f.default_seller_id || null,
      currency: f.currency ?? "USD",
      whatsapp: f.whatsapp || null,
      contact_email: f.contact_email || null,
      contact_phone: f.contact_phone || null,
      contact_address: f.contact_address || null,
      logo_url: f.logo_url || null,
      banner_url: f.banner_url || null,
      primary_color: f.primary_color || null,
      accent_color: f.accent_color || null,
      sort_mode: f.sort_mode ?? "nome",
      consult_label: f.consult_label || "Consultar",
      require_identification: f.require_identification !== false,
      show_availability: f.show_availability !== false,
      orders_enabled: !!f.orders_enabled,
      success_message: f.success_message || null,
      installments_enabled: !!f.installments_enabled,
      installments_max: Number(f.installments_max ?? 12) || 12,
      payment_methods: f.payment_methods ?? [],
      pickup_enabled: f.pickup_enabled !== false,
      pickup_address: f.pickup_address || null,
      delivery_enabled: !!f.delivery_enabled,
      shipping_mode: f.shipping_mode ?? "combinar",
      shipping_fee: Number(f.shipping_fee ?? 0) || 0,
      shipping_days:
        f.shipping_days === "" || f.shipping_days == null ? null : Number(f.shipping_days),
      shipping_regions: (f.shipping_regions ?? []).filter((r: any) => r?.name),
      product_ids: f.product_ids ?? [],
      category_ids: f.category_ids ?? [],
      offer_item_ids: f.offer_item_ids ?? [],
      is_published: f.is_published !== false,
    };
    const { error } = f.id
      ? await supabase.from("digital_catalogs").update(payload).eq("id", f.id)
      : await supabase.from("digital_catalogs").insert(payload);
    if (error)
      return void toast.error(
        error.message.includes("duplicate")
          ? "Já existe um catálogo com esse endereço."
          : "Não foi possível salvar o catálogo.",
      );
    try {
      await ensureCatalogContactList(f.title, slug, {
        productIds: f.product_ids ?? [],
        categoryIds: f.category_ids ?? [],
        itemIds: f.item_ids ?? [],
        offerItemIds: f.offer_item_ids ?? [],
      });
    } catch {
      return void toast.error("O catálogo foi salvo, mas a lista de contatos não pôde ser criada.");
    }
    toast.success("Catálogo e lista de contatos salvos.");
    setCatalogForm(null);
    queryClient.invalidateQueries();
  }

  async function deleteCatalog(id: string) {
    if (!window.confirm("Excluir este catálogo digital?")) return;
    const { error } = await supabase.from("digital_catalogs").delete().eq("id", id);
    if (error) return void toast.error("Não foi possível excluir.");
    queryClient.invalidateQueries();
  }

  const linkOf = (slug: string) =>
    typeof window === "undefined"
      ? `/catalogo/${slug}`
      : `${window.location.origin}/catalogo/${slug}`;

  return (
    <section className="surface-card mt-6 p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-semibold">Catálogo e tabela de preços</h2>
          <p className="text-muted-foreground text-sm">
            Vitrine montada a partir do estoque, com foto, ficha completa e link para enviar ao
            cliente.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => openCatalogForm()}>
            <Globe className="mr-2 size-4" /> Novo catálogo digital
          </Button>
          <Select
            value={currency}
            onValueChange={(v) => {
              setCurrencyTouched(true);
              setCurrency(v as Currency);
            }}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DISPLAY_CURRENCIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => setOpen(true)}>
            <Wand2 className="mr-2 size-4" /> Atualizar estoque por texto
          </Button>
          <Button variant="outline" onClick={exportText}>
            <FileText className="mr-2 size-4" /> Exportar texto
          </Button>
          <Button variant="outline" onClick={exportCsv}>
            <Download className="mr-2 size-4" /> Exportar planilha
          </Button>
          <SheetLinkExportButton build={catalogRows} />
          <ReportButton
            title="Relatório de catálogo e estoque"
            filename="catalogo"
            build={() => ({
              highlights: [
                { label: "Produtos", value: String(filtered.length) },
                {
                  label: "Quantidade total",
                  value: formatNumber(
                    filtered.reduce((s: number, i: any) => s + Number(i.quantity ?? 0), 0),
                  ),
                },
                {
                  label: "Valor em estoque",
                  value: stockValueTextInAllCurrencies(filtered),
                },
              ],
              headers: [
                "Categoria",
                "Subcategoria",
                "Produto",
                "Quantidade",
                "Preço (BRL)",
                "Preço (USD)",
                "Preço (PYG)",
              ],
              rows: filtered.map((i: any) => [
                macroName(i.product_id),
                subName(i.category_id),
                i.name,
                i.quantity ?? 0,
                ...(["BRL", "USD", "PYG"] as Currency[]).map(
                  (target) =>
                    pricesInAllCurrencies(i.price, i.currency ?? "USD").find(
                      (entry) => entry.currency === target,
                    )?.text ?? `${target}: —`,
                ),
              ]),
            })}
          />
        </div>
      </div>

      {/* catálogos digitais */}
      {catalogs.length > 0 && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {catalogs.map((c: any) => (
            <div key={c.id} className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.title}</p>
                  <p className="text-muted-foreground truncate text-xs">/catalogo/{c.slug}</p>
                </div>
                <Badge variant={c.is_published ? "secondary" : "outline"}>
                  {c.is_published ? "publicado" : "rascunho"}
                </Badge>
              </div>
              <p className="text-muted-foreground mt-1 text-xs">
                {c.show_prices ? "Com preços" : "Sem preços (sob consulta)"}
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(linkOf(c.slug));
                    toast.success("Link copiado.");
                  }}
                >
                  <Copy className="mr-1 size-3" /> Copiar link
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <a href={`/catalogo/${c.slug}`} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-1 size-3" /> Abrir
                  </a>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => openCatalogForm(c)}>
                  <Pencil className="size-3" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => deleteCatalog(c.id)}>
                  <Trash2 className="text-destructive size-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* filtros */}
      <div className="mb-4 grid gap-2 md:grid-cols-3 lg:grid-cols-6">
        <div className="relative lg:col-span-2">
          <Search className="text-muted-foreground absolute top-2.5 left-2 size-4" />
          <Input
            className="pl-8"
            placeholder="Nome, código de barras ou SKU"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={macroFilter} onValueChange={setMacroFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas as categorias</SelectItem>
            {macros.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={subFilter} onValueChange={setSubFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Subcategoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas as subcategorias</SelectItem>
            {subs
              .filter((s) => macroFilter === "todos" || s.product_id === macroFilter)
              .map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Select value={brandFilter} onValueChange={setBrandFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Marca" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas as marcas</SelectItem>
            {brands.map((b) => (
              <SelectItem key={b} value={b}>
                {b}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={supplierFilter} onValueChange={setSupplierFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Fornecedor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os fornecedores</SelectItem>
            {suppliers.map((s: any) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={stockFilter} onValueChange={setStockFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Estoque" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Ativos</SelectItem>
            <SelectItem value="com">Com estoque</SelectItem>
            <SelectItem value="sem">Sem estoque</SelectItem>
            <SelectItem value="baixo">Estoque baixo</SelectItem>
            <SelectItem value="inativos">Inativos</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Button
            variant={view === "cards" ? "default" : "outline"}
            size="icon"
            onClick={() => setView("cards")}
            aria-label="Ver em cards"
          >
            <LayoutGrid className="size-4" />
          </Button>
          <Button
            variant={view === "lista" ? "default" : "outline"}
            size="icon"
            onClick={() => setView("lista")}
            aria-label="Ver em lista"
          >
            <List className="size-4" />
          </Button>
          <span className="text-muted-foreground text-xs">{filtered.length} registro(s)</span>
        </div>
      </div>

      {/* ações em massa */}
      <div className="mb-4 space-y-3 rounded-lg border p-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label className="text-xs">Ação</Label>
            <Select value={bulkAction} onValueChange={setBulkAction}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma ação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="catalogo">Criar catálogo online com os selecionados</SelectItem>
                <SelectItem value="exportar">Exportar selecionados</SelectItem>
                <SelectItem value="duplicar">Duplicar selecionados</SelectItem>
                <SelectItem value="ativar">Ativar selecionados</SelectItem>
                <SelectItem value="desativar">Desativar selecionados</SelectItem>
                <SelectItem value="excluir">Excluir selecionados</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <p className="text-muted-foreground rounded-md bg-muted/60 p-2 text-xs">
              Escolha o que deseja fazer com os produtos marcados e clique em Executar.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => toggleAll(true)}>
            Selecionar todos da página
          </Button>
          <Button size="sm" variant="outline" onClick={() => setSelected([])}>
            Limpar seleção
          </Button>
          <Button size="sm" onClick={() => bulk("catalogo")}>
            <Globe className="mr-1 size-4" /> Criar catálogo online
          </Button>

          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium">
            {selected.length} produto(s) selecionado(s)
          </span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setBulkAction("")}>
              Limpar ação
            </Button>
            <Button
              size="sm"
              disabled={!selected.length || !bulkAction}
              onClick={() => bulk(bulkAction)}
            >
              Executar
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={!!quick} onOpenChange={(v) => !v && setQuick(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Novo catálogo online</DialogTitle>
            <DialogDescription>
              Escolha o que entra neste catálogo e gere o link automaticamente.
            </DialogDescription>
          </DialogHeader>
          {quick && (
            <div className="space-y-4">
              <div>
                <CatalogPricing
                  value={quick.pricing_rules}
                  onChange={(pricing_rules) => setQuick({ ...quick, pricing_rules })}
                  items={items.filter((i) =>
                    quick.scope === "selecionados"
                      ? selected.includes(i.id)
                      : quick.scope === "categoria"
                        ? i.product_id === quick.macroId
                        : quick.scope === "subcategoria"
                          ? i.category_id === quick.subId
                          : true,
                  )}
                  currency={quick.currency ?? "USD"}
                  convert={convert}
                />
                <Label className="text-xs">Nome do catálogo</Label>
                <Input
                  value={quick.title}
                  onChange={(e) => setQuick({ ...quick, title: e.target.value })}
                  placeholder="Ex.: Ofertas de setembro"
                />
              </div>
              <div>
                <Label className="text-xs">O que entra no catálogo</Label>
                <Select
                  value={quick.scope ?? "selecionados"}
                  onValueChange={(v) => setQuick({ ...quick, scope: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="selecionados">
                      Produtos selecionados ({selected.length})
                    </SelectItem>
                    <SelectItem value="categoria">Uma categoria inteira</SelectItem>
                    <SelectItem value="subcategoria">Uma subcategoria</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {quick.scope === "categoria" && (
                <div>
                  <Label className="text-xs">Categoria</Label>
                  <Select
                    value={quick.macroId || ""}
                    onValueChange={(v) => setQuick({ ...quick, macroId: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Escolher" />
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
              )}
              {quick.scope === "subcategoria" && (
                <div>
                  <Label className="text-xs">Subcategoria</Label>
                  <Select
                    value={quick.subId || ""}
                    onValueChange={(v) => setQuick({ ...quick, subId: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Escolher" />
                    </SelectTrigger>
                    <SelectContent>
                      {subs.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {macroName(s.product_id)} · {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Moeda exibida</Label>
                  <Select
                    value={quick.currency}
                    onValueChange={(v) => changeCatalogCurrency(quick, setQuick, v as Currency)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DISPLAY_CURRENCIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Vendedor responsável pelos pedidos</Label>
                  <Select
                    value={quick.default_seller_id || "nenhum"}
                    onValueChange={(v) =>
                      setQuick({ ...quick, default_seller_id: v === "nenhum" ? "" : v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sem responsável" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nenhum">Sem responsável</SelectItem>
                      {sellers.map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.full_name ?? "Sem nome"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Catálogo público</p>
                    <p className="text-muted-foreground text-xs">
                      Qualquer pessoa com o link consegue abrir.
                    </p>
                  </div>
                  <Switch
                    checked={!!quick.is_published}
                    onCheckedChange={(v) => setQuick({ ...quick, is_published: v })}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Mostrar preços</p>
                    <p className="text-muted-foreground text-xs">
                      Desligado, o cliente vê o botão de consultar.
                    </p>
                  </div>
                  <Switch
                    checked={!!quick.show_prices}
                    onCheckedChange={(v) => setQuick({ ...quick, show_prices: v })}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Receber pedidos</p>
                    <p className="text-muted-foreground text-xs">
                      Os pedidos chegam como pré-pedido para o responsável.
                    </p>
                  </div>
                  <Switch
                    checked={!!quick.orders_enabled}
                    onCheckedChange={(v) => setQuick({ ...quick, orders_enabled: v })}
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuick(null)}>
              Cancelar
            </Button>
            <Button onClick={saveQuickCatalog} disabled={quickSaving}>
              {quickSaving ? "Criando..." : "Criar catálogo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {filtered.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nenhum produto encontrado com esses filtros.
        </p>
      ) : view === "cards" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {filtered.map((i: any) => (
            <article
              key={i.id}
              className={cn(
                "overflow-hidden rounded-lg border transition",
                selected.includes(i.id) && "ring-primary ring-2",
              )}
            >
              <div className="bg-muted relative aspect-square w-full">
                {imageOf(i) ? (
                  <img src={imageOf(i)} alt={i.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="text-muted-foreground flex h-full items-center justify-center">
                    <ImageIcon className="size-8" />
                  </div>
                )}
                <div className="absolute top-2 left-2 rounded bg-background/85 p-1">
                  <Checkbox
                    checked={selected.includes(i.id)}
                    onCheckedChange={() => toggle(i.id)}
                  />
                </div>
                {i.is_active === false && (
                  <Badge variant="outline" className="bg-background/85 absolute top-2 right-2">
                    inativo
                  </Badge>
                )}
              </div>
              <div className="space-y-1 p-3">
                <p className="truncate font-medium">{i.name}</p>
                <p className="text-muted-foreground truncate text-xs">
                  {macroName(i.product_id)} › {subName(i.category_id)}
                </p>
                <div className="space-y-0.5">
                  {pricesInAllCurrencies(i.price, i.currency ?? "USD").map((value) => (
                    <p
                      key={value.currency}
                      className={cn(
                        "leading-tight",
                        value.currency === currency
                          ? "font-display text-lg font-semibold"
                          : "text-muted-foreground text-xs",
                      )}
                    >
                      {value.text}
                    </p>
                  ))}
                </div>
                <div className="text-muted-foreground flex items-center justify-between text-xs">
                  <span>{i.barcode ?? i.sku ?? "sem código"}</span>
                  <span>{formatNumber(i.quantity ?? 0)} un</span>
                </div>
                <div className="flex gap-1 pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => openForm(i)}
                  >
                    <Pencil className="mr-1 size-3" /> Editar
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(([group, list]) => (
            <div key={group}>
              <p className="mb-2 font-medium">{group}</p>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead>Marca</TableHead>
                      <TableHead>Especificações</TableHead>
                      <TableHead>Fornecedor</TableHead>
                      <TableHead className="text-right">Quantidade</TableHead>
                      <TableHead className="text-right">Preço</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.map((i: any) => (
                      <TableRow key={i.id}>
                        <TableCell>
                          <Checkbox
                            checked={selected.includes(i.id)}
                            onCheckedChange={() => toggle(i.id)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          {i.name}
                          {i.is_demo && (
                            <Badge variant="secondary" className="ml-2 text-[10px]">
                              demo
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{i.brand ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{specOf(i) || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {supplierName(i.supplier_id)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatNumber(i.quantity ?? 0)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="space-y-0.5">
                            {pricesInAllCurrencies(i.price, i.currency ?? "USD").map((value) => (
                              <p
                                key={value.currency}
                                className={cn(
                                  "leading-tight",
                                  value.currency === currency
                                    ? "font-semibold"
                                    : "text-muted-foreground text-xs",
                                )}
                              >
                                {value.text}
                              </p>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => openForm(i)}>
                            <Pencil className="size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ficha completa do produto */}
      <Dialog open={!!form} onOpenChange={(v) => !v && setForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Editar produto" : "Novo produto"}</DialogTitle>
            <DialogDescription>
              Ficha completa: dados, foto, preços e estoque. O catálogo digital usa essas
              informações.
            </DialogDescription>
          </DialogHeader>
          {form && (
            <Tabs defaultValue="dados">
              <TabsList>
                <TabsTrigger value="dados">Dados do produto</TabsTrigger>
                <TabsTrigger value="catalogo">Catálogo online</TabsTrigger>
                <TabsTrigger value="precos">Preços / estoque</TabsTrigger>
              </TabsList>

              <TabsContent value="dados" className="space-y-4 pt-3">
                <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
                  <div>
                    <div className="bg-muted flex aspect-square items-center justify-center overflow-hidden rounded-lg border">
                      {form.image_url && imagesQuery.data?.[form.image_url] ? (
                        <img
                          src={imagesQuery.data[form.image_url]}
                          alt={form.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="text-muted-foreground size-10" />
                      )}
                    </div>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void pickImage(f);
                      }}
                    />
                    <Button
                      variant="outline"
                      className="mt-2 w-full"
                      onClick={() => fileRef.current?.click()}
                    >
                      Escolher foto
                    </Button>
                    {form.image_url && (
                      <Button
                        variant="ghost"
                        className="w-full"
                        onClick={() => setForm({ ...form, image_url: null })}
                      >
                        Remover foto
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Label>Nome</Label>
                      <Input
                        value={form.name ?? ""}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Marca</Label>
                      <Input
                        value={form.brand ?? ""}
                        onChange={(e) => setForm({ ...form, brand: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Código de barras</Label>
                      <Input
                        value={form.barcode ?? ""}
                        onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>SKU / código interno</Label>
                      <Input
                        value={form.sku ?? ""}
                        onChange={(e) => setForm({ ...form, sku: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Unidade</Label>
                      <Input
                        value={form.unit ?? ""}
                        onChange={(e) => setForm({ ...form, unit: e.target.value })}
                        placeholder="un, cx, kg"
                      />
                    </div>
                    <div>
                      <Label>Categoria</Label>
                      <Select
                        value={form.product_id ?? ""}
                        onValueChange={(v) =>
                          setForm({ ...form, product_id: v, category_id: null })
                        }
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
                        value={form.category_id ?? ""}
                        onValueChange={(v) => setForm({ ...form, category_id: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {subs
                            .filter((s) => !form.product_id || s.product_id === form.product_id)
                            .map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Fornecedor</Label>
                      <Select
                        value={form.supplier_id ?? ""}
                        onValueChange={(v) => setForm({ ...form, supplier_id: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {suppliers.map((s: any) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Localização no estoque</Label>
                      <Input
                        value={form.location ?? ""}
                        onChange={(e) => setForm({ ...form, location: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Variação</Label>
                      <Input
                        value={form.variation ?? ""}
                        onChange={(e) => setForm({ ...form, variation: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Tamanho</Label>
                      <Input
                        value={form.size ?? ""}
                        onChange={(e) => setForm({ ...form, size: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Peso</Label>
                      <Input
                        value={form.weight ?? ""}
                        onChange={(e) => setForm({ ...form, weight: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Volume</Label>
                      <Input
                        value={form.volume ?? ""}
                        onChange={(e) => setForm({ ...form, volume: e.target.value })}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label>Descrição / observações</Label>
                      <Textarea
                        rows={3}
                        value={form.description ?? ""}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                      />
                    </div>
                    <div className="flex items-center gap-2 sm:col-span-2">
                      <Switch
                        checked={form.is_active !== false}
                        onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                      />
                      <span className="text-sm">Produto ativo (aparece no catálogo)</span>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="catalogo" className="space-y-5 pt-3">
                <section className="space-y-3 rounded-lg border p-4">
                  <div>
                    <h3 className="font-medium">Carrossel do produto</h3>
                    <p className="text-sm text-muted-foreground">
                      Adicione fotos, vídeos ou links do YouTube, Instagram e Facebook.
                    </p>
                  </div>
                  <input
                    ref={mediaFileRef}
                    type="file"
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void pickCatalogMedia(file);
                    }}
                  />
                  <Button variant="outline" onClick={() => mediaFileRef.current?.click()}>
                    <Upload className="mr-2 size-4" /> Adicionar foto ou vídeo
                  </Button>
                  <div className="grid gap-2 sm:grid-cols-[1fr_180px_auto]">
                    <Input
                      type="url"
                      placeholder="Link do YouTube, Instagram, Facebook ou mídia"
                      value={form.catalog_media_url ?? ""}
                      onChange={(event) =>
                        setForm({ ...form, catalog_media_url: event.target.value })
                      }
                    />
                    <Input
                      placeholder="Título (opcional)"
                      value={form.catalog_media_label ?? ""}
                      onChange={(event) =>
                        setForm({ ...form, catalog_media_label: event.target.value })
                      }
                    />
                    <Button type="button" onClick={addCatalogMediaLink}>
                      <Plus className="mr-2 size-4" /> Adicionar
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(Array.isArray(form.catalog_media) ? form.catalog_media : []).map(
                      (media: any, index: number) => {
                        const source = media.path ? imagesQuery.data?.[media.path] : media.url;
                        return (
                          <div key={media.id ?? index} className="flex gap-3 rounded-lg border p-3">
                            <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                              {source && media.kind === "image" ? (
                                <img
                                  src={source}
                                  alt={media.label ?? "Mídia do produto"}
                                  className="h-full w-full object-cover"
                                />
                              ) : media.kind === "video" ? (
                                <Video className="size-6 text-muted-foreground" />
                              ) : (
                                <Link2 className="size-6 text-muted-foreground" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">
                                {media.label || (media.kind === "video" ? "Vídeo" : "Link externo")}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {media.path || media.url}
                              </p>
                            </div>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              aria-label="Remover mídia"
                              onClick={() =>
                                setForm({
                                  ...form,
                                  catalog_media: form.catalog_media.filter(
                                    (_: any, mediaIndex: number) => mediaIndex !== index,
                                  ),
                                })
                              }
                            >
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          </div>
                        );
                      },
                    )}
                  </div>
                </section>

                <section className="space-y-3 rounded-lg border p-4">
                  <div>
                    <Label>Link do grupo de informações</Label>
                    <Input
                      type="url"
                      placeholder="https://chat.whatsapp.com/..."
                      value={form.info_group_url ?? ""}
                      onChange={(event) => setForm({ ...form, info_group_url: event.target.value })}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      O catálogo mostrará o botão “Entrar no grupo de informações” neste produto.
                    </p>
                  </div>
                </section>

                <section className="space-y-3 rounded-lg border p-4">
                  <div>
                    <h3 className="font-medium">Vendedores disponíveis</h3>
                    <p className="text-sm text-muted-foreground">
                      O cliente escolhe um vendedor e o WhatsApp cadastrado é aberto
                      automaticamente.
                    </p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {sellers.map((seller: any) => {
                      const selectedSellers: string[] = Array.isArray(form.catalog_seller_ids)
                        ? form.catalog_seller_ids
                        : [];
                      return (
                        <label
                          key={seller.id}
                          className="flex items-center gap-3 rounded-lg border p-3 text-sm"
                        >
                          <Checkbox
                            checked={selectedSellers.includes(seller.id)}
                            onCheckedChange={(checked) =>
                              setForm({
                                ...form,
                                catalog_seller_ids: checked
                                  ? [...selectedSellers, seller.id]
                                  : selectedSellers.filter((id) => id !== seller.id),
                              })
                            }
                          />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{seller.full_name}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              O próprio vendedor cadastra o WhatsApp em Configurações
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {!sellers.length && (
                    <p className="text-sm text-muted-foreground">
                      Nenhum vendedor ativo foi encontrado.
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Sem seleção, o catálogo oferece todos os vendedores ativos. Quem estiver sem
                    WhatsApp continuará recebendo solicitações no sistema, mas o atalho de conversa
                    ficará indisponível até cadastrar o próprio número.
                  </p>
                </section>
              </TabsContent>

              <TabsContent value="precos" className="space-y-4 pt-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label>Moeda</Label>
                    <Select
                      value={form.currency ?? "USD"}
                      onValueChange={(v) => setForm({ ...form, currency: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USD">Dólar (US$)</SelectItem>
                        <SelectItem value="BRL">Real (R$)</SelectItem>
                        <SelectItem value="PYG">Guarani (₲)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Custo de compra</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.cost ?? 0}
                      onChange={(e) => setForm({ ...form, cost: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Impostos (%)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.tax_percent ?? 0}
                      onChange={(e) => setForm({ ...form, tax_percent: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Outros custos</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.extra_cost ?? 0}
                      onChange={(e) => setForm({ ...form, extra_cost: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Markup (%)</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        step="0.01"
                        value={form.markup_percent ?? 0}
                        onChange={(e) => setForm({ ...form, markup_percent: e.target.value })}
                      />
                      <Button variant="outline" onClick={applyMarkup}>
                        Aplicar
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label>Preço de venda</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.price ?? 0}
                      onChange={(e) => setForm({ ...form, price: e.target.value })}
                    />
                  </div>
                </div>
                <div className="bg-muted/40 grid gap-2 rounded-lg border p-3 sm:grid-cols-3">
                  <div>
                    <p className="text-muted-foreground text-xs">Custo total</p>
                    <p className="font-semibold">
                      <CurrencyValues value={totalCost} currency={form.currency ?? "USD"} />
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Lucro por unidade</p>
                    <CurrencyValues value={profit} currency={form.currency ?? "USD"} emphasize />
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Margem</p>
                    <p className="font-semibold">{marginPct.toFixed(2)}%</p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Estoque mínimo</Label>
                    <Input
                      type="number"
                      step="0.001"
                      value={form.min_quantity ?? 0}
                      onChange={(e) => setForm({ ...form, min_quantity: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Estoque atual</Label>
                    <Input
                      type="number"
                      step="0.001"
                      value={form.quantity ?? 0}
                      onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>
              Cancelar
            </Button>
            <Button onClick={saveItem} disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* catálogo digital */}
      <Dialog open={!!catalogForm} onOpenChange={(v) => !v && setCatalogForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {catalogForm?.id ? "Editar catálogo digital" : "Novo catálogo digital"}
            </DialogTitle>
            <DialogDescription>
              Gera um link que você envia ao cliente. Ele vê os produtos escolhidos, com ou sem
              preço.
            </DialogDescription>
          </DialogHeader>
          {catalogForm && (
            <Tabs defaultValue="info">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="info">Informações</TabsTrigger>
                <TabsTrigger value="design">Design</TabsTrigger>
                <TabsTrigger value="vendas">Vendas</TabsTrigger>
                <TabsTrigger value="entrega">Entrega</TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="grid gap-3 pt-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label>Nome do catálogo</Label>
                  <Input
                    value={catalogForm.title ?? ""}
                    onChange={(e) => setCatalogForm({ ...catalogForm, title: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Endereço do link</Label>
                  <div className="flex items-center gap-2">
                    <Link2 className="text-muted-foreground size-4" />
                    <Input
                      value={catalogForm.slug ?? ""}
                      placeholder={slugify(catalogForm.title ?? "") || "verao-2026"}
                      onChange={(e) => setCatalogForm({ ...catalogForm, slug: e.target.value })}
                    />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <Label>Descrição curta</Label>
                  <Textarea
                    rows={2}
                    value={catalogForm.description ?? ""}
                    onChange={(e) =>
                      setCatalogForm({ ...catalogForm, description: e.target.value })
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Sobre a loja</Label>
                  <Textarea
                    rows={3}
                    value={catalogForm.about ?? ""}
                    onChange={(e) => setCatalogForm({ ...catalogForm, about: e.target.value })}
                  />
                </div>
                <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                  O WhatsApp do catálogo vem do cadastro pessoal do vendedor escolhido. Números de
                  outros usuários não são exibidos nesta área.
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input
                    value={catalogForm.contact_phone ?? ""}
                    onChange={(e) =>
                      setCatalogForm({ ...catalogForm, contact_phone: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>E-mail</Label>
                  <Input
                    value={catalogForm.contact_email ?? ""}
                    onChange={(e) =>
                      setCatalogForm({ ...catalogForm, contact_email: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Endereço</Label>
                  <Input
                    value={catalogForm.contact_address ?? ""}
                    onChange={(e) =>
                      setCatalogForm({ ...catalogForm, contact_address: e.target.value })
                    }
                  />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={catalogForm.is_published !== false}
                      onCheckedChange={(v) => setCatalogForm({ ...catalogForm, is_published: v })}
                    />
                    Publicado
                  </label>
                </div>
                <div className="sm:col-span-2">
                  <Label>Categorias incluídas</Label>
                  <p className="text-muted-foreground mb-2 text-xs">
                    Sem marcar nada, o catálogo mostra todos os produtos ativos.
                  </p>
                  <div className="grid max-h-40 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
                    {macros.map((m) => {
                      const list: string[] = catalogForm.product_ids ?? [];
                      return (
                        <label key={m.id} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={list.includes(m.id)}
                            onCheckedChange={(v) =>
                              setCatalogForm({
                                ...catalogForm,
                                product_ids: v ? [...list, m.id] : list.filter((x) => x !== m.id),
                              })
                            }
                          />
                          {m.name}
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <Label>Subcategorias incluídas</Label>
                  <div className="grid max-h-40 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
                    {subs.map((s) => {
                      const list: string[] = catalogForm.category_ids ?? [];
                      return (
                        <label key={s.id} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={list.includes(s.id)}
                            onCheckedChange={(v) =>
                              setCatalogForm({
                                ...catalogForm,
                                category_ids: v ? [...list, s.id] : list.filter((x) => x !== s.id),
                              })
                            }
                          />
                          {s.name}
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <Label>Produtos em oferta (destaque)</Label>
                  <div className="grid max-h-40 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
                    {items.slice(0, 300).map((i: any) => {
                      const list: string[] = catalogForm.offer_item_ids ?? [];
                      return (
                        <label key={i.id} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={list.includes(i.id)}
                            onCheckedChange={(v) =>
                              setCatalogForm({
                                ...catalogForm,
                                offer_item_ids: v
                                  ? [...list, i.id]
                                  : list.filter((x) => x !== i.id),
                              })
                            }
                          />
                          <span className="truncate">{i.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="design" className="grid gap-3 pt-3 sm:grid-cols-2">
                <div>
                  <Label>Logo</Label>
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const path = await uploadProductImage(file);
                        setCatalogForm({ ...catalogForm, logo_url: path });
                        toast.success("Logo enviada.");
                      } catch {
                        toast.error("Não foi possível enviar a imagem.");
                      }
                    }}
                  />
                  {catalogForm.logo_url && (
                    <p className="text-muted-foreground mt-1 text-xs">Logo enviada.</p>
                  )}
                </div>
                <div>
                  <Label>Banner</Label>
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const path = await uploadProductImage(file);
                        setCatalogForm({ ...catalogForm, banner_url: path });
                        toast.success("Banner enviado.");
                      } catch {
                        toast.error("Não foi possível enviar a imagem.");
                      }
                    }}
                  />
                  {catalogForm.banner_url && (
                    <p className="text-muted-foreground mt-1 text-xs">Banner enviado.</p>
                  )}
                </div>
                <div>
                  <Label>Cor principal</Label>
                  <Input
                    placeholder="oklch(0.6 0.2 255) ou #2563eb"
                    value={catalogForm.primary_color ?? ""}
                    onChange={(e) =>
                      setCatalogForm({ ...catalogForm, primary_color: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Cor de destaque</Label>
                  <Input
                    placeholder="#a855f7"
                    value={catalogForm.accent_color ?? ""}
                    onChange={(e) =>
                      setCatalogForm({ ...catalogForm, accent_color: e.target.value })
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Ordenação dos produtos</Label>
                  <Select
                    value={catalogForm.sort_mode ?? "nome"}
                    onValueChange={(v) => setCatalogForm({ ...catalogForm, sort_mode: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nome">Nome (A–Z)</SelectItem>
                      <SelectItem value="preco">Menor preço</SelectItem>
                      <SelectItem value="preco_desc">Maior preço</SelectItem>
                      <SelectItem value="recentes">Mais recentes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>

              <TabsContent value="vendas" className="grid gap-3 pt-3 sm:grid-cols-2">
                <CatalogPricing
                  value={catalogForm.pricing_rules}
                  onChange={(pricing_rules) => setCatalogForm({ ...catalogForm, pricing_rules })}
                  items={items.filter((i) =>
                    catalogForm.item_ids?.length
                      ? catalogForm.item_ids.includes(i.id)
                      : catalogForm.category_ids?.length
                        ? catalogForm.category_ids.includes(i.category_id)
                        : catalogForm.product_ids?.length
                          ? catalogForm.product_ids.includes(i.product_id)
                          : true,
                  )}
                  currency={catalogForm.currency ?? "USD"}
                  onCurrencyChange={(target) =>
                    changeCatalogCurrency(catalogForm, setCatalogForm, target)
                  }
                  convert={convert}
                />
                <div className="sm:col-span-2">
                  <Label className="text-xs">Vendedor responsável pelos pedidos</Label>
                  <Select
                    value={catalogForm.default_seller_id || "nenhum"}
                    onValueChange={(v) =>
                      setCatalogForm({
                        ...catalogForm,
                        default_seller_id: v === "nenhum" ? "" : v,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sem responsável" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nenhum">Sem responsável</SelectItem>
                      {sellers.map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.full_name ?? "Sem nome"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-3 sm:col-span-2">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={catalogForm.show_prices !== false}
                      onCheckedChange={(v) => setCatalogForm({ ...catalogForm, show_prices: v })}
                    />
                    Mostrar preços
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={catalogForm.show_availability !== false}
                      onCheckedChange={(v) =>
                        setCatalogForm({ ...catalogForm, show_availability: v })
                      }
                    />
                    Mostrar disponibilidade
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={catalogForm.require_identification !== false}
                      onCheckedChange={(v) =>
                        setCatalogForm({ ...catalogForm, require_identification: v })
                      }
                    />
                    Exigir identificação do cliente
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={!!catalogForm.orders_enabled}
                      onCheckedChange={(v) => setCatalogForm({ ...catalogForm, orders_enabled: v })}
                    />
                    Habilitar pedidos pelo catálogo
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={!!catalogForm.installments_enabled}
                      onCheckedChange={(v) =>
                        setCatalogForm({ ...catalogForm, installments_enabled: v })
                      }
                    />
                    Simular parcelas
                  </label>
                </div>
                <div>
                  <Label>Texto quando o preço está oculto</Label>
                  <Input
                    value={catalogForm.consult_label ?? "Consultar"}
                    onChange={(e) =>
                      setCatalogForm({ ...catalogForm, consult_label: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Máximo de parcelas</Label>
                  <Input
                    type="number"
                    min={1}
                    value={catalogForm.installments_max ?? 12}
                    onChange={(e) =>
                      setCatalogForm({ ...catalogForm, installments_max: e.target.value })
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Mensagem de sucesso após o pedido</Label>
                  <Textarea
                    rows={2}
                    value={catalogForm.success_message ?? ""}
                    placeholder="Recebemos seu pedido! Entraremos em contato para confirmar."
                    onChange={(e) =>
                      setCatalogForm({ ...catalogForm, success_message: e.target.value })
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Formas de pagamento aceitas</Label>
                  <div className="grid gap-1 rounded-md border p-2 sm:grid-cols-2">
                    {PAYMENT_OPTIONS.map((m) => {
                      const list: string[] = catalogForm.payment_methods ?? [];
                      return (
                        <label key={m} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={list.includes(m)}
                            onCheckedChange={(v) =>
                              setCatalogForm({
                                ...catalogForm,
                                payment_methods: v ? [...list, m] : list.filter((x) => x !== m),
                              })
                            }
                          />
                          {m}
                        </label>
                      );
                    })}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="entrega" className="grid gap-3 pt-3 sm:grid-cols-2">
                <div className="flex flex-col gap-3 sm:col-span-2">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={catalogForm.pickup_enabled !== false}
                      onCheckedChange={(v) => setCatalogForm({ ...catalogForm, pickup_enabled: v })}
                    />
                    Permitir retirada
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={!!catalogForm.delivery_enabled}
                      onCheckedChange={(v) =>
                        setCatalogForm({ ...catalogForm, delivery_enabled: v })
                      }
                    />
                    Permitir entrega
                  </label>
                </div>
                <div className="sm:col-span-2">
                  <Label>Endereço de retirada</Label>
                  <Input
                    value={catalogForm.pickup_address ?? ""}
                    onChange={(e) =>
                      setCatalogForm({ ...catalogForm, pickup_address: e.target.value })
                    }
                  />
                </div>
                <div className="sm:col-span-2 rounded-lg border bg-muted/20 p-3">
                  <div className="mb-3">
                    <Label>Fretes por cidade</Label>
                    <p className="text-xs text-muted-foreground">
                      Cadastre valores diferentes por cidade. Quando a cidade não estiver cadastrada,
                      o catálogo usa a regra de frete do produto.
                    </p>
                  </div>
                  <div className="space-y-2">
                    {(catalogForm.shipping_regions ?? []).map((region: any, index: number) => (
                      <div key={index} className="grid gap-2 sm:grid-cols-[1fr_180px_140px_auto]">
                        <Input
                          placeholder="Cidade (ex.: São Paulo)"
                          value={region.name ?? ""}
                          onChange={(e) => {
                            const rows = [...(catalogForm.shipping_regions ?? [])];
                            rows[index] = { ...rows[index], name: e.target.value };
                            setCatalogForm({ ...catalogForm, shipping_regions: rows });
                          }}
                        />
                        <Input
                          inputMode="decimal"
                          placeholder={`Frete (${catalogForm.currency ?? "BRL"})`}
                          value={region.fee ?? ""}
                          onChange={(e) => {
                            const rows = [...(catalogForm.shipping_regions ?? [])];
                            rows[index] = { ...rows[index], fee: e.target.value };
                            setCatalogForm({ ...catalogForm, shipping_regions: rows });
                          }}
                        />
                        <Input
                          type="number"
                          min="0"
                          placeholder="Prazo (dias)"
                          value={region.days ?? ""}
                          onChange={(e) => {
                            const rows = [...(catalogForm.shipping_regions ?? [])];
                            rows[index] = { ...rows[index], days: e.target.value };
                            setCatalogForm({ ...catalogForm, shipping_regions: rows });
                          }}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() =>
                            setCatalogForm({
                              ...catalogForm,
                              shipping_regions: (catalogForm.shipping_regions ?? []).filter(
                                (_: any, row: number) => row !== index,
                              ),
                            })
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setCatalogForm({
                          ...catalogForm,
                          shipping_regions: [
                            ...(catalogForm.shipping_regions ?? []),
                            { name: "", fee: "", days: "" },
                          ],
                        })
                      }
                    >
                      <Plus className="mr-2 size-4" /> Adicionar cidade
                    </Button>
                  </div>
                </div>
                <div>
                  <Label>Prazo padrão (dias)</Label>
                  <Input
                    type="number"
                    value={catalogForm.shipping_days ?? ""}
                    onChange={(e) =>
                      setCatalogForm({ ...catalogForm, shipping_days: e.target.value })
                    }
                  />
                </div>
              </TabsContent>
            </Tabs>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setCatalogForm(null)}>
              Cancelar
            </Button>
            <Button onClick={saveCatalog}>Salvar catálogo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SupplierImportDialog open={open} onOpenChange={setOpen} items={items as any[]} />
    </section>
  );
}
