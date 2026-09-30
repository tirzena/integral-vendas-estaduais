import { SupplierSummary } from "@/components/inventory/SupplierSummary";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { SupplierStockLots } from "@/components/inventory/SupplierStockLots";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useAuth";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { deliveryState, delayDays, DELIVERY_LABEL, stateTone } from "@/lib/delivery";
import { CurrencyValues } from "@/components/common/CurrencyValues";
import { PageHeader, EmptyState } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

export const Route = createFileRoute("/_authenticated/fornecedores/$id")({
  head: () => ({
    meta: [
      { title: "Ficha do fornecedor — OS" },
      { name: "description", content: "Produtos, pedidos, atrasos e reclamações do fornecedor." },
      { property: "og:title", content: "Ficha do fornecedor — OS" },
      { property: "og:description", content: "Avaliação completa do fornecedor." },
    ],
  }),
  component: FornecedorDetalhe,
});

const ISSUE_TYPES = [
  { value: "atraso", label: "Atraso" },
  { value: "reclamacao", label: "Reclamação" },
  { value: "qualidade", label: "Qualidade" },
  { value: "outro", label: "Outro" },
];

const SEVERITIES = [
  { value: "baixa", label: "Baixa" },
  { value: "media", label: "Média" },
  { value: "alta", label: "Alta" },
];

function FornecedorDetalhe() {
  const { id } = Route.useParams();
  const { userId, isAdmin } = useCurrentUser();
  const queryClient = useQueryClient();
  const [issueType, setIssueType] = useState("reclamacao");
  const [severity, setSeverity] = useState("media");
  const [description, setDescription] = useState("");
  const [issueOrder, setIssueOrder] = useState("");
  const [saving, setSaving] = useState(false);
  const [linkedSupplierUser, setLinkedSupplierUser] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["supplier", id],
    queryFn: async () => {
      const [
        supplier,
        directOrders,
        orderLines,
        items,
        links,
        issues,
        payables,
        assignments,
        profiles,
        supplierRoles,
        portal,
      ] = await Promise.all([
        supabase.from("suppliers").select("*").eq("id", id).maybeSingle(),
        supabase
          .from("orders")
          .select("*, customers(name)")
          .eq("supplier_id", id)
          .is("deleted_at", null)
          .is("superseded_at", null)
          .order("created_at", { ascending: false }),
        supabase
          .from("order_items")
          .select(
            "order_id,quantity,total,inventory_items!inner(supplier_id),orders!inner(*,customers(name))",
          )
          .eq("inventory_items.supplier_id", id)
          .is("orders.deleted_at", null)
          .is("orders.superseded_at", null),
        supabase.from("inventory_items").select("*").eq("supplier_id", id).order("name"),
        supabase.from("supplier_products").select("*, products(name)").eq("supplier_id", id),
        supabase
          .from("supplier_issues")
          .select("*")
          .eq("supplier_id", id)
          .order("created_at", { ascending: false }),
        supabase.from("accounts_payable").select("*").eq("supplier_id", id),
        (supabase as any).from("supplier_user_assignments").select("*").eq("supplier_id", id),
        supabase.from("profiles").select("id,full_name,email").eq("is_active", true),
        supabase.from("user_roles").select("user_id").eq("role", "fornecedor"),
        (supabase as any).rpc("supplier_portal_data", { p_supplier_id: id }),
      ]);
      const relatedOrders = new Map<string, any>();
      for (const order of directOrders.data ?? []) {
        relatedOrders.set(order.id, {
          ...order,
          supplier_quantity: 0,
          supplier_total: 0,
        });
      }
      for (const line of orderLines.data ?? []) {
        const order = (line as any).orders;
        if (!order?.id) continue;
        const current = relatedOrders.get(order.id) ?? {
          ...order,
          supplier_quantity: 0,
          supplier_total: 0,
        };
        current.supplier_quantity += Number(line.quantity ?? 0);
        current.supplier_total += Number(line.total ?? 0);
        relatedOrders.set(order.id, current);
      }
      const orders = [...relatedOrders.values()]
        .map((order) => ({
          ...order,
          supplier_total:
            order.supplier_quantity > 0 ? order.supplier_total : Number(order.total ?? 0),
        }))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      return {
        supplier: supplier.data,
        orders,
        items: items.data ?? [],
        links: links.data ?? [],
        issues: issues.data ?? [],
        payables: payables.data ?? [],
        assignments: assignments.data ?? [],
        profiles: profiles.data ?? [],
        supplierRoles: supplierRoles.data ?? [],
        portal: portal.data ?? null,
      };
    },
  });

  const metrics = useMemo(() => {
    if (!data) return null;
    const orders = data.orders.filter((o: any) => o.status !== "cancelado");
    const delivered = orders.filter((o: any) => o.delivered_at || o.status === "entregue");
    const late = orders.filter((o: any) => deliveryState(o) === "atrasado");
    const onTime = delivered.length - late.filter((o: any) => o.delivered_at).length;
    const openIssues = data.issues.filter((i: any) => !i.resolved_at);
    const avgDelay = late.length
      ? late.reduce((s: number, o: any) => s + delayDays(o), 0) / late.length
      : 0;

    let score = 70;
    if (orders.length) score += Math.round((onTime / orders.length) * 20);
    score -= Math.min(40, late.length * 10);
    score -= Math.min(30, openIssues.length * 8);
    score -= Math.min(15, Math.round(avgDelay));
    if (data.supplier?.rating) score += (Number(data.supplier.rating) - 3) * 5;
    score = Math.max(0, Math.min(100, score));

    const label = score >= 75 ? "Confiável" : score >= 45 ? "Precisa de atenção" : "Arriscado";
    const tone: "default" | "secondary" | "destructive" =
      score >= 75 ? "default" : score >= 45 ? "secondary" : "destructive";

    const totals: Record<string, number> = {};
    orders.forEach((o: any) => {
      const cur = o.currency ?? "BRL";
      totals[cur] = (totals[cur] ?? 0) + Number(o.supplier_total ?? o.total ?? 0);
    });

    return {
      orders,
      late,
      onTime: Math.max(0, onTime),
      openIssues,
      avgDelay,
      score,
      label,
      tone,
      totals,
    };
  }, [data]);

  async function addIssue() {
    if (!description.trim()) {
      toast.error("Descreva a ocorrência.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("supplier_issues").insert({
      supplier_id: id,
      order_id: issueOrder || null,
      issue_type: issueType,
      severity,
      description: description.trim(),
      created_by: userId ?? null,
    });
    setSaving(false);
    if (error) {
      toast.error("Não foi possível registrar a ocorrência.");
      return;
    }
    setDescription("");
    setIssueOrder("");
    toast.success("Ocorrência registrada.");
    queryClient.invalidateQueries({ queryKey: ["supplier", id] });
  }

  async function linkSupplierUser() {
    if (!linkedSupplierUser) return void toast.error("Selecione o login do fornecedor.");
    setSaving(true);
    const { error } = await (supabase as any).rpc("supplier_set_user", {
      p_supplier_id: id,
      p_user_id: linkedSupplierUser,
    });
    setSaving(false);
    if (error) return void toast.error(error.message);
    toast.success("Login vinculado ao fornecedor.");
    await queryClient.invalidateQueries({ queryKey: ["supplier", id] });
  }

  async function toggleResolved(issue: any) {
    await supabase
      .from("supplier_issues")
      .update({ resolved_at: issue.resolved_at ? null : new Date().toISOString().slice(0, 10) })
      .eq("id", issue.id);
    queryClient.invalidateQueries({ queryKey: ["supplier", id] });
  }

  async function removeIssue(issueId: string) {
    const { error } = await supabase.from("supplier_issues").delete().eq("id", issueId);
    if (error) toast.error("Não foi possível excluir.");
    else queryClient.invalidateQueries({ queryKey: ["supplier", id] });
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando ficha…</p>;
  if (!data?.supplier)
    return (
      <EmptyState
        title="Fornecedor não encontrado"
        description="Este cadastro pode ter sido removido."
        action={
          <Button asChild>
            <Link to="/fornecedores">Voltar para fornecedores</Link>
          </Button>
        }
      />
    );

  const s = data.supplier as any;

  return (
    <div>
      <Button variant="ghost" className="mb-2 -ml-2" asChild>
        <Link to="/fornecedores">
          <ArrowLeft className="mr-2 size-4" /> Fornecedores
        </Link>
      </Button>
      <PageHeader
        title={s.name}
        description={`${s.contact_name || "sem contato"} · ${s.country || "sem país"} · ${s.phone || "sem telefone"}`}
        actions={<Badge variant="secondary">{s.status ?? "ativo"}</Badge>}
      />

      <SupplierSummary supplierId={s.id} />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pedidos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">{metrics?.orders.length ?? 0}</p>
            <p className="text-xs text-muted-foreground">
              {metrics?.onTime ?? 0} no prazo · {metrics?.late.length ?? 0} atrasados
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ocorrências</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">{data.issues.length}</p>
            <p className="text-xs text-muted-foreground">
              {metrics?.openIssues.length ?? 0} em aberto · atraso médio{" "}
              {formatNumber(metrics?.avgDelay ?? 0, 1)} dia(s)
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Saúde do fornecedor
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-lg font-semibold">{metrics?.score ?? 0}</span>
              <Badge variant={metrics?.tone ?? "secondary"}>{metrics?.label}</Badge>
            </div>
            <Progress value={metrics?.score ?? 0} />
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="produtos">
        <TabsList>
          <TabsTrigger value="lotes">Lotes e estoque</TabsTrigger>
          <TabsTrigger value="produtos">Produtos</TabsTrigger>
          <TabsTrigger value="pedidos">Pedidos e prazos</TabsTrigger>
          <TabsTrigger value="ocorrencias">Ocorrências</TabsTrigger>
          <TabsTrigger value="dados">Dados comerciais</TabsTrigger>
        </TabsList>

        <TabsContent value="lotes" className="pt-4">
          <SupplierStockLots supplierId={id} />
        </TabsContent>
        <TabsContent value="produtos" className="pt-4">
          {data.items.length === 0 ? (
            <EmptyState
              title="Nenhum produto vinculado"
              description="Vincule este fornecedor aos itens em Categorias e estoque."
            />
          ) : (
            <div className="surface-card overflow-x-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Estoque</TableHead>
                    <TableHead className="text-right">Custo</TableHead>
                    <TableHead className="text-right">Preço</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((i: any) => (
                    <TableRow key={i.id}>
                      <TableCell>{i.name}</TableCell>
                      <TableCell>{i.sku ?? "—"}</TableCell>
                      <TableCell className="text-right">{formatNumber(i.quantity)}</TableCell>
                      <TableCell className="text-right">
                        <CurrencyValues value={i.cost} currency={i.currency} />
                      </TableCell>
                      <TableCell className="text-right">
                        <CurrencyValues value={i.price} currency={i.currency} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="pedidos" className="pt-4">
          {data.orders.length === 0 ? (
            <EmptyState
              title="Nenhum pedido com este fornecedor"
              description="Ao criar pedidos vinculados a ele, os prazos aparecem aqui."
            />
          ) : (
            <div className="surface-card overflow-x-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Qtd. do fornecedor</TableHead>
                    <TableHead className="text-right">Valor dos itens</TableHead>
                    <TableHead>Feito em</TableHead>
                    <TableHead>Prazo</TableHead>
                    <TableHead>Chegou</TableHead>
                    <TableHead>Entrega</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.orders.map((o: any) => {
                    const st = deliveryState(o);
                    return (
                      <TableRow key={o.id}>
                        <TableCell>#{o.number}</TableCell>
                        <TableCell>{o.customers?.name ?? "—"}</TableCell>
                        <TableCell className="text-right">
                          {formatNumber(o.supplier_quantity ?? 0, 3)}
                        </TableCell>
                        <TableCell className="text-right">
                          <CurrencyValues
                            value={Number(o.supplier_total ?? o.total ?? 0)}
                            currency={o.currency}
                            primaryFirst
                          />
                        </TableCell>
                        <TableCell>{formatDate(o.order_date ?? o.created_at)}</TableCell>
                        <TableCell>
                          {formatDate(o.delivery_deadline)}
                          {Number(o.grace_days ?? 0) > 0 ? ` +${o.grace_days}d` : ""}
                        </TableCell>
                        <TableCell>{formatDate(o.delivered_at)}</TableCell>
                        <TableCell>
                          <Badge variant={stateTone(st)}>{DELIVERY_LABEL[st]}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="ocorrencias" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Registrar ocorrência</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label>Tipo</Label>
                  <Select value={issueType} onValueChange={setIssueType}>
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ISSUE_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Gravidade</Label>
                  <Select value={severity} onValueChange={setSeverity}>
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SEVERITIES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Pedido relacionado</Label>
                  <Select value={issueOrder} onValueChange={setIssueOrder}>
                    <SelectTrigger className="mt-1.5">
                      <SelectValue placeholder="Opcional" />
                    </SelectTrigger>
                    <SelectContent>
                      {data.orders.map((o: any) => (
                        <SelectItem key={o.id} value={o.id}>
                          Pedido #{o.number}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Descrição</Label>
                <Textarea
                  className="mt-1.5"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="O que aconteceu com este fornecedor?"
                />
              </div>
              <Button onClick={addIssue} disabled={saving}>
                {saving && <Loader2 className="mr-2 size-4 animate-spin" />} Registrar
              </Button>
            </CardContent>
          </Card>

          {data.issues.length === 0 ? (
            <EmptyState
              title="Nenhuma ocorrência"
              description="Atrasos e reclamações registradas aparecem aqui e afetam a saúde do fornecedor."
            />
          ) : (
            <div className="space-y-2">
              {data.issues.map((i: any) => (
                <Card key={i.id}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
                    <div className="min-w-0">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <Badge variant={i.resolved_at ? "secondary" : "destructive"}>
                          {ISSUE_TYPES.find((t) => t.value === i.issue_type)?.label ?? i.issue_type}
                        </Badge>
                        <Badge variant="outline">{i.severity}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(i.created_at)}
                          {i.resolved_at ? ` · resolvida em ${formatDate(i.resolved_at)}` : ""}
                        </span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{i.description}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => toggleResolved(i)}>
                        {i.resolved_at ? "Reabrir" : "Marcar resolvida"}
                      </Button>
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Excluir ocorrência"
                          onClick={() => removeIssue(i.id)}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="dados" className="space-y-4 pt-4">
          {isAdmin && (
            <Card>
              <CardHeader>
                <CardTitle>Acesso do fornecedor</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <div>
                  <Label>Login com perfil Fornecedor</Label>
                  <Select
                    value={linkedSupplierUser || data.assignments[0]?.user_id || ""}
                    onValueChange={setLinkedSupplierUser}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o usuário" />
                    </SelectTrigger>
                    <SelectContent>
                      {data.profiles
                        .filter((profile: any) =>
                          data.supplierRoles.some((role: any) => role.user_id === profile.id),
                        )
                        .map((profile: any) => (
                          <SelectItem key={profile.id} value={profile.id}>
                            {profile.full_name || profile.email}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={linkSupplierUser} disabled={saving}>
                  {saving && <Loader2 className="mr-2 size-4 animate-spin" />} Vincular login
                </Button>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="grid gap-3 pt-6 text-sm sm:grid-cols-2">
              <p>
                <strong>Documento:</strong> {s.document || "—"}
              </p>
              <p>
                <strong>E-mail:</strong> {s.email || "—"}
              </p>
              <p>
                <strong>Endereço:</strong> {s.address || "—"}
              </p>
              <p>
                <strong>Moedas aceitas:</strong>{" "}
                {Array.isArray(s.currencies) && s.currencies.length ? s.currencies.join(", ") : "—"}
              </p>
              <p>
                <strong>Prazo médio informado:</strong>{" "}
                {s.lead_time_days ? `${s.lead_time_days} dias` : "—"}
              </p>
              <p>
                <strong>Avaliação manual:</strong> {s.rating ?? "—"}
              </p>
              <p className="sm:col-span-2">
                <strong>Condições comerciais:</strong> {s.commercial_terms || "—"}
              </p>
              <p className="sm:col-span-2">
                <strong>Observações:</strong> {s.notes || "—"}
              </p>
              <p className="sm:col-span-2 text-xs text-muted-foreground">
                Contas a pagar vinculadas: {data.payables.length}
              </p>
              {data.portal && (
                <div className="sm:col-span-2 rounded-lg border p-3">
                  <p className="font-medium">Compras e bonificações</p>
                  <p className="text-muted-foreground">
                    {(data.portal.purchases ?? [])
                      .reduce((sum: number, row: any) => sum + Number(row.quantity ?? 0), 0)
                      .toLocaleString("pt-BR")}{" "}
                    unidades recebidas ·{" "}
                    {(data.portal.purchases ?? [])
                      .reduce((sum: number, row: any) => sum + Number(row.bonus_quantity ?? 0), 0)
                      .toLocaleString("pt-BR")}{" "}
                    bonificadas
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
