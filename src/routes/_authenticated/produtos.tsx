/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  ArrowRightLeft,
  ChevronRight,
  ImageIcon,
  Layers,
  LayoutGrid,
  List,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { PageHeader, EmptyState } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRows, useSaveRow, useDeleteRow, logAudit } from "@/lib/db";
import { formatMoney, formatNumber } from "@/lib/format";
import { getLiveRates, type Currency } from "@/lib/rates.functions";
import { useProductScope } from "@/hooks/useProductScope";
import { useCurrentUser } from "@/hooks/useAuth";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { SupplierStockLots } from "@/components/inventory/SupplierStockLots";
import { StockControl } from "@/components/common/StockControl";
import { WarehousesSection } from "@/components/inventory/WarehousesSection";
import { StockSalesOrders, StockPurchaseHistory } from "@/components/inventory/StockSalesOrders";
import { CatalogSection } from "@/components/catalog/CatalogSection";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { uploadProductImage, useProductImages } from "@/lib/storage";

export const Route = createFileRoute("/_authenticated/produtos")({
  head: () => ({
    meta: [
      { title: "Catálogo de produtos — OS" },
      {
        name: "description",
        content:
          "Produtos, catálogos e preços cadastrados.",
      },
      { property: "og:title", content: "Catálogo de produtos — OS" },
      {
        property: "og:description",
        content: "Consulte produtos, catálogos e listas de preços.",
      },
    ],
  }),
  component: Catalogo,
});

type Macro = { id: string; name: string };
const CARD_COLORS = [
  "#8b5cf6",
  "#ec4899",
  "#22d3ee",
  "#f59e0b",
  "#a855f7",
  "#3b82f6",
  "#ef4444",
  "#22c55e",
  "#64748b",
];
type Sub = {
  id: string;
  product_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
};
type Item = Record<string, any>;

const ITEM_FIELDS: { name: string; label: string; type?: string; placeholder?: string }[] = [
  { name: "name", label: "Nome do produto", placeholder: "Perfume X" },
  { name: "variation", label: "Variação / modelo", placeholder: "128GB, Eau de Parfum" },
  { name: "sku", label: "Código / SKU" },
  { name: "size", label: "Tamanho", placeholder: "100 ml, 6.1 pol" },
  { name: "weight", label: "Peso", placeholder: "250 g" },
  { name: "volume", label: "Volume / miligramas", placeholder: "500 mg" },
  { name: "unit", label: "Unidade de medida", placeholder: "un, cx, kg" },
  { name: "quantity", label: "Quantidade", type: "number" },
  { name: "min_quantity", label: "Quantidade mínima", type: "number" },
  { name: "cost", label: "Custo (US$)", type: "number" },
  { name: "price", label: "Preço de venda (US$)", type: "number" },
];

export function Catalogo({ section = "catalogo" }: { section?: "catalogo" | "categorias" | "estoque" }) {
  const { products, productId } = useProductScope();
  const queryClient = useQueryClient();
  const [macroId, setMacroId] = useState<string | null>(null);
  const [subId, setSubId] = useState<string | "todas">("todas");
  const [search, setSearch] = useState("");
  const [currency, setCurrency] = useState<Currency | "todas">("USD");
  const [view, setView] = useState<"cards" | "lista">("lista");

  const [macroForm, setMacroForm] = useState<any | null>(null);
  const { isAdmin } = useCurrentUser();
  const [subForm, setSubForm] = useState<any | null>(null);
  const [itemForm, setItemForm] = useState<any | null>(null);
  const [moveForm, setMoveForm] = useState<any | null>(null);
  const [selectedWarehouse, setSelectedWarehouse] = useState<any | null>(null);

  const macros = useMemo(
    () => (products as Macro[]).filter((p) => (productId === "todos" ? true : p.id === productId)),
    [products, productId],
  );
  const activeMacro = macros.find((m) => m.id === macroId) ?? macros[0] ?? null;

  const commercialRulesSchema = useQuery({
    queryKey: ["commercial-rules-schema"],
    staleTime: Infinity,
    queryFn: async () => {
      const inventory = await supabase
        .from("inventory_items")
        .select(
          "max_discount_percent,freight_sp_percent,freight_py_percent,freight_other_brazil_percent",
        )
        .limit(1);
      const missingColumn = (message?: string) =>
        /column|schema cache|does not exist|PGRST204|42703/i.test(message ?? "");
      if (inventory.error && !missingColumn(inventory.error.message)) throw inventory.error;
      return { itemRules: !inventory.error };
    },
  });
  const itemRulesAvailable = commercialRulesSchema.data?.itemRules === true;

  const subsQuery = useRows<Sub>("product_categories", {
    select: "id,product_id,name,description,image_url",
    orderBy: { column: "name", ascending: true },
  });
  const itemsQuery = useRows<Item>("inventory_items", {
    filter: activeMacro ? { product_id: activeMacro.id } : {},
    orderBy: { column: "name", ascending: true },
    enabled: !!activeMacro,
  });

  const allSubs = useMemo(() => subsQuery.data ?? [], [subsQuery.data]);
  const subs = useMemo(
    () => allSubs.filter((s) => s.product_id === activeMacro?.id),
    [allSubs, activeMacro],
  );
  const subsFor = (macroIdSel: string | null | undefined) =>
    allSubs.filter((s) => s.product_id === macroIdSel);
  const newSubForm = (macroIdSel: string) => ({
    name: "",
    product_id: macroIdSel,
  });
  const newItemForm = (macroIdSel: string | null | undefined, categoryId?: string | null) => {
    return {
      product_id: macroIdSel,
      category_id: categoryId ?? null,
      name: allSubs.find((subcategory) => subcategory.id === categoryId)?.name.trim() ?? "",
      currency: "USD",
      quantity: 0,
      min_quantity: 0,
      commission_percent: 5,
      max_discount_percent: 0,
      freight_sp_percent: 20,
      freight_py_percent: 0,
      freight_other_brazil_percent: 25,
    };
  };
  const allItems = itemsQuery.data ?? [];
  const imagesQuery = useProductImages([
    ...allSubs.map((sub) => sub.image_url),
    ...allItems.map((item) => item["image_url"]),
    subForm?.image_url,
    itemForm?.image_url,
  ]);
  const imageOf = (path?: string | null) => (path ? imagesQuery.data?.[path] : undefined);
  const suppliersQuery = useRows<any>("suppliers", {
    orderBy: { column: "name", ascending: true },
  });
  const membersQuery = useRows<any>("profiles", {
    select: "id,full_name,email",
    orderBy: { column: "full_name", ascending: true },
  });
  const productUsersQuery = useRows<any>("product_users", {
    select: "id,product_id,user_id",
  });
  const memberIdsOf = (macroIdSel: string | null | undefined) =>
    (productUsersQuery.data ?? [])
      .filter((pu: any) => pu.product_id === macroIdSel)
      .map((pu: any) => pu.user_id as string);
  /** Abre o formulário já com os membros que hoje têm acesso à categoria. */
  const openMacroForm = (m?: any) =>
    setMacroForm(
      m ? { ...m, member_ids: memberIdsOf(m.id) } : { name: "", color: "#2563eb", member_ids: [] },
    );

  const countsQuery = useRows<any>("inventory_items", {
    select: "id,product_id,category_id,quantity",
  });
  const allItemsEverywhere = countsQuery.data ?? [];

  const liveRates = useServerFn(getLiveRates);
  const rates = useQuery({
    queryKey: ["live-rates-catalogo"],
    queryFn: () => liveRates(),
    refetchInterval: 60_000,
  });

  const factors = useMemo(() => {
    const map: Record<string, number> = { "USD-USD": 1, "BRL-BRL": 1, "PYG-PYG": 1 };
    const data: any = rates.data;
    if (data?.ok) {
      for (const p of data.pairs as { base: string; quote: string; rate: number }[]) {
        map[`${p.base}-${p.quote}`] = p.rate;
      }
    }
    return map;
  }, [rates.data]);

  const convertIn = (usd: any, cur: Currency, source: Currency = "USD") => {
    const value = Number(usd ?? 0);
    const f = factors[`${source}-${cur}`];
    if (f == null) return "—";
    return formatMoney(value * f, cur);
  };

  const convert = (usd: any, source: Currency = "USD") => {
    return (["BRL", "USD", "PYG"] as Currency[]).map((c) => convertIn(usd, c, source)).join(" · ");
  };

  const freightValue = (cost: any, percentage: any, source: Currency = "USD") =>
    convert((Number(cost ?? 0) * Number(percentage ?? 0)) / 100, source);

  /** Salva a categoria e sincroniza quais membros têm acesso a ela. */
  async function saveMacroWithMembers() {
    const form = macroForm;
    if (!form?.name) return;
    const payload: any = { name: form.name, description: form.description ?? null };
    let id = form.id as string | undefined;
    if (id) {
      const { error } = await supabase.from("products").update(payload).eq("id", id);
      if (error) return void toast.error("Não foi possível salvar a categoria.");
    } else {
      const { data, error } = await supabase.from("products").insert(payload).select("id").single();
      if (error || !data) return void toast.error("Não foi possível criar a categoria.");
      id = data.id;
    }

    if (isAdmin) {
      const wanted: string[] = form.member_ids ?? [];
      const current = memberIdsOf(id);
      const toAdd = wanted.filter((u) => !current.includes(u));
      const toRemove = current.filter((u) => !wanted.includes(u));
      if (toAdd.length) {
        const { error } = await supabase
          .from("product_users")
          .insert(toAdd.map((user_id) => ({ product_id: id!, user_id })));
        if (error) toast.error("Categoria salva, mas alguns membros não foram vinculados.");
      }
      if (toRemove.length) {
        await supabase.from("product_users").delete().eq("product_id", id!).in("user_id", toRemove);
      }
    }

    setMacroForm(null);
    toast.success("Categoria salva.");
    queryClient.invalidateQueries();
  }
  const saveSub = useSaveRow("product_categories", () => setSubForm(null));
  const saveItem = useSaveRow("inventory_items", () => setItemForm(null));
  const deleteSub = useDeleteRow("product_categories");
  const deleteItem = useDeleteRow("inventory_items");

  async function uploadFormImage(file: File, target: "sub" | "item") {
    if (!file.type.startsWith("image/")) return void toast.error("Escolha um arquivo de imagem.");
    if (file.size > 10 * 1024 * 1024) return void toast.error("A foto deve ter no máximo 10 MB.");
    try {
      const path = await uploadProductImage(file);
      if (target === "sub") setSubForm((form: any) => ({ ...form, image_url: path }));
      else setItemForm((form: any) => ({ ...form, image_url: path }));
      toast.success("Foto enviada.");
    } catch {
      toast.error("Não foi possível enviar a foto.");
    }
  }

  async function removeMacro(m: Macro) {
    const count = allSubs.filter((s) => s.product_id === m.id).length;
    const itemCount = allItemsEverywhere.filter((i: any) => i["product_id"] === m.id).length;
    if (
      !confirm(
        `Excluir a macro categoria "${m.name}"?\n\nTodos os produtos e as ${count} subcategoria(s) dela também serão excluídos.`,
      )
    )
      return;
    const { error: itemsError } = await supabase
      .from("inventory_items")
      .delete()
      .eq("product_id", m.id);
    if (itemsError)
      return void toast.error("Não foi possível excluir os produtos desta categoria.");
    await supabase.from("product_categories").delete().eq("product_id", m.id);
    await logAudit("products", "delete", m.id, {
      nome: m.name,
      subcategorias: count,
      produtos: itemCount,
    });
    const { error } = await supabase.from("products").delete().eq("id", m.id);
    if (error) {
      const { error: softError } = await supabase
        .from("products")
        .update({ deleted_at: new Date().toISOString(), is_active: false })
        .eq("id", m.id);
      if (softError) return void toast.error("Não foi possível excluir a macro categoria.");
    }
    if (macroId === m.id) setMacroId(null);
    toast.success("Macro categoria e seus produtos excluídos.");
    queryClient.invalidateQueries();
  }

  async function moveItem() {
    if (!moveForm?.id || !moveForm.product_id) return;
    const { error } = await supabase
      .from("inventory_items")
      .update({ product_id: moveForm.product_id, category_id: moveForm.category_id ?? null })
      .eq("id", moveForm.id);
    if (error) return void toast.error("Não foi possível mover este produto.");
    setMoveForm(null);
    toast.success("Produto movido.");
    queryClient.invalidateQueries();
  }

  const visibleItems = allItems
    .filter((i) => (subId === "todas" ? true : i["category_id"] === subId))
    .filter((i) => {
      if (!search.trim()) return true;
      const term = search.toLowerCase();
      return ["name", "sku", "variation", "size"].some((k) =>
        String(i[k] ?? "")
          .toLowerCase()
          .includes(term),
      );
    });

  const countBySub = (id: string) => allItems.filter((i) => i["category_id"] === id).length;
  const noSubCount = allItems.filter((i) => !i["category_id"]).length;

  return (
    <div>
      <PageHeader
        title={section === "estoque" ? "Estoque" : section === "categorias" ? "Categorias" : "Catálogo de produtos"}
        description={section === "estoque" ? "Locais, saldos, entradas e saídas de produtos." : section === "categorias" ? "Crie e organize categorias e subcategorias." : "Produtos, catálogos e listas de preços."}
        actions={
          section === "catalogo" ? <>
            <Select value={currency} onValueChange={(v) => setCurrency(v as Currency | "todas")}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Ver em todas</SelectItem>
                <SelectItem value="USD">Ver em US$</SelectItem>
                <SelectItem value="BRL">Ver em R$</SelectItem>
                <SelectItem value="PYG">Ver em ₲</SelectItem>
              </SelectContent>
            </Select>
          </> : section === "categorias" ? <Button onClick={() => openMacroForm()}><Plus className="mr-1 size-4" /> Nova categoria</Button> : undefined
        }
      />

      {section === "categorias" && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {macros.map((m) => <section key={m.id} className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">{m.name}</h2><div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => openMacroForm(m)}>Editar</Button><Button size="sm" variant="ghost" onClick={() => void removeMacro(m)}>Excluir</Button></div></div>
            <p className="mt-1 text-xs text-muted-foreground">{subsFor(m.id).length} subcategoria(s) · {allItemsEverywhere.filter((i: any) => i.product_id === m.id).length} produto(s)</p>
            <div className="mt-3 space-y-2">{subsFor(m.id).map((s) => <div key={s.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"><span>{s.name}</span><div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => setSubForm({ ...s })}>Editar</Button><Button size="sm" variant="ghost" onClick={() => { if (confirm(`Excluir a subcategoria "${s.name}"?`)) deleteSub.mutate(s.id); }}>Excluir</Button></div></div>)}</div>
            <Button className="mt-3" size="sm" variant="outline" onClick={() => setSubForm(newSubForm(m.id))}><Plus className="mr-1 size-4" /> Subcategoria</Button>
          </section>)}
          {macros.length === 0 && <EmptyState title="Nenhuma categoria" description="Crie a primeira categoria para organizar seus produtos." />}
        </div>
      )}

      {section === "catalogo" && <>
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex rounded-lg border p-0.5">
          <Button
            size="sm"
            variant={view === "cards" ? "secondary" : "ghost"}
            onClick={() => setView("cards")}
          >
            <LayoutGrid className="mr-1 size-4" /> Cards
          </Button>
          <Button
            size="sm"
            variant={view === "lista" ? "secondary" : "ghost"}
            onClick={() => setView("lista")}
          >
            <List className="mr-1 size-4" /> Lista
          </Button>
        </div>
        {view === "cards" && macroId && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setMacroId(null);
              setSubId("todas");
            }}
          >
            <ArrowLeft className="mr-1 size-4" /> Todas as categorias
          </Button>
        )}
      </div>

      {view === "cards" && !macroId ? (
        /* ===== Visão em cards das macro categorias ===== */
        macros.length === 0 ? (
          <EmptyState
            title="Nenhuma macro categoria"
            description="Cadastre uma categoria na aba Categorias para organizar os produtos."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {macros.map((m, idx) => {
              const mSubs = subsFor(m.id);
              const mItems = allItemsEverywhere.filter((i) => i.product_id === m.id);
              const dot = CARD_COLORS[idx % CARD_COLORS.length];
              return (
                <div
                  key={m.id}
                  className="group flex flex-col rounded-2xl border bg-card p-5 transition hover:border-primary/40 hover:shadow-lg"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className="size-3 shrink-0 rounded-full"
                        style={{ backgroundColor: dot }}
                      />
                      <h3 className="truncate text-lg font-semibold">{m.name}</h3>
                    </div>
                  </div>
                  {(m as any).description && (
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                      {(m as any).description}
                    </p>
                  )}
                  <div className="mt-3 flex items-center gap-2">
                    <Badge variant="secondary" className="text-emerald-500">
                      Ativa
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {mSubs.length} subcategoria(s) · {mItems.length} produto(s)
                    </span>
                  </div>
                  <div className="mt-auto flex gap-2 pt-5">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setMacroId(m.id);
                        setSubId("todas");
                      }}
                    >
                      Abrir
                    </Button>
                    <Button className="flex-1" onClick={() => setItemForm(newItemForm(m.id))}>
                      <Plus className="mr-1 size-4" /> Novo produto
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : view === "cards" && activeMacro ? (
        /* ===== Detalhe da macro categoria: subcategorias e produtos ===== */
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-5">
            <div className="flex min-w-0 items-center gap-3">
              <Layers className="size-6 shrink-0 text-primary" />
              <div className="min-w-0">
                <h2 className="truncate text-xl font-semibold">{activeMacro.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {subs.length} subcategoria(s) · {allItems.length} produto(s)
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setItemForm(newItemForm(activeMacro.id))}>
                <Plus className="mr-1 size-4" /> Novo produto
              </Button>
            </div>
          </div>

          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar produto dentro desta categoria"
              className="pl-9"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {subs.map((s) => {
              const sItems = allItems
                .filter((i) => i["category_id"] === s.id)
                .filter((i) => {
                  if (!search.trim()) return true;
                  const term = search.toLowerCase();
                  return ["name", "sku", "variation", "size"].some((k) =>
                    String(i[k] ?? "")
                      .toLowerCase()
                      .includes(term),
                  );
                });
              return (
                <div key={s.id} className="rounded-2xl border bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted/50">
                        {imageOf(s.image_url) ? (
                          <img
                            src={imageOf(s.image_url)}
                            alt={s.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <Layers className="size-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold">{s.name}</h3>
                        <p className="text-xs text-muted-foreground">{sItems.length} produto(s)</p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {sItems.length === 0 && (
                      <p className="py-2 text-sm text-muted-foreground">
                        {allItems.some((item) => item["category_id"] === s.id)
                          ? "Nenhum produto encontrado com esta busca."
                          : "Esta subcategoria ainda não tem produtos. Use o botão + para cadastrar um produto e disponibilizá-lo nos seletores de Pedidos e Compras."}
                      </p>
                    )}
                    {sItems.map((i) => (
                      <button
                        key={i["id"]}
                        className="flex w-full items-center justify-between gap-2 rounded-lg border bg-background/40 px-3 py-2 text-left text-sm transition hover:border-primary/40"
                        onClick={() => setItemForm({ ...i })}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/40">
                            {imageOf(i["image_url"]) ? (
                              <img
                                src={imageOf(i["image_url"])}
                                alt={i["name"]}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <Package className="size-4 text-muted-foreground" />
                            )}
                          </span>
                          <span className="truncate">{i["name"]}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <Badge
                            variant={
                              Number(i["quantity"] ?? 0) <= Number(i["min_quantity"] ?? 0)
                                ? "destructive"
                                : "secondary"
                            }
                          >
                            {formatNumber(i["quantity"], 2)}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {convert(i["price"], i["currency"] ?? "USD")}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-3 w-full justify-start"
                    onClick={() => setItemForm(newItemForm(activeMacro.id, s.id))}
                  >
                    <Plus className="mr-1 size-3.5" /> Produto em {s.name}
                  </Button>
                </div>
              );
            })}

            {/* Produtos sem subcategoria */}
            {noSubCount > 0 && (
              <div className="rounded-2xl border border-dashed bg-card p-4">
                <h3 className="font-semibold text-muted-foreground">Sem subcategoria</h3>
                <p className="text-xs text-muted-foreground">{noSubCount} produto(s)</p>
                <div className="mt-3 space-y-1.5">
                  {allItems
                    .filter((i) => !i["category_id"])
                    .filter((i) => {
                      if (!search.trim()) return true;
                      const term = search.toLowerCase();
                      return ["name", "sku", "variation", "size"].some((k) =>
                        String(i[k] ?? "")
                          .toLowerCase()
                          .includes(term),
                      );
                    })
                    .map((i) => (
                      <button
                        key={i["id"]}
                        className="flex w-full items-center justify-between gap-2 rounded-lg border bg-background/40 px-3 py-2 text-left text-sm transition hover:border-primary/40"
                        onClick={() => setItemForm({ ...i })}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <Package className="size-4 shrink-0 text-muted-foreground" />
                          <span className="truncate">{i["name"]}</span>
                        </span>
                        <Badge variant="secondary">{formatNumber(i["quantity"], 2)}</Badge>
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ===== Visão em lista (atual) ===== */
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <aside className="rounded-xl border bg-card p-3">
            <p className="px-1 pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Macro categorias
            </p>
            {macros.length === 0 && (
              <p className="px-1 py-4 text-sm text-muted-foreground">
                Cadastre uma categoria na aba Categorias para organizar os produtos.
              </p>
            )}
            <div className="space-y-1">
              {macros.map((m) => {
                const active = activeMacro?.id === m.id;
                return (
                  <div key={m.id}>
                    <div
                      className={cn(
                        "group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm",
                        active ? "bg-primary/10 text-primary" : "hover:bg-muted",
                      )}
                    >
                      <button
                        className="flex flex-1 items-center gap-2 text-left"
                        onClick={() => {
                          setMacroId(m.id);
                          setSubId("todas");
                        }}
                      >
                        <Layers className="size-4 shrink-0" />
                        <span className="truncate font-medium">{m.name}</span>
                      </button>
                    </div>

                    {active && (
                      <div className="ml-3 mt-1 space-y-1 border-l pl-2">
                        <button
                          className={cn(
                            "flex w-full items-center justify-between rounded-md px-2 py-1 text-sm",
                            subId === "todas" ? "bg-muted font-medium" : "hover:bg-muted",
                          )}
                          onClick={() => setSubId("todas")}
                        >
                          <span>Todos os itens</span>
                          <Badge variant="secondary">{allItems.length}</Badge>
                        </button>
                        {subs.map((s) => (
                          <div
                            key={s.id}
                            className={cn(
                              "group/sub flex items-center gap-1 rounded-md px-2 py-1 text-sm",
                              subId === s.id ? "bg-muted font-medium" : "hover:bg-muted",
                            )}
                          >
                            <button
                              className="flex flex-1 items-center gap-1 text-left"
                              onClick={() => setSubId(s.id)}
                            >
                              <ChevronRight className="size-3.5 shrink-0 opacity-60" />
                              <span className="truncate">{s.name}</span>
                            </button>
                            <Badge variant="secondary">{countBySub(s.id)}</Badge>
                          </div>
                        ))}
                        {noSubCount > 0 && (
                          <p className="px-2 py-1 text-xs text-muted-foreground">
                            {noSubCount} item(ns) sem subcategoria
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </aside>

          <section className="rounded-xl border bg-card">
            <div className="flex flex-wrap items-center gap-2 border-b p-3">
              <div className="relative min-w-[200px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar produto, código ou tamanho"
                  className="pl-9"
                />
              </div>
              <Button
                disabled={!activeMacro}
                onClick={() =>
                  setItemForm(newItemForm(activeMacro?.id, subId === "todas" ? null : subId))
                }
              >
                <Plus className="mr-1 size-4" /> Novo produto
              </Button>
            </div>

            {visibleItems.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  title="Nenhum produto nesta categoria"
                  description="Cadastre os produtos com tamanho, peso, preço em dólar e quantidade."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead>Especificações</TableHead>
                      <TableHead>Qtd.</TableHead>
                      <TableHead>Preço</TableHead>
                      <TableHead>Total em estoque</TableHead>
                      <TableHead className="w-20" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleItems.map((i) => (
                      <TableRow key={i["id"]}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
                              {imageOf(i["image_url"]) ? (
                                <img
                                  src={imageOf(i["image_url"])}
                                  alt={i["name"]}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <Package className="size-4 text-muted-foreground" />
                              )}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-medium">{i["name"]}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {[i["variation"], i["sku"]].filter(Boolean).join(" · ") || "—"}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {[i["size"], i["weight"], i["volume"], i["unit"]]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              Number(i["quantity"] ?? 0) <= Number(i["min_quantity"] ?? 0)
                                ? "destructive"
                                : "secondary"
                            }
                          >
                            {formatNumber(i["quantity"], 2)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p>{convert(i["price"], i["currency"] ?? "USD")}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {convert(
                            Number(i["price"] ?? 0) * Number(i["quantity"] ?? 0),
                            i["currency"] ?? "USD",
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Mover para outra categoria"
                              onClick={() =>
                                setMoveForm({
                                  id: i["id"],
                                  name: i["name"],
                                  product_id: i["product_id"],
                                  category_id: i["category_id"] ?? null,
                                })
                              }
                            >
                              <ArrowRightLeft className="size-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setItemForm({ ...i })}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                if (confirm(`Excluir "${i["name"]}"?`)) {
                                  void logAudit("inventory_items", "delete", i["id"], {
                                    nome: i["name"],
                                  });
                                  deleteItem.mutate(i["id"]);
                                }
                              }}
                            >
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </div>
      )}

      <CatalogSection macros={macros} subs={allSubs} />
      </>}

      {section === "estoque" && <>
      <WarehousesSection
        selectedId={selectedWarehouse?.id ?? null}
        onSelect={(warehouse) =>
          setSelectedWarehouse((current: any) => (current?.id === warehouse.id ? null : warehouse))
        }
      />
      {selectedWarehouse && (
        <section className="mt-5 rounded-xl border bg-card p-4">
          <div className="mb-4">
            <h2 className="font-semibold">Controle — {selectedWarehouse.name}</h2>
            <p className="text-sm text-muted-foreground">
              {selectedWarehouse.city} · {selectedWarehouse.state} ·{" "}
              {selectedWarehouse.country || "País a definir"}
            </p>
          </div>
          <StockSalesOrders warehouseId={selectedWarehouse.id} />
          {selectedWarehouse.level === "principal" && (
            <>
              <StockPurchaseHistory warehouseId={selectedWarehouse.id} />
              <SupplierStockLots warehouseId={selectedWarehouse.id} />
            </>
          )}
          <StockControl
            macros={macros}
            subs={allSubs}
            convert={convert}
            warehouseId={selectedWarehouse.id}
          />
        </section>
      )}

      </>}

      {/* Macro categoria */}
      <Dialog open={!!macroForm} onOpenChange={(o) => !o && setMacroForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {macroForm?.id ? "Editar macro categoria" : "Nova macro categoria"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input
                value={macroForm?.name ?? ""}
                placeholder="Perfumes e cosméticos"
                onChange={(e) => setMacroForm({ ...macroForm, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea
                value={macroForm?.description ?? ""}
                onChange={(e) => setMacroForm({ ...macroForm, description: e.target.value })}
              />
            </div>
            {isAdmin && (
              <div>
                <Label>Membros com acesso a esta categoria</Label>
                <p className="text-muted-foreground mb-2 text-xs">
                  Quem for marcado passa a ver e trabalhar nesta área. Administradores e gestores já
                  têm acesso a todas.
                </p>
                <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
                  {(membersQuery.data ?? []).length === 0 ? (
                    <p className="text-muted-foreground p-2 text-sm">Nenhuma pessoa cadastrada.</p>
                  ) : (
                    (membersQuery.data ?? []).map((m: any) => {
                      const checked = (macroForm?.member_ids ?? []).includes(m.id);
                      return (
                        <label
                          key={m.id}
                          className="hover:bg-muted/40 flex cursor-pointer items-center gap-3 rounded-md p-2 text-sm"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => {
                              const list: string[] = macroForm?.member_ids ?? [];
                              setMacroForm({
                                ...macroForm,
                                member_ids: v
                                  ? [...list, m.id]
                                  : list.filter((id: string) => id !== m.id),
                              });
                            }}
                          />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">
                              {m.full_name ?? "Sem nome"}
                            </span>
                            <span className="text-muted-foreground block truncate text-xs">
                              {m.email ?? ""}
                            </span>
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMacroForm(null)}>
              Cancelar
            </Button>
            <Button disabled={!macroForm?.name} onClick={() => void saveMacroWithMembers()}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Subcategoria */}
      <Dialog open={!!subForm} onOpenChange={(o) => !o && setSubForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{subForm?.id ? "Editar subcategoria" : "Nova subcategoria"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Foto da subcategoria</Label>
              <div className="mt-1.5 flex items-center gap-3">
                <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted/40">
                  {imageOf(subForm?.image_url) ? (
                    <img
                      src={imageOf(subForm?.image_url)}
                      alt={subForm?.name || "Subcategoria"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="size-7 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadFormImage(file, "sub");
                      event.target.value = "";
                    }}
                  />
                  {subForm?.image_url && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setSubForm({ ...subForm, image_url: null })}
                    >
                      Remover foto
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <div>
              <Label>Nome</Label>
              <Input
                value={subForm?.name ?? ""}
                placeholder="Perfumes importados"
                onChange={(e) => setSubForm({ ...subForm, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea
                value={subForm?.description ?? ""}
                onChange={(e) => setSubForm({ ...subForm, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubForm(null)}>
              Cancelar
            </Button>
            <Button
              disabled={!subForm?.name}
              onClick={() => {
                saveSub.mutate({
                  id: subForm.id,
                  product_id: subForm.product_id ?? activeMacro?.id,
                  name: subForm.name,
                  description: subForm.description ?? null,
                  image_url: subForm.image_url ?? null,
                });
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Item */}
      <Dialog open={!!itemForm} onOpenChange={(o) => !o && setItemForm(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{itemForm?.id ? "Editar produto" : "Novo produto"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Foto do produto</Label>
              <div className="mt-1.5 flex items-center gap-3">
                <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted/40">
                  {imageOf(itemForm?.image_url) ? (
                    <img
                      src={imageOf(itemForm?.image_url)}
                      alt={itemForm?.name || "Produto"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="size-8 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadFormImage(file, "item");
                      event.target.value = "";
                    }}
                  />
                  {itemForm?.image_url && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setItemForm({ ...itemForm, image_url: null })}
                    >
                      Remover foto
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <div>
              <Label>Macro categoria</Label>
              <Select
                value={itemForm?.product_id ?? ""}
                onValueChange={(v) =>
                  setItemForm({ ...itemForm, product_id: v, category_id: null })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a categoria" />
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
                value={itemForm?.category_id ?? "nenhuma"}
                onValueChange={(v) => {
                  const categoryId = v === "nenhuma" ? null : v;
                  setItemForm({
                    ...itemForm,
                    category_id: categoryId,
                  });
                }}
                disabled={!itemForm?.product_id}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      itemForm?.product_id
                        ? "Selecione a subcategoria"
                        : "Escolha a categoria antes"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhuma">Sem subcategoria</SelectItem>
                  {subsFor(itemForm?.product_id).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Fornecedor</Label>
              <Select
                value={itemForm?.supplier_id ?? "nenhum"}
                onValueChange={(v) =>
                  setItemForm({ ...itemForm, supplier_id: v === "nenhum" ? null : v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="De qual fornecedor é este produto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">Sem fornecedor</SelectItem>
                  {(suppliersQuery.data ?? []).map((sup: any) => (
                    <SelectItem key={sup.id} value={sup.id}>
                      {sup.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Moeda dos preços</Label>
              <Select
                value={itemForm?.currency ?? "USD"}
                onValueChange={(v) => setItemForm({ ...itemForm, currency: v })}
              >
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
            {ITEM_FIELDS.map((f) => (
              <div key={f.name}>
                <Label>
                  {f.label.replace(
                    "US$",
                    itemForm?.currency === "BRL"
                      ? "R$"
                      : itemForm?.currency === "PYG"
                        ? "Gs."
                        : "US$",
                  )}
                </Label>
                <Input
                  type={f.type ?? "text"}
                  placeholder={f.placeholder ?? ""}
                  value={itemForm?.[f.name] ?? ""}
                  onChange={(e) => setItemForm({ ...itemForm, [f.name]: e.target.value })}
                />
              </div>
            ))}
            <div className="sm:col-span-2 mt-2 rounded-xl border bg-muted/20 p-4">
              <h3 className="font-semibold">Regras comerciais deste produto</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Estes percentuais serão usados nos pedidos, catálogos e relatórios.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Comissão (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={itemForm?.commission_percent ?? 5}
                    onChange={(e) =>
                      setItemForm({ ...itemForm, commission_percent: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Desconto máximo permitido (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={itemForm?.max_discount_percent ?? 0}
                    disabled={!itemRulesAvailable}
                    onChange={(e) =>
                      setItemForm({ ...itemForm, max_discount_percent: e.target.value })
                    }
                  />
                </div>
                {([
                  ["freight_sp_percent", "Frete para São Paulo (%)"],
                  ["freight_py_percent", "Frete para o Paraguai (%)"],
                  ["freight_other_brazil_percent", "Frete para outros estados do Brasil (%)"],
                ] as const).map(([field, label]) => {
                  const preview = freightValue(
                    itemForm?.cost,
                    itemForm?.[field] ?? 0,
                    itemForm?.currency ?? "USD",
                  );
                  return (
                    <div
                      key={field}
                      className={field === "freight_other_brazil_percent" ? "sm:col-span-2" : ""}
                    >
                      <Label>{label}</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        value={itemForm?.[field] ?? 0}
                        disabled={!itemRulesAvailable}
                        onChange={(e) => setItemForm({ ...itemForm, [field]: e.target.value })}
                      />
                      <p className="mt-1 text-xs text-muted-foreground">Por unidade: {preview}</p>
                    </div>
                  );
                })}
              </div>
              {!itemRulesAvailable && !commercialRulesSchema.isLoading && (
                <p className="mt-3 text-sm text-amber-700">
                  As regras comerciais serão liberadas após a atualização do banco.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemForm(null)}>
              Cancelar
            </Button>
            <Button
              disabled={!itemForm?.name}
              onClick={() => {
                const num = (v: any) =>
                  v === "" || v === undefined || v === null ? null : Number(v);
                const commission = num(itemForm.commission_percent) ?? 5;
                const maxDiscount = num(itemForm.max_discount_percent) ?? 0;
                const freightSp = num(itemForm.freight_sp_percent) ?? 20;
                const freightPy = num(itemForm.freight_py_percent) ?? 0;
                const freightOther = num(itemForm.freight_other_brazil_percent) ?? 25;
                if (
                  [commission, maxDiscount, freightSp, freightPy, freightOther].some(
                    (value) => value < 0 || value > 100,
                  )
                ) {
                  return void toast.error(
                    "Comissão, desconto e fretes devem ficar entre 0% e 100%.",
                  );
                }
                saveItem.mutate({
                  id: itemForm.id,
                  product_id: itemForm.product_id ?? activeMacro?.id,
                  category_id: itemForm.category_id ?? null,
                  name: itemForm.name,
                  image_url: itemForm.image_url ?? null,
                  variation: itemForm.variation || null,
                  sku: itemForm.sku || null,
                  size: itemForm.size || null,
                  weight: itemForm.weight || null,
                  volume: itemForm.volume || null,
                  unit: itemForm.unit || null,
                  quantity: num(itemForm.quantity) ?? 0,
                  min_quantity: num(itemForm.min_quantity) ?? 0,
                  cost: num(itemForm.cost),
                  price: num(itemForm.price),
                  supplier_id: itemForm.supplier_id ?? null,
                  currency: itemForm?.currency ?? "USD",
                  commission_percent: commission,
                  ...(itemRulesAvailable
                    ? {
                        max_discount_percent: maxDiscount,
                        freight_sp_percent: freightSp,
                        freight_py_percent: freightPy,
                        freight_other_brazil_percent: freightOther,
                      }
                    : {}),
                });
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mover produto */}
      <Dialog open={!!moveForm} onOpenChange={(o) => !o && setMoveForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mover “{moveForm?.name}”</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Macro categoria</Label>
              <Select
                value={moveForm?.product_id ?? ""}
                onValueChange={(v) =>
                  setMoveForm({ ...moveForm, product_id: v, category_id: null })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a categoria" />
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
                value={moveForm?.category_id ?? "nenhuma"}
                onValueChange={(v) =>
                  setMoveForm({ ...moveForm, category_id: v === "nenhuma" ? null : v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sem subcategoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhuma">Sem subcategoria</SelectItem>
                  {subsFor(moveForm?.product_id).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveForm(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void moveItem()}>Mover</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
