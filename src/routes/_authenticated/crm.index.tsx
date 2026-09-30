/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Kanban, List, Loader2, Plus, Table2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProductScope } from "@/hooks/useProductScope";
import { useCurrentUser } from "@/hooks/useAuth";
import { usePeople } from "@/hooks/usePeople";
import { CURRENCIES, formatMoney, formatDate } from "@/lib/format";
import { CurrencyValues } from "@/components/common/CurrencyValues";
import { inPeriod, type PeriodKey } from "@/lib/period";
import { moveCrmOpportunity } from "@/lib/crm.functions";
import { useServerFn } from "@tanstack/react-start";
import { PeriodFilter, StatCards } from "@/components/common/PeriodFilter";
import { PageHeader, EmptyState } from "@/components/common/PageHeader";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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

export const Route = createFileRoute("/_authenticated/crm/")({
  head: () => ({
    meta: [
      { title: "CRM por categoria — OS" },
      {
        name: "description",
        content: "Funil de vendas separado por categoria, com etapas, valores e responsáveis.",
      },
      { property: "og:title", content: "CRM por categoria — OS" },
      { property: "og:description", content: "Funil de vendas separado por categoria." },
    ],
  }),
  component: Crm,
});

type ViewMode = "kanban" | "lista" | "tabela";

function Crm() {
  const { productId, current, products, setProductId } = useProductScope();
  const { userId, isAdmin } = useCurrentUser();
  const { options: peopleOptions, nameOf } = usePeople();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const moveOpportunity = useServerFn(moveCrmOpportunity);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"existente" | "novo">("novo");
  const [view, setView] = useState<ViewMode>("kanban");
  const [form, setForm] = useState<any>({ currency: "BRL" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dragging, setDragging] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodKey>("mes");

  const isAll = productId === "todos";
  const productIds = isAll ? products.map((p) => p.id) : [productId];

  const { data, isLoading } = useQuery({
    queryKey: ["crm", productId, productIds.join(",")],
    enabled: !isAll || productIds.length > 0,
    queryFn: async () => {
      const { data: pipelines } = await supabase
        .from("pipelines")
        .select("id,name,product_id")
        .in("product_id", productIds)
        .eq("is_default", true);

      const pipelineIds = (pipelines ?? []).map((p) => p.id);

      const [stagesRes, cardsRes, customersRes] = await Promise.all([
        pipelineIds.length
          ? supabase
              .from("pipeline_stages")
              .select("*, pipelines(product_id)")
              .in("pipeline_id", pipelineIds)
              .order("position")
          : Promise.resolve({ data: [] as any[] }),
        supabase
          .from("customer_products")
          .select("*, customers(name, phone), products(name, main_currency)")
          .in("product_id", productIds),
        supabase
          .from("customers")
          .select("id,name")
          .is("deleted_at", null)
          .order("name")
          .limit(500),
      ]);

      return {
        pipelines: pipelines ?? [],
        stages: stagesRes.data ?? [],
        cards: cardsRes.data ?? [],
        customers: customersRes.data ?? [],
      };
    },
  });

  const stages = data?.stages ?? [];
  const rawCards = data?.cards ?? [];
  // Cada vendedor enxerga apenas os contatos sob a responsabilidade dele.
  const ownedCards = isAdmin ? rawCards : rawCards.filter((c: any) => c.owner_id === userId);
  const cards = useMemo(
    () => ownedCards.filter((c: any) => inPeriod(c.created_at ?? c.entered_at, period)),
    [ownedCards, period],
  );
  const currentPipeline = isAll
    ? null
    : (data?.pipelines.find((p: any) => p.product_id === productId) ?? null);
  const currentStages = currentPipeline
    ? stages.filter((s: any) => s.pipeline_id === currentPipeline.id)
    : stages;

  const totals = useMemo(() => {
    const map: Record<string, number> = {};
    cards.forEach((c: any) => {
      map[c.stage_id] = (map[c.stage_id] ?? 0) + Number(c.potential_value ?? 0);
    });
    return map;
  }, [cards]);

  const summary = useMemo(() => {
    const typeOf = (c: any) => stages.find((s: any) => s.id === c.stage_id)?.stage_type ?? "aberto";
    const firstStageIds = new Set(
      stages.filter((s: any) => s.position === 1).map((s: any) => s.id),
    );
    const won = cards.filter((c: any) => typeOf(c) === "ganho" || typeOf(c) === "posvenda");
    const lost = cards.filter((c: any) => typeOf(c) === "perdido");
    const open = cards.filter((c: any) => typeOf(c) === "aberto");
    const untouched = open.filter(
      (c: any) => !c.owner_id || (firstStageIds.has(c.stage_id) && !c.last_contact_at),
    );
    return [
      { label: "Leads no período", value: cards.length },
      { label: "Em atendimento", value: open.length - untouched.length },
      { label: "Ninguém atendeu", value: untouched.length, tone: "warn" as const },
      { label: "Geraram venda", value: won.length, tone: "good" as const },
      { label: "Não geraram", value: lost.length, tone: "bad" as const },
      {
        label: "Conversão",
        value: cards.length ? `${Math.round((won.length / cards.length) * 100)}%` : "0%",
      },
    ];
  }, [cards, stages]);

  const stageName = (id: string) => stages.find((s: any) => s.id === id)?.name ?? "—";

  // Cada categoria tem seu próprio funil: agrupamos etapas de mesmo nome para
  // não repetir colunas quando várias categorias são exibidas juntas.
  const groupedStages = useMemo(() => {
    const groups: { key: string; name: string; position: number; ids: string[] }[] = [];
    [...stages]
      .sort((a: any, b: any) => a.position - b.position)
      .forEach((s: any) => {
        const found = groups.find((g) => g.name === s.name);
        if (found) found.ids.push(s.id);
        else groups.push({ key: s.name, name: s.name, position: s.position, ids: [s.id] });
      });
    return groups;
  }, [stages]);

  const listStages = isAll
    ? groupedStages
    : currentStages.map((s: any) => ({
        key: s.id,
        name: s.name,
        position: s.position,
        ids: [s.id],
      }));

  // Ao mudar de etapa, só oferecemos as etapas do funil da própria categoria.
  const stagesForCard = (card: any) => {
    const pipelineId =
      card.pipeline_id ?? data?.pipelines.find((p: any) => p.product_id === card.product_id)?.id;
    const own = stages.filter((s: any) => s.pipeline_id === pipelineId);
    return own.length ? own : currentStages;
  };
  const productName = (id: string) =>
    products.find((p: any) => p.id === id)?.name ??
    cards.find((c: any) => c.product_id === id)?.products?.name ??
    "—";

  async function moveCard(cardId: string, stageId: string) {
    try {
      const result = await moveOpportunity({ data: { cardId, stageId } });
      if (result.meta?.sent) toast.success("Lead qualificado e evento enviado à Meta.");
      queryClient.invalidateQueries({ queryKey: ["crm", productId] });
    } catch {
      toast.error("Não foi possível mover a oportunidade.");
    }
  }

  async function setOwner(cardId: string, ownerId: string) {
    const { error } = await supabase
      .from("customer_products")
      .update({ owner_id: ownerId === "sem" ? null : ownerId })
      .eq("id", cardId);
    if (error) toast.error("Não foi possível trocar o responsável.");
    else {
      toast.success("Responsável atualizado.");
      queryClient.invalidateQueries({ queryKey: ["crm", productId] });
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (isAll && !form.product_id) next["product_id"] = "Selecione a categoria.";
    if (mode === "existente" && !form.customer_id) next["customer_id"] = "Selecione um contato.";
    if (mode === "novo" && !form.name?.trim()) next["name"] = "Informe o nome do contato.";
    if (form.potential_value && isNaN(Number(form.potential_value)))
      next["potential_value"] = "Informe um valor numérico.";
    setErrors(next);
    if (Object.keys(next).length) return;

    const targetProductId = isAll ? form.product_id : productId;
    const pipeline = data?.pipelines.find((p: any) => p.product_id === targetProductId);
    const firstStage = pipeline
      ? (stages.find((s: any) => s.pipeline_id === pipeline.id)?.id ?? null)
      : null;

    if (!firstStage) {
      toast.error("A categoria selecionada ainda não tem etapas de funil.");
      return;
    }

    setSaving(true);
    let customerId = form.customer_id as string | undefined;

    if (mode === "novo") {
      const { data: created, error: cErr } = await supabase
        .from("customers")
        .insert({
          name: form.name.trim(),
          phone: form.phone || null,
          whatsapp: form.phone || null,
          email: form.email || null,
          document: form.document || null,
          city: form.city || null,
          origin: form.lead_origin || null,
          created_by: userId ?? null,
        })
        .select("id")
        .single();
      if (cErr || !created) {
        setSaving(false);
        toast.error("Não foi possível cadastrar o contato.");
        return;
      }
      customerId = created.id;
    }

    const { error } = await supabase.from("customer_products").insert({
      customer_id: customerId!,
      product_id: targetProductId,
      pipeline_id: pipeline?.id ?? null,
      stage_id: firstStage,
      owner_id: form.owner_id || userId || null,
      commercial_status: "em_negociacao",
      lead_origin: form.lead_origin || null,
      potential_value: form.potential_value ? Number(form.potential_value) : null,
      currency: form.currency ?? "BRL",
      notes: form.notes || null,
    });
    setSaving(false);
    if (error) {
      toast.error(
        error.message.includes("duplicate")
          ? "Este contato já está nesta categoria."
          : "Não foi possível criar a oportunidade.",
      );
      return;
    }
    toast.success("Oportunidade criada.");
    setOpen(false);
    setForm({ currency: "BRL" });
    queryClient.invalidateQueries({ queryKey: ["crm", productId] });
    queryClient.invalidateQueries({ queryKey: ["customers"] });
  }

  const title = isAll
    ? "CRM por categoria — Todas as categorias"
    : `CRM por categoria — ${current?.name ?? ""}`;

  const effectiveView: ViewMode = view;

  return (
    <div>
      <PageHeader
        title={title}
        description="Todo contato começa aqui como oportunidade. Ao fazer a primeira compra, ele passa a aparecer em Clientes."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {!isAll && (
              <ToggleGroup
                type="single"
                value={view}
                onValueChange={(v) => v && setView(v as ViewMode)}
                variant="outline"
                size="sm"
              >
                <ToggleGroupItem value="kanban" aria-label="Ver em kanban">
                  <Kanban className="mr-1.5 size-4" /> Kanban
                </ToggleGroupItem>
                <ToggleGroupItem value="lista" aria-label="Ver em lista">
                  <List className="mr-1.5 size-4" /> Lista
                </ToggleGroupItem>
                <ToggleGroupItem value="tabela" aria-label="Ver em tabela">
                  <Table2 className="mr-1.5 size-4" /> Tabela
                </ToggleGroupItem>
              </ToggleGroup>
            )}
            {isAll && (
              <ToggleGroup
                type="single"
                value={effectiveView}
                onValueChange={(v) => v && setView(v as ViewMode)}
                variant="outline"
                size="sm"
              >
                <ToggleGroupItem value="kanban" aria-label="Ver em kanban">
                  <Kanban className="mr-1.5 size-4" /> Kanban
                </ToggleGroupItem>
                <ToggleGroupItem value="lista" aria-label="Ver em lista">
                  <List className="mr-1.5 size-4" /> Lista
                </ToggleGroupItem>
                <ToggleGroupItem value="tabela" aria-label="Ver em tabela">
                  <Table2 className="mr-1.5 size-4" /> Tabela
                </ToggleGroupItem>
              </ToggleGroup>
            )}
            <PeriodFilter value={period} onChange={setPeriod} />
            <Button onClick={() => setOpen(true)}>
              <Plus className="mr-2 size-4" /> Nova oportunidade
            </Button>
          </div>
        }
      />

      <StatCards stats={summary} />

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Carregando funil…
        </div>
      ) : !isAll && currentStages.length === 0 ? (
        <EmptyState
          title="Esta categoria ainda não tem funil"
          description="O funil padrão é criado junto com a categoria. Recadastre a categoria para gerar as etapas."
        />
      ) : cards.length === 0 ? (
        <EmptyState
          title="Nenhuma oportunidade ainda"
          description={
            isAll
              ? "Não há oportunidades em nenhuma categoria no momento."
              : "Cadastre o primeiro contato desta categoria pelo botão Nova oportunidade."
          }
        />
      ) : effectiveView === "kanban" ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {listStages.map((stage: any) => {
            const stageCards = cards.filter((c: any) => stage.ids.includes(c.stage_id));
            const stageTotal = stage.ids.reduce(
              (sum: number, stageId: string) => sum + (totals[stageId] ?? 0),
              0,
            );
            return (
              <div
                key={stage.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragging) {
                    const card = cards.find((item: any) => item.id === dragging);
                    const destination = card
                      ? stagesForCard(card).find((item: any) => item.name === stage.name)
                      : null;
                    if (destination) moveCard(dragging, destination.id);
                  }
                  setDragging(null);
                }}
                className="w-72 shrink-0 rounded-xl bg-muted/50 p-3"
              >
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold">{stage.name}</p>
                  <Badge variant="secondary">{stageCards.length}</Badge>
                </div>
                <p className="mb-3 text-xs text-muted-foreground">
                  <CurrencyValues
                    value={stageTotal}
                    currency={(current?.main_currency ?? "BRL") as any}
                  />
                </p>
                <div className="space-y-2">
                  {stageCards.length === 0 && (
                    <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                      Nenhuma oportunidade nesta etapa.
                    </p>
                  )}
                  {stageCards.map((card: any) => (
                    <Link
                      key={card.id}
                      to="/crm/$id"
                      params={{ id: card.customer_id }}
                      draggable
                      onDragStart={() => setDragging(card.id)}
                      className="block cursor-grab rounded-lg border bg-card p-3 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing"
                    >
                      <p className="truncate text-sm font-medium">
                        {card.customers?.name ?? "Contato"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {card.customers?.phone ?? card.whatsapp_number ?? "sem telefone"}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        Responsável: {card.owner_id ? nameOf(card.owner_id) : "sem responsável"}
                      </p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs font-medium">
                          <CurrencyValues value={card.potential_value} currency={card.currency} />
                        </span>
                        {card.is_demo && <Badge variant="outline">Fictício</Badge>}
                      </div>
                      {card.next_action_at && (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Próxima ação: {formatDate(card.next_action_at)}
                        </p>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : effectiveView === "lista" ? (
        <div className="space-y-6">
          {listStages.map((stage) => {
            const stageCards = cards.filter((c: any) => stage.ids.includes(c.stage_id));
            const currency = isAll ? "BRL" : (current?.main_currency ?? "BRL");
            const stageTotal = stage.ids.reduce((acc, sid) => acc + (totals[sid] ?? 0), 0);
            return (
              <div key={stage.key}>
                <div className="mb-2 flex items-center gap-2">
                  <p className="text-sm font-semibold">{stage.name}</p>
                  <Badge variant="secondary">{stageCards.length}</Badge>
                  <span className="text-xs text-muted-foreground">
                    <CurrencyValues value={stageTotal} currency={currency as any} />
                  </span>
                </div>
                {stageCards.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                    Nenhuma oportunidade nesta etapa.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {stageCards.map((card: any) => (
                      <div
                        key={card.id}
                        className="surface-card flex flex-wrap items-center justify-between gap-3 p-3"
                      >
                        <div className="min-w-0">
                          <Link
                            to="/crm/$id"
                            params={{ id: card.customer_id }}
                            className="block truncate text-sm font-medium hover:underline"
                          >
                            {card.customers?.name ?? "Contato"}
                          </Link>
                          <p className="truncate text-xs text-muted-foreground">
                            {card.customers?.phone ?? card.whatsapp_number ?? "sem telefone"}
                            {card.lead_origin ? ` · ${card.lead_origin}` : ""}
                            {isAll && ` · ${productName(card.product_id)}`}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            Responsável: {card.owner_id ? nameOf(card.owner_id) : "sem responsável"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            <CurrencyValues value={card.potential_value} currency={card.currency} />
                          </span>
                          <Select
                            value={card.stage_id ?? ""}
                            onValueChange={(v) => moveCard(card.id, v)}
                          >
                            <SelectTrigger className="h-8 w-44">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {stagesForCard(card).map((s: any) => (
                                <SelectItem key={s.id} value={s.id}>
                                  {s.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              navigate({ to: "/crm/$id", params: { id: card.customer_id } })
                            }
                          >
                            Abrir
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="surface-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contato</TableHead>
                {isAll && <TableHead>Categoria</TableHead>}
                <TableHead>Telefone</TableHead>
                <TableHead>Etapa</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Próxima ação</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cards.map((card: any) => (
                <TableRow key={card.id}>
                  <TableCell className="font-medium">
                    <Link
                      to="/crm/$id"
                      params={{ id: card.customer_id }}
                      className="hover:underline"
                    >
                      {card.customers?.name ?? "Contato"}
                    </Link>
                    {card.is_demo && (
                      <Badge variant="outline" className="ml-2">
                        Fictício
                      </Badge>
                    )}
                  </TableCell>
                  {isAll && <TableCell>{productName(card.product_id)}</TableCell>}
                  <TableCell>{card.customers?.phone ?? card.whatsapp_number ?? "—"}</TableCell>
                  <TableCell>
                    <Select value={card.stage_id ?? ""} onValueChange={(v) => moveCard(card.id, v)}>
                      <SelectTrigger className="h-8 w-44">
                        <SelectValue placeholder={stageName(card.stage_id)} />
                      </SelectTrigger>
                      <SelectContent>
                        {stagesForCard(card).map((s: any) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {isAdmin ? (
                      <Select
                        value={card.owner_id ?? "sem"}
                        onValueChange={(v) => setOwner(card.id, v)}
                      >
                        <SelectTrigger className="h-8 w-44">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sem">Sem responsável</SelectItem>
                          {peopleOptions.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span>{card.owner_id ? nameOf(card.owner_id) : "—"}</span>
                    )}
                  </TableCell>
                  <TableCell>{card.lead_origin ?? "—"}</TableCell>
                  <TableCell>
                    <CurrencyValues value={card.potential_value} currency={card.currency} />
                  </TableCell>
                  <TableCell>
                    {card.next_action_at ? formatDate(card.next_action_at) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate({ to: "/crm/$id", params: { id: card.customer_id } })}
                    >
                      Abrir
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Nova oportunidade</DialogTitle>
            <DialogDescription>
              Cadastre um novo contato no funil. Ao aprovar um orçamento, ele vira cliente.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            {isAll && (
              <div>
                <Label>Categoria *</Label>
                <Select
                  value={form.product_id ?? ""}
                  onValueChange={(v) => setForm((f: any) => ({ ...f, product_id: v }))}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Selecione a categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors["product_id"] && (
                  <p className="mt-1 text-xs text-destructive">{errors["product_id"]}</p>
                )}
              </div>
            )}

            <ToggleGroup
              type="single"
              value={mode}
              onValueChange={(v) => v && setMode(v as "existente" | "novo")}
              variant="outline"
              size="sm"
              className="w-full"
            >
              <ToggleGroupItem value="novo" className="flex-1">
                Contato novo
              </ToggleGroupItem>
              <ToggleGroupItem value="existente" className="flex-1">
                Contato existente
              </ToggleGroupItem>
            </ToggleGroup>

            {mode === "novo" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label>Nome *</Label>
                  <Input
                    className="mt-1.5"
                    value={form.name ?? ""}
                    onChange={(e) => setForm((f: any) => ({ ...f, name: e.target.value }))}
                  />
                  {errors["name"] && (
                    <p className="mt-1 text-xs text-destructive">{errors["name"]}</p>
                  )}
                </div>
                <div>
                  <Label>Telefone / WhatsApp</Label>
                  <Input
                    className="mt-1.5"
                    value={form.phone ?? ""}
                    onChange={(e) => setForm((f: any) => ({ ...f, phone: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>E-mail</Label>
                  <Input
                    className="mt-1.5"
                    value={form.email ?? ""}
                    onChange={(e) => setForm((f: any) => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Documento</Label>
                  <Input
                    className="mt-1.5"
                    value={form.document ?? ""}
                    onChange={(e) => setForm((f: any) => ({ ...f, document: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Cidade</Label>
                  <Input
                    className="mt-1.5"
                    value={form.city ?? ""}
                    onChange={(e) => setForm((f: any) => ({ ...f, city: e.target.value }))}
                  />
                </div>
              </div>
            ) : (
              <div>
                <Label>Contato *</Label>
                <Select
                  value={form.customer_id ?? ""}
                  onValueChange={(v) => setForm((f: any) => ({ ...f, customer_id: v }))}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Selecione o contato" />
                  </SelectTrigger>
                  <SelectContent>
                    {(data?.customers ?? []).map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors["customer_id"] && (
                  <p className="mt-1 text-xs text-destructive">{errors["customer_id"]}</p>
                )}
                {(data?.customers ?? []).length === 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Nenhum contato cadastrado ainda. Use a opção “Contato novo”.
                  </p>
                )}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Valor potencial</Label>
                <Input
                  className="mt-1.5"
                  value={form.potential_value ?? ""}
                  onChange={(e) => setForm((f: any) => ({ ...f, potential_value: e.target.value }))}
                />
                {errors["potential_value"] && (
                  <p className="mt-1 text-xs text-destructive">{errors["potential_value"]}</p>
                )}
              </div>
              <div>
                <Label>Moeda</Label>
                <Select
                  value={form.currency ?? "BRL"}
                  onValueChange={(v) => setForm((f: any) => ({ ...f, currency: v }))}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {isAdmin && (
              <div>
                <Label>Responsável</Label>
                <Select
                  value={form.owner_id ?? ""}
                  onValueChange={(v) => setForm((f: any) => ({ ...f, owner_id: v }))}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Selecione o responsável" />
                  </SelectTrigger>
                  <SelectContent>
                    {peopleOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label>Origem do lead</Label>
              <Input
                className="mt-1.5"
                placeholder="Indicação, anúncio, feira…"
                value={form.lead_origin ?? ""}
                onChange={(e) => setForm((f: any) => ({ ...f, lead_origin: e.target.value }))}
              />
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea
                className="mt-1.5"
                value={form.notes ?? ""}
                onChange={(e) => setForm((f: any) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 size-4 animate-spin" />} Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
