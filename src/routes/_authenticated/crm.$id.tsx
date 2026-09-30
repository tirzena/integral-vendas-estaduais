/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useAuth";
import { usePeople } from "@/hooks/usePeople";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { CurrencyValues } from "@/components/common/CurrencyValues";

import { PageHeader, EmptyState } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/crm/$id")({
  head: () => ({
    meta: [
      { title: "Ficha do lead — OS" },
      {
        name: "description",
        content: "Dados, histórico e próximas ações do lead antes da primeira compra.",
      },
      { property: "og:title", content: "Ficha do lead — OS" },
      { property: "og:description", content: "Histórico completo do lead dentro do CRM." },
    ],
  }),
  component: LeadDetalhe,
});

function LeadDetalhe() {
  const { id } = Route.useParams();
  const { userId } = useCurrentUser();
  const { nameOf } = usePeople();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [contact, setContact] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["lead", id],
    queryFn: async () => {
      const [customerRes, oppsRes, activitiesRes, ordersRes, quotesRes] = await Promise.all([
        supabase.from("customers").select("*").eq("id", id).maybeSingle(),
        supabase
          .from("customer_products")
          .select("*, products(name), pipeline_stages(name, stage_type)")
          .eq("customer_id", id),
        supabase
          .from("activities")
          .select("*")
          .eq("customer_id", id)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("orders")
          .select("id,code,total,currency,status,created_at")
          .eq("customer_id", id),
        supabase
          .from("quotes")
          .select("id,code,total,currency,status,created_at")
          .eq("customer_id", id),
      ]);
      return {
        customer: customerRes.data,
        opportunities: oppsRes.data ?? [],
        activities: activitiesRes.data ?? [],
        orders: ordersRes.data ?? [],
        quotes: quotesRes.data ?? [],
      };
    },
  });

  const customer = data?.customer;
  const isCustomer = (data?.orders ?? []).length > 0;

  const form = useMemo(
    () =>
      contact ?? {
        name: customer?.name ?? "",
        phone: customer?.phone ?? "",
        email: customer?.email ?? "",
        city: customer?.city ?? "",
        origin: customer?.origin ?? "",
        notes: customer?.notes ?? "",
      },
    [contact, customer],
  );

  async function saveContact() {
    setSaving(true);
    const { error } = await supabase
      .from("customers")
      .update({
        name: form.name,
        phone: form.phone || null,
        email: form.email || null,
        city: form.city || null,
        origin: form.origin || null,
        notes: form.notes || null,
      })
      .eq("id", id);
    setSaving(false);
    if (error) toast.error("Não foi possível salvar os dados do lead.");
    else {
      toast.success("Dados atualizados.");
      queryClient.invalidateQueries({ queryKey: ["lead", id] });
      queryClient.invalidateQueries({ queryKey: ["crm"] });
    }
  }

  async function addNote() {
    if (!note.trim()) return;
    const { error } = await supabase.from("activities").insert({
      customer_id: id,
      type: "nota",
      content: note.trim(),
      user_id: userId ?? null,
    });
    if (error) toast.error("Não foi possível registrar a anotação.");
    else {
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["lead", id] });
    }
  }

  async function editOpportunity(opportunity: any) {
    const origin = prompt("Origem do lead", opportunity.lead_origin ?? "");
    if (origin === null) return;
    const { error } = await supabase
      .from("customer_products")
      .update({ lead_origin: origin.trim() || null })
      .eq("id", opportunity.id);
    if (error) toast.error("Não foi possível alterar a origem.");
    else {
      toast.success("Origem atualizada.");
      queryClient.invalidateQueries({ queryKey: ["lead", id] });
      queryClient.invalidateQueries({ queryKey: ["crm"] });
    }
  }

  async function deleteOpportunity(opportunity: any) {
    if (!confirm(`Apagar o lead da categoria ${opportunity.products?.name ?? "selecionada"}?`))
      return;
    const { error } = await supabase.from("customer_products").delete().eq("id", opportunity.id);
    if (error) toast.error("Apenas administradores podem apagar este lead.");
    else {
      toast.success("Lead apagado do CRM.");
      queryClient.invalidateQueries({ queryKey: ["lead", id] });
      queryClient.invalidateQueries({ queryKey: ["crm"] });
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Carregando lead…
      </div>
    );
  }

  if (!customer) {
    return (
      <EmptyState
        title="Lead não encontrado"
        description="Este contato pode ter sido removido do funil."
      />
    );
  }

  return (
    <div>
      <PageHeader
        title={customer.name}
        description={
          isCustomer
            ? "Este contato já fez pedido e também aparece em Clientes."
            : "Ainda é um lead: vira cliente ao fazer o primeiro pedido."
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to="/crm">
                <ArrowLeft className="mr-2 size-4" /> Voltar ao funil
              </Link>
            </Button>
            {isCustomer && (
              <Button asChild>
                <Link to="/clientes/$id" params={{ id }}>
                  Ver ficha de cliente
                </Link>
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Dados do contato</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(
              [
                ["name", "Nome"],
                ["phone", "Telefone / WhatsApp"],
                ["email", "E-mail"],
                ["city", "Cidade"],
                ["origin", "Origem"],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <Label>{label}</Label>
                <Input
                  className="mt-1.5"
                  value={form[key] ?? ""}
                  onChange={(e) => setContact({ ...form, [key]: e.target.value })}
                />
              </div>
            ))}
            <div>
              <Label>Observações</Label>
              <Textarea
                className="mt-1.5"
                value={form.notes ?? ""}
                onChange={(e) => setContact({ ...form, notes: e.target.value })}
              />
            </div>
            <Button onClick={saveContact} disabled={saving}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />} Salvar
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Oportunidades no funil</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(data?.opportunities ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma oportunidade cadastrada para este contato.
                </p>
              ) : (
                data!.opportunities.map((o: any) => (
                  <div
                    key={o.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{o.products?.name ?? "Categoria"}</p>
                      <p className="text-xs text-muted-foreground">
                        Etapa: {o.pipeline_stages?.name ?? "—"} · Responsável:{" "}
                        {o.owner_id ? nameOf(o.owner_id) : "sem responsável"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Origem: {o.lead_origin ?? "não informada"}
                        {o.ad ? ` · Anúncio: ${o.ad}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        <CurrencyValues value={o.potential_value} currency={o.currency} />
                      </span>
                      {o.next_action_at && (
                        <Badge variant="outline">Próxima ação {formatDate(o.next_action_at)}</Badge>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Editar origem"
                        onClick={() => void editOpportunity(o)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Apagar lead"
                        onClick={() => void deleteOpportunity(o)}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Orçamentos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(data?.quotes ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum orçamento ainda.</p>
                ) : (
                  data!.quotes.map((q: any) => (
                    <div key={q.id} className="flex items-center justify-between text-sm">
                      <span>{q.code ?? q.id.slice(0, 8)}</span>
                      <span className="text-muted-foreground">{q.status}</span>
                      <CurrencyValues value={q.total} currency={q.currency} />
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pedidos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(data?.orders ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum pedido — por isso ainda é lead.
                  </p>
                ) : (
                  data!.orders.map((o: any) => (
                    <div key={o.id} className="flex items-center justify-between text-sm">
                      <span>{o.code ?? o.id.slice(0, 8)}</span>
                      <span className="text-muted-foreground">{o.status}</span>
                      <CurrencyValues value={o.total} currency={o.currency} />
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Histórico e anotações</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Escreva uma anotação sobre o contato…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <Button onClick={addNote}>Adicionar</Button>
              </div>
              {(data?.activities ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum registro ainda.</p>
              ) : (
                <ul className="space-y-2">
                  {data!.activities.map((a: any) => (
                    <li key={a.id} className="rounded-lg border p-3">
                      <p className="text-sm">{a.content ?? a.type}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(a.created_at)}
                        {a.user_id ? ` · ${nameOf(a.user_id)}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
