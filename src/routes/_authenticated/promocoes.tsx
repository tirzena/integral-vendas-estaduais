/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Plus, Sparkles, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useAuth";
import { useEstadualAccess } from "@/hooks/useEstadualAccess";
import { PageHeader } from "@/components/common/PageHeader";
import { CurrencyValues } from "@/components/common/CurrencyValues";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/promocoes")({ component: PromotionsPage });

type Mode = "admin" | "supplier" | "transport" | "none";
type Item = {
  id: string;
  name: string;
  product_id: string | null;
  product_name: string | null;
  category_id: string | null;
  category_name: string | null;
  supplier_name: string | null;
  currency: "BRL" | "USD" | "PYG";
  sale_price: number;
  cost: number | null;
  freight_sp_percent: number | null;
  freight_py_percent: number | null;
  freight_other_brazil_percent: number | null;
};

const localDateTime = (date: Date) => {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
};

const parseDecimal = (value: string) => {
  const raw = value.trim().replace(/[^\d,.-]/g, "");
  const comma = raw.lastIndexOf(",");
  const dot = raw.lastIndexOf(".");
  const separator = comma > dot ? comma : dot;
  const decimals = separator >= 0 ? raw.length - separator - 1 : 0;
  const hasDecimals = separator >= 0 && decimals > 0 && decimals <= 2;
  const normalized = hasDecimals
    ? `${raw.slice(0, separator).replace(/[.,]/g, "")}.${raw.slice(separator + 1)}`
    : raw.replace(/[.,]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const blankForm = () => {
  const start = new Date();
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return {
    id: "",
    title: "",
    description: "",
    productId: "all",
    categoryId: "all",
    itemId: "",
    destinationScope: "all",
    startsAt: localDateTime(start),
    endsAt: localDateTime(end),
    promotionalSalePrice: "",
    promotionalCost: "",
    promotionalFreightPercent: "",
  };
};

function PromotionsPage() {
  const { roles, isAdmin, loading } = useCurrentUser();
  const estadualAccess = useEstadualAccess();
  const mode: Mode = isAdmin
    ? "admin"
    : roles.includes("fornecedor")
      ? "supplier"
      : roles.includes("entregador")
        ? "transport"
        : "none";
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blankForm);

  const itemsQuery = useQuery({
    queryKey: ["promotion-management-items", mode],
    enabled: mode !== "none",
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("promotion_management_items");
      if (error) throw error;
      return (data ?? []) as Item[];
    },
  });
  const promotionsQuery = useQuery({
    queryKey: ["promotions-management", mode],
    enabled: mode !== "none",
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("promotions_for_management");
      if (error) throw error;
      return data ?? [];
    },
  });

  const selectedItem = useMemo(
    () => itemsQuery.data?.find((item) => item.id === form.itemId) ?? null,
    [form.itemId, itemsQuery.data],
  );
  const taxonomyQuery = useQuery({
    queryKey: ["promotion-taxonomy", mode],
    enabled: mode === "admin" || mode === "transport",
    queryFn: async () => {
      const [macros, subs] = await Promise.all([
        supabase.from("products").select("id,name").order("name"),
        supabase.from("product_categories").select("id,name,product_id").order("name"),
      ]);
      if (macros.error) throw macros.error;
      if (subs.error) throw subs.error;
      return { products: macros.data ?? [], categories: subs.data ?? [] };
    },
  });
  const products = useMemo(() => {
    const unique = new Map<string, string>();
    for (const item of itemsQuery.data ?? []) {
      if (item.product_id && item.product_name) unique.set(item.product_id, item.product_name);
    }
    for (const product of taxonomyQuery.data?.products ?? []) unique.set(product.id, product.name);
    return [...unique]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
  }, [itemsQuery.data, taxonomyQuery.data]);
  const categories = useMemo(() => {
    const unique = new Map<string, { name: string; productId: string | null }>();
    for (const item of itemsQuery.data ?? []) {
      if (item.category_id && item.category_name) {
        unique.set(item.category_id, { name: item.category_name, productId: item.product_id });
      }
    }
    for (const category of taxonomyQuery.data?.categories ?? [])
      unique.set(category.id, { name: category.name, productId: category.product_id });
    return [...unique]
      .map(([id, value]) => ({ id, ...value }))
      .filter((category) => form.productId === "all" || category.productId === form.productId)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
  }, [form.productId, itemsQuery.data, taxonomyQuery.data]);
  const visibleItems = useMemo(
    () =>
      (itemsQuery.data ?? []).filter(
        (item) =>
          (form.productId === "all" || item.product_id === form.productId) &&
          (form.categoryId === "all" || item.category_id === form.categoryId),
      ),
    [form.categoryId, form.productId, itemsQuery.data],
  );
  const originalFreight = selectedItem
    ? form.destinationScope === "sp"
      ? selectedItem.freight_sp_percent
      : form.destinationScope === "py"
        ? selectedItem.freight_py_percent
        : selectedItem.freight_other_brazil_percent
    : null;

  const save = useMutation({
    mutationFn: async () => {
      if (!estadualAccess.canWrite) throw new Error("Seu acesso ao Vendas Estaduais é somente leitura.");
      if (!form.title.trim() || !form.itemId) throw new Error("Informe o título e o produto.");
      const promotionalSalePrice =
        form.promotionalSalePrice.trim() === "" ? null : parseDecimal(form.promotionalSalePrice);
      const promotionalCost =
        form.promotionalCost.trim() === "" ? null : parseDecimal(form.promotionalCost);
      const promotionalFreightPercent =
        form.promotionalFreightPercent.trim() === ""
          ? null
          : parseDecimal(form.promotionalFreightPercent);
      if (
        (form.promotionalSalePrice.trim() !== "" && promotionalSalePrice === null) ||
        (form.promotionalCost.trim() !== "" && promotionalCost === null) ||
        (form.promotionalFreightPercent.trim() !== "" && promotionalFreightPercent === null)
      ) {
        throw new Error("Revise os valores promocionais informados.");
      }
      if (
        promotionalSalePrice === null &&
        promotionalCost === null &&
        promotionalFreightPercent === null
      ) {
        throw new Error("Informe pelo menos um valor promocional.");
      }
      const { error } = await (supabase as any).rpc("promotion_save", {
        p_id: form.id || null,
        p_title: form.title.trim(),
        p_description: form.description.trim() || null,
        p_item_id: form.itemId,
        p_destination_scope: form.destinationScope,
        p_starts_at: new Date(form.startsAt).toISOString(),
        p_ends_at: new Date(form.endsAt).toISOString(),
        p_promotional_sale_price: promotionalSalePrice,
        p_promotional_cost: promotionalCost,
        p_promotional_freight_percent: promotionalFreightPercent,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Promoção publicada.");
      setOpen(false);
      setForm(blankForm());
      queryClient.invalidateQueries({ queryKey: ["promotions-management"] });
      queryClient.invalidateQueries({ queryKey: ["active-promotions"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-data"] });
    },
    onError: (error: any) => toast.error(error?.message ?? "Não foi possível salvar a promoção."),
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      if (!estadualAccess.canWrite) throw new Error("Seu acesso ao Vendas Estaduais é somente leitura.");
      const { error } = await (supabase as any).rpc("promotion_cancel", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Promoção encerrada.");
      queryClient.invalidateQueries({ queryKey: ["promotions-management"] });
      queryClient.invalidateQueries({ queryKey: ["active-promotions"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-data"] });
    },
    onError: (error: any) => toast.error(error?.message ?? "Não foi possível encerrar."),
  });

  if (loading) return <p className="text-sm text-muted-foreground">Carregando permissões...</p>;
  if (mode === "none") {
    return (
      <Card>
        <CardContent className="p-8 text-center">Seu perfil não gerencia promoções.</CardContent>
      </Card>
    );
  }

  const roleHelp =
    mode === "admin"
      ? "Você pode definir custo, frete e valor final sugerido. Os demais membros verão somente o valor de venda."
      : mode === "supplier"
        ? "Você vê e altera somente o custo dos produtos vinculados ao seu fornecedor. O valor de venda promocional é calculado automaticamente."
        : "Você vê e altera somente o percentual de frete. O valor de venda promocional é calculado automaticamente.";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Promoções"
        description={roleHelp}
        actions={
          <Button
            disabled={!estadualAccess.canWrite}
            onClick={() => {
              setForm(blankForm());
              setOpen(true);
            }}
          >
            <Plus className="mr-2 size-4" />
            Nova promoção
          </Button>
        }
      />

      {promotionsQuery.isError && (
        <p className="rounded-lg border border-destructive/40 p-4 text-destructive">
          Não foi possível carregar as promoções.
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {(promotionsQuery.data ?? []).map((promotion: any) => {
          const active =
            promotion.status === "active" &&
            Date.now() >= new Date(promotion.starts_at).getTime() &&
            Date.now() <= new Date(promotion.ends_at).getTime();
          return (
            <Card
              key={promotion.id}
              className={active ? "border-emerald-400 shadow-[0_0_18px_rgba(16,185,129,.15)]" : ""}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>{promotion.title}</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {promotion.item_name} · {promotion.creator_name}
                    </p>
                  </div>
                  <Badge variant={active ? "default" : "secondary"}>
                    {promotion.status === "cancelled"
                      ? "Encerrada"
                      : active
                        ? "Ativa"
                        : new Date(promotion.starts_at) > new Date()
                          ? "Agendada"
                          : "Finalizada"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {promotion.description && (
                  <p className="text-sm text-muted-foreground">{promotion.description}</p>
                )}
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground line-through">
                    De {promotion.currency}{" "}
                    {Number(promotion.original_sale_price).toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                    })}
                  </p>
                  <p className="font-semibold text-emerald-700">
                    <CurrencyValues
                      value={Number(promotion.promotional_sale_price)}
                      currency={promotion.currency}
                      layout="inline"
                      primaryFirst
                    />
                  </p>
                </div>
                {(mode === "admin" || mode === "supplier") &&
                  promotion.promotional_cost != null && (
                    <p className="text-sm">
                      Custo: {promotion.original_cost} →{" "}
                      <strong>
                        {promotion.promotional_cost} {promotion.currency}
                      </strong>
                    </p>
                  )}
                {(mode === "admin" || mode === "transport") &&
                  promotion.promotional_freight_percent != null && (
                    <p className="text-sm">
                      Frete: {promotion.original_freight_percent}% →{" "}
                      <strong>{promotion.promotional_freight_percent}%</strong>
                    </p>
                  )}
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CalendarClock className="size-4" />
                  {formatDateTime(promotion.starts_at)} até {formatDateTime(promotion.ends_at)}
                </p>
                {promotion.status !== "cancelled" && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!estadualAccess.canWrite}
                    onClick={() => cancel.mutate(promotion.id)}
                    disabled={cancel.isPending}
                  >
                    <XCircle className="mr-2 size-4" />
                    Encerrar promoção
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      {!promotionsQuery.isLoading && !promotionsQuery.data?.length && (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            Nenhuma promoção criada.
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Criar promoção</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Título</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Ex.: Semana do produto"
              />
            </div>
            <div>
              <Label>Categoria</Label>
              <Select
                value={form.productId}
                onValueChange={(productId) =>
                  setForm((current) => ({
                    ...current,
                    productId,
                    categoryId: "all",
                    itemId: "",
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todas as categorias" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as categorias</SelectItem>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Subcategoria</Label>
              <Select
                value={form.categoryId}
                onValueChange={(categoryId) =>
                  setForm((current) => ({ ...current, categoryId, itemId: "" }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todas as subcategorias" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as subcategorias</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Produto</Label>
              {taxonomyQuery.isError && <p role="alert" className="text-sm text-destructive">Não foi possível carregar todas as categorias. Tente novamente.</p>}
              {!itemsQuery.isLoading && visibleItems.length === 0 && <p className="text-sm text-muted-foreground">Nenhum produto ativo cadastrado nesta seleção.</p>}
              <Select
                value={form.itemId}
                onValueChange={(itemId) => setForm((f) => ({ ...f, itemId }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o produto" />
                </SelectTrigger>
                <SelectContent>
                  {visibleItems.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {[item.product_name, item.category_name, item.name]
                        .filter(Boolean)
                        .join(" · ")}
                      {item.supplier_name ? ` · ${item.supplier_name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Início</Label>
              <Input
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
              />
            </div>
            <div>
              <Label>Fim</Label>
              <Input
                type="datetime-local"
                value={form.endsAt}
                onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
              />
            </div>
            {(mode === "admin" || mode === "transport") && (
              <div className="sm:col-span-2">
                <Label>Região do frete</Label>
                <Select
                  value={form.destinationScope}
                  onValueChange={(destinationScope) => setForm((f) => ({ ...f, destinationScope }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos / demais estados do Brasil</SelectItem>
                    <SelectItem value="sp">São Paulo</SelectItem>
                    <SelectItem value="py">Paraguai</SelectItem>
                    <SelectItem value="other_brazil">Demais estados do Brasil</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {(mode === "admin" || mode === "supplier") && (
              <div>
                <Label>Custo atual</Label>
                <Input value={selectedItem?.cost ?? ""} readOnly />
              </div>
            )}
            {(mode === "admin" || mode === "supplier") && (
              <div>
                <Label>Custo promocional ({selectedItem?.currency ?? ""})</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={form.promotionalCost}
                  onChange={(e) => setForm((f) => ({ ...f, promotionalCost: e.target.value }))}
                />
              </div>
            )}
            {(mode === "admin" || mode === "transport") && (
              <div>
                <Label>Frete atual</Label>
                <Input value={originalFreight == null ? "" : `${originalFreight}%`} readOnly />
              </div>
            )}
            {(mode === "admin" || mode === "transport") && (
              <div>
                <Label>Frete promocional (%)</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={form.promotionalFreightPercent}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, promotionalFreightPercent: e.target.value }))
                  }
                />
              </div>
            )}
            {mode === "admin" && (
              <div className="sm:col-span-2">
                <Label>Valor de venda promocional ({selectedItem?.currency ?? ""})</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={form.promotionalSalePrice}
                  onChange={(e) => setForm((f) => ({ ...f, promotionalSalePrice: e.target.value }))}
                  placeholder="Se vazio, será calculado pela redução de custo e frete"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Valor atual: {selectedItem?.sale_price ?? "—"}
                </p>
              </div>
            )}
            <div className="sm:col-span-2">
              <Label>Descrição</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Condições e observações visíveis para a equipe"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending || !form.itemId}>
              {save.isPending ? (
                "Publicando..."
              ) : (
                <>
                  <Sparkles className="mr-2 size-4" />
                  Publicar promoção
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
