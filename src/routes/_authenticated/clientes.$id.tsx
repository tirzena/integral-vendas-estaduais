/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useAuth";
import { useEstadualAccess } from "@/hooks/useEstadualAccess";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { deliveryState, delayDays, DELIVERY_LABEL, stateTone } from "@/lib/delivery";
import { CurrencyValues } from "@/components/common/CurrencyValues";
import { useRates } from "@/hooks/useRates";

import { PageHeader, EmptyState } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/clientes/$id")({
  head: () => ({
    meta: [
      { title: "Ficha do cliente — OS" },
      { name: "description", content: "Histórico completo do cliente em todos os produtos." },
      { property: "og:title", content: "Ficha do cliente — OS" },
      { property: "og:description", content: "Histórico do cliente em todos os produtos." },
    ],
  }),
  component: ClienteDetalhe,
});

const DAY = 86_400_000;
const daysSince = (value?: string | null) =>
  value ? Math.floor((Date.now() - new Date(value).getTime()) / DAY) : null;

function sumByCurrency(rows: any[], field = "total") {
  const map: Record<string, number> = {};
  rows.forEach((r) => {
    const cur = r.currency ?? "BRL";
    map[cur] = (map[cur] ?? 0) + Number(r[field] ?? 0);
  });
  return map;
}

function MoneyList({ map, empty = "—" }: { map: Record<string, number>; empty?: string }) {
  const entries = Object.entries(map).filter(([, v]) => v);
  if (!entries.length) return <span>{empty}</span>;
  return (
    <span className="flex flex-wrap gap-x-3">
      {entries.map(([cur, v]) => (
        <CurrencyValues key={cur} value={v} currency={cur as any} />
      ))}
    </span>
  );
}

function ClienteDetalhe() {
  const { id } = Route.useParams();
  const { userId } = useCurrentUser();
  const estadualAccess = useEstadualAccess();
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const rates = useRates();
  const allMoney = useCallback(
    (value: number, currency: any) =>
      rates
        .allCurrencies(value, currency)
        .map((item) => item.text)
        .join(" · "),
    [rates],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["customer", id],
    queryFn: async () => {
      const [customer, links, activities, orders, quotes, docs, receivables, history] =
        await Promise.all([
          supabase.from("customers").select("*").eq("id", id).maybeSingle(),
          supabase
            .from("customer_products")
            .select("*, products(name, color), pipeline_stages(name, stage_type)")
            .eq("customer_id", id),
          supabase
            .from("activities")
            .select("*")
            .eq("customer_id", id)
            .order("created_at", { ascending: false })
            .limit(100),
          supabase.from("orders").select("*").eq("customer_id", id),
          supabase.from("quotes").select("*").eq("customer_id", id),
          supabase.from("customer_documents").select("*").eq("customer_id", id),
          supabase.from("accounts_receivable").select("*").eq("customer_id", id),
          supabase.from("customer_products").select("id").eq("customer_id", id),
        ]);

      const oppIds = (history.data ?? []).map((h: any) => h.id);
      const events = oppIds.length
        ? ((
            await supabase
              .from("opportunity_history")
              .select("*")
              .in("customer_product_id", oppIds)
              .order("created_at", { ascending: false })
              .limit(100)
          ).data ?? [])
        : [];

      const orderIds = (orders.data ?? []).map((o: any) => o.id);
      const payments = orderIds.length
        ? ((await supabase.from("payments").select("*").in("order_id", orderIds)).data ?? [])
        : [];

      return {
        customer: customer.data,
        links: links.data ?? [],
        activities: activities.data ?? [],
        orders: orders.data ?? [],
        quotes: quotes.data ?? [],
        docs: docs.data ?? [],
        receivables: receivables.data ?? [],
        events,
        payments,
      };
    },
  });

  const metrics = useMemo(() => {
    if (!data) return null;
    const orders = data.orders.filter((o: any) => o.status !== "cancelado");
    const paidReceivables = data.receivables.filter((r: any) => r.status === "pago" || r.paid_at);
    const openReceivables = data.receivables.filter(
      (r: any) => !(r.status === "pago" || r.paid_at),
    );
    const today = new Date().toISOString().slice(0, 10);
    const overdue = openReceivables.filter((r: any) => r.due_date && r.due_date < today);
    const paidPayments = data.payments.filter((p: any) => p.status === "pago" || p.paid_at);

    const paidMap = sumByCurrency([
      ...paidReceivables.map((r: any) => ({ ...r, total: r.amount })),
      ...paidPayments.map((p: any) => ({ ...p, total: p.amount })),
    ]);
    const openMap = sumByCurrency(openReceivables.map((r: any) => ({ ...r, total: r.amount })));
    const salesMap = sumByCurrency(orders);

    const lastOrder = orders
      .map((o: any) => o.created_at)
      .sort()
      .at(-1);
    const lastContact =
      [
        ...data.activities.map((a: any) => a.created_at),
        ...data.links.map((l: any) => l.last_contact_at),
      ]
        .filter(Boolean)
        .sort()
        .at(-1) ?? null;

    // Saúde do cliente (0 a 100)
    let score = 60;
    const dOrder = daysSince(lastOrder);
    if (dOrder === null) score -= 15;
    else if (dOrder <= 30) score += 20;
    else if (dOrder <= 90) score += 5;
    else score -= 15;

    const dContact = daysSince(lastContact);
    if (dContact === null) score -= 10;
    else if (dContact <= 15) score += 10;
    else if (dContact > 60) score -= 10;

    if (orders.length >= 3) score += 10;
    score -= Math.min(30, overdue.length * 15);
    if (data.links.some((l: any) => l.commercial_status === "perdido" || l.loss_reason))
      score -= 10;

    // Entregas: pedidos que chegaram atrasados derrubam a satisfação do cliente.
    const lateOrders = orders.filter(
      (o: any) => deliveryState(o) === "atrasado" || (o.delivered_at && delayDays(o) > 0),
    );
    const riskOrders = orders.filter((o: any) => deliveryState(o) === "risco");
    const onTimeOrders = orders.filter(
      (o: any) => (o.delivered_at || o.status === "entregue") && delayDays(o) === 0,
    );
    score -= Math.min(35, lateOrders.length * 12);
    score -= Math.min(10, riskOrders.length * 5);
    if (onTimeOrders.length) score += Math.min(10, onTimeOrders.length * 3);

    score = Math.max(0, Math.min(100, score));

    const label = score >= 75 ? "Saudável" : score >= 45 ? "Precisa de atenção" : "Em risco";
    const tone: "default" | "secondary" | "destructive" =
      score >= 75 ? "default" : score >= 45 ? "secondary" : "destructive";

    const reasons: string[] = [];
    if (overdue.length) reasons.push(`${overdue.length} cobrança(s) em atraso`);
    if (lateOrders.length) reasons.push(`${lateOrders.length} pedido(s) entregues com atraso`);
    if (riskOrders.length) reasons.push(`${riskOrders.length} pedido(s) com risco de atrasar`);
    if (onTimeOrders.length && !lateOrders.length)
      reasons.push(`${onTimeOrders.length} entrega(s) no prazo`);
    if (dOrder !== null && dOrder > 90) reasons.push(`sem comprar há ${dOrder} dias`);
    if (dOrder === null) reasons.push("ainda não comprou");
    if (dContact !== null && dContact > 60) reasons.push(`sem contato há ${dContact} dias`);
    if (!reasons.length) reasons.push("relacionamento em dia");

    return {
      orders,
      ordersCount: orders.length,
      paidMap,
      openMap,
      salesMap,
      overdue,
      openReceivables,
      lastOrder,
      lastContact,
      score,
      label,
      tone,
      reasons,
      isClient: orders.length > 0,
    };
  }, [data]);

  const timeline = useMemo(() => {
    if (!data) return [] as any[];
    const items = [
      ...data.activities.map((a: any) => ({
        at: a.created_at,
        tag: a.type ?? "nota",
        text: a.content ?? "",
      })),
      ...data.events.map((e: any) => ({
        at: e.created_at,
        tag: e.event_type ?? "funil",
        text: e.description ?? "",
      })),
      ...data.quotes.map((q: any) => ({
        at: q.created_at,
        tag: "orçamento",
        text: `Orçamento #${q.number} — ${allMoney(q.total, q.currency)} (${q.status})`,
      })),
      ...data.orders.map((o: any) => ({
        at: o.created_at,
        tag: "pedido",
        text: `Pedido #${o.number} — ${allMoney(o.total, o.currency)} (${o.status})`,
      })),
      ...data.payments.map((p: any) => ({
        at: p.paid_at ?? p.created_at,
        tag: "pagamento",
        text: `${allMoney(p.amount, p.currency)} — ${p.status}${p.method ? ` · ${p.method}` : ""}`,
      })),
    ].filter((i) => i.at);
    return items.sort((a, b) => (a.at < b.at ? 1 : -1));
  }, [data, allMoney]);

  async function addNote() {
    if (!estadualAccess.canWrite) return void toast.error("Seu acesso ao Vendas Estaduais é somente leitura.");
    if (!note.trim()) {
      toast.error("Escreva a anotação antes de salvar.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("activities").insert({
      customer_id: id,
      user_id: userId ?? null,
      type: "nota",
      content: note.trim(),
    });
    setSaving(false);
    if (error) toast.error("Não foi possível salvar a anotação.");
    else {
      setNote("");
      toast.success("Anotação registrada.");
      queryClient.invalidateQueries({ queryKey: ["customer", id] });
    }
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando ficha…</p>;
  if (!data?.customer)
    return (
      <EmptyState
        title="Contato não encontrado"
        description="Este cadastro pode ter sido removido."
        action={
          <Button asChild>
            <Link to="/clientes">Voltar para clientes</Link>
          </Button>
        }
      />
    );

  const c = data.customer as any;

  return (
    <div>
      <Button variant="ghost" className="mb-2 -ml-2" asChild>
        <Link to="/clientes">
          <ArrowLeft className="mr-2 size-4" /> Clientes
        </Link>
      </Button>
      <PageHeader
        title={c.name}
        description={`${c.document || "sem documento"} · ${c.city || "sem cidade"} · ${c.phone || "sem telefone"}`}
        actions={
          <Badge variant={metrics?.isClient ? "default" : "secondary"}>
            {metrics?.isClient ? "Cliente" : "Lead"}
          </Badge>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Já pagou</CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-semibold">
            <MoneyList map={metrics?.paidMap ?? {}} empty="Nada pago ainda" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Em aberto</CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-semibold">
            <MoneyList map={metrics?.openMap ?? {}} empty="Sem cobranças" />
            {!!metrics?.overdue.length && (
              <p className="mt-1 text-xs font-normal text-destructive">
                {metrics.overdue.length} em atraso
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pedidos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">{metrics?.ordersCount ?? 0}</p>
            <p className="text-xs text-muted-foreground">
              Última compra:{" "}
              {metrics?.lastOrder ? formatDate(metrics.lastOrder) : "ainda não comprou"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Saúde do cliente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-lg font-semibold">{metrics?.score ?? 0}</span>
              <Badge variant={metrics?.tone ?? "secondary"}>{metrics?.label}</Badge>
            </div>
            <Progress value={metrics?.score ?? 0} />
            <p className="mt-2 text-xs text-muted-foreground">{metrics?.reasons.join(" · ")}</p>
          </CardContent>
        </Card>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {data.links.map((l: any) => (
          <Badge key={l.id} variant="secondary">
            {l.products?.name} · {l.pipeline_stages?.name ?? l.commercial_status ?? "sem etapa"}
          </Badge>
        ))}
        {data.links.length === 0 && (
          <span className="text-sm text-muted-foreground">
            Este contato ainda não está vinculado a nenhuma categoria.
          </span>
        )}
      </div>

      <Tabs defaultValue="historico">
        <TabsList>
          <TabsTrigger value="historico">Linha do tempo</TabsTrigger>
          <TabsTrigger value="negocios">Pedidos e orçamentos</TabsTrigger>
          <TabsTrigger value="pagamentos">Pagamentos</TabsTrigger>
          <TabsTrigger value="documentos">Documentos</TabsTrigger>
        </TabsList>

        <TabsContent value="historico" className="pt-4">
          <Card className="mb-4">
            <CardHeader>
              <CardTitle>Nova anotação</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={note}
                disabled={!estadualAccess.canWrite}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Registre o que foi conversado com o cliente…"
              />
              <Button onClick={addNote} disabled={saving || !estadualAccess.canWrite}>
                {saving && <Loader2 className="mr-2 size-4 animate-spin" />} Salvar anotação
              </Button>
            </CardContent>
          </Card>

          {timeline.length === 0 ? (
            <EmptyState
              title="Sem histórico ainda"
              description="Tudo que acontecer com este contato aparece aqui."
            />
          ) : (
            <div className="space-y-3">
              {timeline.map((t, index) => (
                <Card key={`${t.at}-${index}`}>
                  <CardContent className="pt-6">
                    <div className="mb-1 flex items-center gap-2">
                      <Badge variant="secondary">{t.tag}</Badge>
                      <span className="text-xs text-muted-foreground">{formatDateTime(t.at)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm">{t.text}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="negocios" className="pt-4">
          {data.orders.length === 0 && data.quotes.length === 0 ? (
            <EmptyState
              title="Nenhum orçamento ou pedido"
              description="Crie um orçamento no módulo Pedidos e orçamentos."
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Documento</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead>Entrega</TableHead>

                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    ...data.quotes.map((q: any) => ({ ...q, kind: "Orçamento" })),
                    ...data.orders.map((o: any) => ({ ...o, kind: "Pedido" })),
                  ]
                    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
                    .map((d: any) => (
                      <TableRow key={`${d.kind}-${d.id}`}>
                        <TableCell>
                          {d.kind} #{d.number}
                        </TableCell>
                        <TableCell>{formatDate(d.created_at)}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{d.status}</Badge>
                        </TableCell>
                        <TableCell>
                          {d.kind === "Pedido" ? (
                            <span className="flex flex-col gap-0.5">
                              <Badge variant={stateTone(deliveryState(d))}>
                                {DELIVERY_LABEL[deliveryState(d)]}
                              </Badge>
                              <span className="text-[11px] text-muted-foreground">
                                {d.delivered_at
                                  ? `chegou ${formatDate(d.delivered_at)}`
                                  : delayDays(d) > 0
                                    ? `${delayDays(d)} dia(s) de atraso`
                                    : ""}
                              </span>
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>

                        <TableCell className="text-right font-medium">
                          <CurrencyValues value={d.total} currency={d.currency} />
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="pagamentos" className="pt-4">
          {data.receivables.length === 0 && data.payments.length === 0 ? (
            <EmptyState
              title="Nenhum pagamento registrado"
              description="As cobranças e parcelas deste cliente aparecem aqui."
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Pago em</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    ...data.receivables.map((r: any) => ({
                      id: `r-${r.id}`,
                      label:
                        r.description +
                        (r.installments_total
                          ? ` (${r.installment_number}/${r.installments_total})`
                          : ""),
                      due: r.due_date,
                      paid: r.paid_at,
                      status: r.status,
                      amount: r.amount,
                      currency: r.currency,
                    })),
                    ...data.payments.map((p: any) => ({
                      id: `p-${p.id}`,
                      label: `Parcela ${p.installment ?? 1}${p.method ? ` · ${p.method}` : ""}`,
                      due: p.due_date,
                      paid: p.paid_at,
                      status: p.status,
                      amount: p.amount,
                      currency: p.currency,
                    })),
                  ].map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.label}</TableCell>
                      <TableCell>{formatDate(row.due)}</TableCell>
                      <TableCell>{formatDate(row.paid)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            row.paid || row.status === "pago"
                              ? "default"
                              : row.due && row.due < new Date().toISOString().slice(0, 10)
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {row.paid || row.status === "pago"
                            ? "pago"
                            : row.due && row.due < new Date().toISOString().slice(0, 10)
                              ? "em atraso"
                              : (row.status ?? "em aberto")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        <CurrencyValues value={row.amount} currency={row.currency} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="documentos" className="pt-4">
          {data.docs.length === 0 ? (
            <EmptyState
              title="Nenhum documento anexado"
              description="Anexe contratos e comprovantes pelo módulo de documentos do cliente."
            />
          ) : (
            <div className="space-y-2">
              {data.docs.map((d: any) => (
                <Card key={d.id}>
                  <CardContent className="flex items-center justify-between pt-6">
                    <span>{d.title}</span>
                    {d.file_url && (
                      <Button variant="link" asChild>
                        <a href={d.file_url} target="_blank" rel="noreferrer">
                          Abrir
                        </a>
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
