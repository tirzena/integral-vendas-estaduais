/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Send, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useDeleteRow, useSaveRow } from "@/lib/db";
import { PageHeader, EmptyState, DemoBadge } from "@/components/common/PageHeader";
import { usePeople } from "@/hooks/usePeople";
import { useCurrentUser } from "@/hooks/useAuth";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/tarefas/$id")({
  head: () => ({
    meta: [
      { title: "Detalhes da tarefa — OS" },
      { name: "description", content: "Prazo, responsável, cliente e histórico da tarefa." },
      { property: "og:title", content: "Detalhes da tarefa — OS" },
      { property: "og:description", content: "Prazo, responsável, cliente e situação da tarefa." },
    ],
  }),
  component: TaskDetail,
});

const PRIORITIES = [
  { value: "baixa", label: "Baixa" },
  { value: "media", label: "Média" },
  { value: "alta", label: "Alta" },
];
const STATUSES = [
  { value: "pendente", label: "Pendente" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "concluida", label: "Concluída" },
];

function Info({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value ?? "—"}</p>
    </div>
  );
}

function TaskDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { nameOf } = usePeople();
  const { userId, isAdmin, isManager } = useCurrentUser();
  const [routeTo, setRouteTo] = useState("");
  const save = useSaveRow("tasks");
  const remove = useDeleteRow("tasks");

  const { data, isLoading } = useQuery({
    queryKey: ["task", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("tasks")
        .select("*, customers(name), products(name)")
        .eq("id", id)
        .maybeSingle();
      return data as any;
    },
  });

  const recipientsQuery = useQuery({
    queryKey: ["task-request-recipients"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("task_request_recipients");
      if (error) throw error;
      return data ?? [];
    },
  });
  const historyQuery = useQuery({
    queryKey: ["task-routing-history", id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("task_routing_history")
        .select("*")
        .eq("task_id", id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Carregando…
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState
        title="Tarefa não encontrada"
        description="Ela pode ter sido excluída."
        action={
          <Button asChild>
            <Link to="/tarefas">Voltar para tarefas</Link>
          </Button>
        }
      />
    );
  }

  const update = (patch: Record<string, any>) => save.mutate({ id, ...patch } as any);
  const canRoute =
    data.request_kind === "solicitacao" &&
    (isAdmin || isManager || data.assignee_id === userId);
  const requestCategory =
    ({
      criativo: "Criativo",
      video: "Vídeo",
      landing_page: "Landing page",
      campanha: "Campanha",
      texto: "Texto ou conteúdo",
      outro: "Outro",
    } as Record<string, string>)[data.request_category] ?? data.request_category;

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-2" asChild>
        <Link to="/tarefas">
          <ArrowLeft className="mr-2 size-4" /> Voltar para tarefas
        </Link>
      </Button>

      <PageHeader
        title={data.title}
        description={data.description ?? "Sem descrição cadastrada."}
        actions={
          <Button
            variant="outline"
            onClick={() => {
              remove.mutate(id, { onSuccess: () => navigate({ to: "/tarefas" }) });
            }}
          >
            <Trash2 className="mr-2 size-4" /> Excluir
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Informações {data.is_demo && <DemoBadge />}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Info label="Responsável" value={nameOf(data.assignee_id)} />
            <Info label="Criada por" value={nameOf(data.creator_id)} />
            {data.request_kind === "solicitacao" && (
              <>
                <Info label="Solicitação" value={requestCategory} />
                <Info label="Etapa" value={data.request_stage ?? "triagem"} />
              </>
            )}
            <Info label="Cliente" value={data.customers?.name} />
            <Info label="Categoria" value={data.products?.name} />
            <Info label="Prazo" value={data.due_at ? formatDateTime(data.due_at) : "sem prazo"} />
            <Info label="Criada em" value={formatDateTime(data.created_at)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Situação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Situação</p>
              <Select
                value={data.status ?? "pendente"}
                onValueChange={(v) => update({ status: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {canRoute && (
              <div className="rounded-lg border p-3">
                <p className="mb-1 text-xs font-medium">Encaminhar demanda</p>
                <p className="mb-2 text-xs text-muted-foreground">
                  Envie para criação, marketing, tecnologia ou outra liderança.
                </p>
                <Select value={routeTo} onValueChange={setRouteTo}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolher responsável" />
                  </SelectTrigger>
                  <SelectContent>
                    {(recipientsQuery.data ?? [])
                      .filter((person: any) => person.id !== data.assignee_id)
                      .map((person: any) => (
                        <SelectItem key={person.id} value={person.id}>
                          {person.full_name} · {person.area_name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Button
                  className="mt-2 w-full"
                  disabled={!routeTo || save.isPending}
                  onClick={() => {
                    update({ assignee_id: routeTo, request_stage: "encaminhada" });
                    setRouteTo("");
                  }}
                >
                  <Send className="mr-2 size-4" /> Encaminhar
                </Button>
              </div>
            )}
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Prioridade</p>
              <Select
                value={data.priority ?? "media"}
                onValueChange={(v) => update({ priority: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {data.due_at && new Date(data.due_at) < new Date() && data.status !== "concluida" && (
              <Badge variant="destructive">Em atraso</Badge>
            )}
          </CardContent>
        </Card>
      </div>
      {data.request_kind === "solicitacao" && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Fluxo da solicitação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(historyQuery.data ?? []).map((event: any) => (
              <div key={event.id} className="flex gap-3 border-l-2 pl-3">
                <div>
                  <p className="text-sm font-medium">
                    {event.action === "solicitada"
                      ? `Enviada para ${nameOf(event.to_user_id)}`
                      : event.action === "concluida"
                        ? "Solicitação concluída"
                        : `Encaminhada para ${nameOf(event.to_user_id)}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {nameOf(event.actor_id)} · {formatDateTime(event.created_at)}
                  </p>
                </div>
              </div>
            ))}
            {!historyQuery.isLoading && (historyQuery.data ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum encaminhamento registrado.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
