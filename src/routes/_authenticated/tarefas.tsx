/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CalendarCheck, CalendarDays, List, Loader2, Table as TableIcon } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ResourcePage } from "@/components/common/ResourcePage";
import { useProductScope } from "@/hooks/useProductScope";
import { useCurrentUser } from "@/hooks/useAuth";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ReportButton } from "@/components/common/ReportButton";
import { TaskCalendar, TaskList } from "@/components/tasks/TaskViews";
import { usePeople } from "@/hooks/usePeople";
import { useRows } from "@/lib/db";
import {
  getGoogleCalendarStatus,
  disconnectGoogleCalendar,
  startGoogleCalendarOAuth,
  syncGoogleCalendar,
} from "@/lib/google-calendar.functions";

export const Route = createFileRoute("/_authenticated/tarefas")({
  head: () => ({
    meta: [
      { title: "Tarefas — OS" },
      { name: "description", content: "Tarefas da equipe com prazos, prioridade e responsáveis." },
      { property: "og:title", content: "Tarefas — OS" },
      { property: "og:description", content: "Tarefas com prazos, prioridade e responsáveis." },
    ],
  }),
  component: Tarefas,
});

type View = "tabela" | "lista" | "calendario";

function Tarefas() {
  const { productId } = useProductScope();
  const { userId, isAdmin } = useCurrentUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const filter = productId === "todos" ? {} : { product_id: productId };
  const { nameOf, options: peopleOptions } = usePeople();
  const [view, setView] = useState<View>("tabela");
  const [assignee, setAssignee] = useState("todos");
  const [customer, setCustomer] = useState("todos");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const googleStatus = useServerFn(getGoogleCalendarStatus);
  const connectGoogle = useServerFn(startGoogleCalendarOAuth);
  const syncGoogle = useServerFn(syncGoogleCalendar);
  const disconnectGoogle = useServerFn(disconnectGoogleCalendar);

  const calendarStatus = useQuery({
    queryKey: ["google-calendar-status"],
    queryFn: () => googleStatus(),
  });
  const calendarAction = useMutation({
    mutationFn: async () => {
      if (!calendarStatus.data?.connected) {
        const result = await connectGoogle();
        window.location.href = result.url;
        return null;
      }
      return syncGoogle();
    },
    onSuccess: (result) => {
      if (!result) return;
      toast.success(
        `Google Calendar atualizado: ${result.created} criada(s), ${result.updated} atualizada(s).`,
      );
      queryClient.invalidateQueries({ queryKey: ["google-calendar-status"] });
    },
    onError: (error: any) =>
      toast.error(error?.message ?? "Não foi possível conectar ao Google Calendar."),
  });

  const customersQuery = useRows<any>("customers", {
    orderBy: { column: "name", ascending: true },
  });
  const customers = customersQuery.data ?? [];
  const teamsQuery = useRows<any>("teams", { orderBy: { column: "name", ascending: true } });
  const membershipsQuery = useRows<any>("team_members", {
    filter: isAdmin || !userId ? {} : { user_id: userId },
  });
  const memberTeamIds = new Set((membershipsQuery.data ?? []).map((row: any) => row.team_id));
  const requestTeams = (teamsQuery.data ?? []).filter(
    (team: any) => isAdmin || memberTeamIds.has(team.id),
  );
  const customerName = (id?: string | null) => customers.find((c: any) => c.id === id)?.name ?? "—";

  const tasksQuery = useRows<any>("tasks", {
    filter,
    orderBy: { column: "due_at", ascending: true },
  });
  const allTasks = tasksQuery.data ?? [];

  const filterRow = useMemo(
    () => (row: any) => {
      if (assignee !== "todos" && row.assignee_id !== assignee) return false;
      if (customer !== "todos" && row.customer_id !== customer) return false;
      if (from || to) {
        if (!row.due_at) return false;
        const due = new Date(row.due_at);
        if (from && due < new Date(`${from}T00:00:00`)) return false;
        if (to && due > new Date(`${to}T23:59:59`)) return false;
      }
      return true;
    },
    [assignee, customer, from, to],
  );

  const tasks = allTasks.filter(filterRow);

  const viewSwitch = (
    <div className="inline-flex overflow-hidden rounded-lg border">
      {(
        [
          ["tabela", "Tabela", TableIcon],
          ["lista", "Lista", List],
          ["calendario", "Calendário", CalendarDays],
        ] as const
      ).map(([key, label, Icon]) => (
        <Button
          key={key}
          type="button"
          variant={view === key ? "default" : "ghost"}
          size="sm"
          className="rounded-none"
          onClick={() => setView(key)}
        >
          <Icon className="mr-1.5 size-4" /> {label}
        </Button>
      ))}
    </div>
  );

  const extraFilters = (
    <>
      {isAdmin && (
        <Select value={assignee} onValueChange={setAssignee}>
          <SelectTrigger className="w-[190px]">
            <SelectValue placeholder="Responsável" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os responsáveis</SelectItem>
            {peopleOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Select value={customer} onValueChange={setCustomer}>
        <SelectTrigger className="w-[190px]">
          <SelectValue placeholder="Cliente" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todos">Todos os clientes</SelectItem>
          {customers.map((c: any) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        type="date"
        className="w-[150px]"
        aria-label="Prazo a partir de"
        value={from}
        onChange={(e) => setFrom(e.target.value)}
      />
      <Input
        type="date"
        className="w-[150px]"
        aria-label="Prazo até"
        value={to}
        onChange={(e) => setTo(e.target.value)}
      />
      {(assignee !== "todos" || customer !== "todos" || from || to) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setAssignee("todos");
            setCustomer("todos");
            setFrom("");
            setTo("");
          }}
        >
          Limpar filtros
        </Button>
      )}
    </>
  );

  const reportButton = (
    <ReportButton
      title="Relatório de tarefas"
      filename="tarefas"
      build={() => ({
        highlights: [
          { label: "Total", value: String(tasks.length) },
          {
            label: "Concluídas",
            value: String(tasks.filter((t: any) => t.status === "concluida").length),
          },
          {
            label: "Em atraso",
            value: String(
              tasks.filter(
                (t: any) => t.status !== "concluida" && t.due_at && new Date(t.due_at) < new Date(),
              ).length,
            ),
          },
        ],
        headers: ["Tarefa", "Responsável", "Cliente", "Prazo", "Prioridade", "Situação"],
        rows: tasks.map((t: any) => [
          t.title,
          nameOf(t.assignee_id),
          customerName(t.customer_id),
          formatDateTime(t.due_at),
          t.priority,
          t.status,
        ]),
      })}
    />
  );

  const openTask = (task: any) => navigate({ to: "/tarefas/$id", params: { id: task.id } });

  return (
    <ResourcePage
      title="Tarefas"
      description="Organize follow-ups, cobranças e atividades internas."
      table="tasks"
      filter={filter}
      searchKeys={["title", "description"]}
      orderBy={{ column: "due_at", ascending: true }}
      emptyTitle="Nenhuma tarefa encontrada"
      emptyDescription="Ajuste os filtros ou crie uma nova tarefa para acompanhar prazos da equipe."
      createLabel="Nova solicitação"
      beforeSave={(v, context) =>
        context.editing
          ? v
          : {
              ...v,
              creator_id: userId,
              requested_by: userId,
              request_kind: "solicitacao",
              request_stage: "triagem",
            }
      }
      filterRow={filterRow}
      extraFilters={extraFilters}
      extraActions={
        <>
          {viewSwitch}
          {view === "calendario" && (
            <div className="flex flex-wrap items-center gap-2">
              {calendarStatus.data?.connected && (
                <span className="text-xs text-muted-foreground">
                  Conectado a {calendarStatus.data.connection?.google_email ?? "conta Google"}
                </span>
              )}
              <Button
                type="button"
                variant={calendarStatus.data?.connected ? "outline" : "default"}
                disabled={
                  calendarAction.isPending ||
                  calendarStatus.isLoading ||
                  calendarStatus.data?.configured === false
                }
                onClick={() => calendarAction.mutate()}
                title={calendarStatus.data?.connection?.google_email ?? undefined}
              >
                {calendarAction.isPending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <CalendarCheck className="mr-2 size-4" />
                )}
                {calendarStatus.data?.connected
                  ? "Sincronizar Google Calendar"
                  : "Conectar Google Calendar"}
              </Button>
              {calendarStatus.data?.connected && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    void disconnectGoogle()
                      .then(() => {
                        toast.success("Google Calendar desconectado.");
                        queryClient.invalidateQueries({ queryKey: ["google-calendar-status"] });
                      })
                      .catch((e: any) => toast.error(e?.message))
                  }
                >
                  Desconectar
                </Button>
              )}
            </div>
          )}
          {reportButton}
        </>
      }
      {...(view === "tabela"
        ? {}
        : {
            renderBody: (rows: any[]) =>
              view === "lista" ? (
                <TaskList
                  tasks={rows}
                  nameOf={nameOf}
                  customerName={customerName}
                  onOpen={openTask}
                />
              ) : (
                <TaskCalendar tasks={rows} onOpen={openTask} />
              ),
          })}
      columns={[
        {
          key: "title",
          label: "Tarefa",
          render: (r) => (
            <button
              type="button"
              className="text-left font-medium hover:underline"
              onClick={() => openTask(r)}
            >
              {r.title}
            </button>
          ),
        },
        {
          key: "request_category",
          label: "Tipo",
          render: (r) => r.request_category ?? (r.request_kind === "solicitacao" ? "Solicitação" : "Tarefa"),
        },
        { key: "assignee_id", label: "Responsável", render: (r) => nameOf(r.assignee_id) },
        { key: "customer_id", label: "Cliente", render: (r) => customerName(r.customer_id) },
        { key: "due_at", label: "Prazo", render: (r) => formatDateTime(r.due_at) },
        {
          key: "priority",
          label: "Prioridade",
          render: (r) => (
            <Badge variant={r.priority === "alta" ? "destructive" : "secondary"}>
              {r.priority ?? "media"}
            </Badge>
          ),
        },
        {
          key: "status",
          label: "Situação",
          render: (r) => (
            <Badge variant={r.status === "concluida" ? "default" : "secondary"}>
              {r.status ?? "pendente"}
            </Badge>
          ),
        },
      ]}
      fields={[
        { name: "title", label: "Título", required: true },
        {
          name: "request_category",
          label: "O que você precisa?",
          type: "select",
          required: true,
          options: [
            { value: "criativo", label: "Criativo" },
            { value: "video", label: "Vídeo" },
            { value: "landing_page", label: "Landing page" },
            { value: "campanha", label: "Campanha" },
            { value: "texto", label: "Texto ou conteúdo" },
            { value: "outro", label: "Outro" },
          ],
        },
        {
          name: "team_id",
          label: "Equipe solicitante",
          type: "select",
          help: "A solicitação será enviada primeiro ao responsável desta equipe.",
          options: requestTeams.map((team: any) => ({ value: team.id, label: team.name })),
        },
        {
          name: "customer_id",
          label: "Cliente",
          type: "select",
          options: customers.map((c: any) => ({ value: c.id, label: c.name })),
        },
        { name: "due_at", label: "Prazo", type: "date" },
        {
          name: "priority",
          label: "Prioridade",
          type: "select",
          defaultValue: "media",
          options: [
            { value: "baixa", label: "Baixa" },
            { value: "media", label: "Média" },
            { value: "alta", label: "Alta" },
          ],
        },
        {
          name: "status",
          label: "Situação",
          type: "select",
          defaultValue: "pendente",
          options: [
            { value: "pendente", label: "Pendente" },
            { value: "em_andamento", label: "Em andamento" },
            { value: "concluida", label: "Concluída" },
          ],
        },
        { name: "description", label: "Descrição", type: "textarea" },
      ]}
    />
  );
}
