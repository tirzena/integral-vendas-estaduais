import { EditMemberDialog } from "@/components/team/EditMemberDialog";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser, ROLE_LABELS, type AppRole } from "@/hooks/useAuth";
import { formatDate, formatMoney, initials } from "@/lib/format";
import { orderNumber } from "@/lib/sales";
import { useRates } from "@/hooks/useRates";
import { PageHeader } from "@/components/common/PageHeader";
import { CurrencyValues } from "@/components/common/CurrencyValues";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Crown, Handshake, MessageCircle, Send, User, UserMinus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/equipe/$id")({
  head: () => ({
    meta: [
      { title: "Equipe — OS" },
      { name: "description", content: "Membros, gerente e assistentes da equipe." },
      { property: "og:title", content: "Equipe — OS" },
      { property: "og:description", content: "Detalhes e vínculos da equipe." },
    ],
  }),
  component: TeamDetail,
});

function TeamDetail() {
  const { id } = Route.useParams();
  const { isAdmin, userId } = useCurrentUser();
  const { convert } = useRates();
  const queryClient = useQueryClient();
  const [chatText, setChatText] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["team-detail", id],
    queryFn: async () => {
      const [{ data: team }, { data: members }, { data: people }] = await Promise.all([
        supabase.from("teams").select("*").eq("id", id).maybeSingle(),
        supabase.from("team_members").select("id,user_id").eq("team_id", id),
        supabase
          .from("profiles")
          .select("id,full_name,email,avatar_url,cargo,setor,last_access,is_demo")
          .order("full_name"),
      ]);
      const memberIds = Array.from(
        new Set([...(members ?? []).map((m: any) => m.user_id), team?.manager_id].filter(Boolean)),
      );
      const [{ data: orders }, { data: customers }, { data: leads }, { data: conversation }] =
        await Promise.all([
          memberIds.length
            ? (supabase as any)
                .from("orders")
                .select(
                  "id,number,revision_no,seller_id,status,workflow_stage,total,currency,created_at,order_date,shipping_address,shipping_city,shipping_state",
                )
                .in("seller_id", memberIds)
                .is("deleted_at", null)
                .is("superseded_at", null)
            : Promise.resolve({ data: [] }),
          memberIds.length
            ? supabase.from("customers").select("id,created_by").in("created_by", memberIds)
            : Promise.resolve({ data: [] }),
          memberIds.length
            ? (supabase as any)
                .from("contact_leads")
                .select("id,assigned_to")
                .in("assigned_to", memberIds)
            : Promise.resolve({ data: [] }),
          (supabase as any)
            .from("internal_conversations")
            .select("id,name")
            .eq("team_id", id)
            .eq("is_auto", true)
            .maybeSingle(),
        ]);
      let messages: any[] = [];
      if (conversation?.id) {
        const { data: rows } = await supabase
          .from("internal_messages")
          .select("id,body,sender_id,created_at,deleted_at")
          .eq("conversation_id", conversation.id)
          .order("created_at")
          .limit(100);
        messages = rows ?? [];
      }
      return {
        team,
        members: members ?? [],
        people: people ?? [],
        orders: orders ?? [],
        customers: customers ?? [],
        leads: leads ?? [],
        conversation,
        messages,
      };
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  const team = data?.team;
  if (!team) return <MemberDetail id={id} />;

  const people = data?.people ?? [];
  const managerId = team.manager_id;
  const personOf = (uid: string) => people.find((p: any) => p.id === uid);
  const memberIds = Array.from(
    new Set([...(data?.members ?? []).map((m: any) => m.user_id), managerId].filter(Boolean)),
  );
  const canViewTeam = isAdmin || team.manager_id === userId || memberIds.includes(userId ?? "");
  if (!canViewTeam) {
    return (
      <div>
        <PageHeader
          title="Equipe restrita"
          description="Você só pode abrir as equipes das quais participa."
        />
        <Button asChild variant="outline">
          <Link to="/equipe">
            <ArrowLeft className="mr-2 size-4" /> Voltar
          </Link>
        </Button>
      </div>
    );
  }
  const manager = team.manager_id ? personOf(team.manager_id) : null;
  const assistants = memberIds
    .filter((uid) => uid !== team.manager_id)
    .map(personOf)
    .filter((p: any) => p && /assistente|auxiliar/i.test(p.cargo ?? ""));
  const others = memberIds
    .filter((uid) => uid !== team.manager_id)
    .map(personOf)
    .filter((p: any) => p && !/assistente|auxiliar/i.test(p.cargo ?? ""));
  const notLinked = people.filter((p: any) => !memberIds.includes(p.id));
  const sellerMetrics = memberIds.map((uid) => {
    const sellerOrders = (data?.orders ?? []).filter((order: any) => order.seller_id === uid);
    const cancelled = sellerOrders.filter((order: any) => order.status === "cancelado");
    const sales = sellerOrders.filter(
      (order: any) =>
        order.status !== "cancelado" &&
        (order.workflow_stage === "vendido" ||
          ["faturado", "enviado", "entregue", "pago"].includes(order.status)),
    );
    const revenue = sales.reduce((sum: number, order: any) => {
      return sum + (convert(Number(order.total ?? 0), order.currency ?? "BRL", "BRL") ?? 0);
    }, 0);
    const contacts =
      (data?.customers ?? []).filter((row: any) => row.created_by === uid).length +
      (data?.leads ?? []).filter((row: any) => row.assigned_to === uid).length;
    return {
      uid,
      person: personOf(uid),
      orders: sellerOrders.length,
      sales: sales.length,
      cancelled: cancelled.length,
      revenue,
      contacts,
    };
  });
  const teamTotals = sellerMetrics.reduce(
    (acc, row) => ({
      orders: acc.orders + row.orders,
      sales: acc.sales + row.sales,
      cancelled: acc.cancelled + row.cancelled,
      revenue: acc.revenue + row.revenue,
      contacts: acc.contacts + row.contacts,
    }),
    { orders: 0, sales: 0, cancelled: 0, revenue: 0, contacts: 0 },
  );

  async function sendTeamMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!chatText.trim() || !data?.conversation?.id || !userId) return;
    const body = chatText.trim();
    setChatText("");
    const { error } = await supabase.from("internal_messages").insert({
      conversation_id: data.conversation.id,
      sender_id: userId,
      body,
    });
    if (error) {
      setChatText(body);
      toast.error("Não foi possível enviar a mensagem.");
      return;
    }
    await (supabase as any)
      .from("internal_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", data.conversation.id);
    queryClient.invalidateQueries({ queryKey: ["team-detail", id] });
  }

  async function setManager(uid: string | null) {
    const { error } = await supabase.from("teams").update({ manager_id: uid }).eq("id", id);
    if (error) toast.error("Não foi possível definir o gerente.");
    else {
      toast.success("Gerente atualizado.");
      queryClient.invalidateQueries({ queryKey: ["team-detail", id] });
      queryClient.invalidateQueries({ queryKey: ["teams-with-members"] });
      queryClient.invalidateQueries({ queryKey: ["championship-teams"] });
      queryClient.invalidateQueries({ queryKey: ["member-detail"] });
    }
  }

  async function setClientVisibility(enabled: boolean) {
    const { error } = await (supabase as any).rpc("set_team_client_visibility", {
      _team_id: id,
      _enabled: enabled,
    });
    if (error) toast.error(error.message ?? "Não foi possível alterar a permissão.");
    else {
      toast.success(
        enabled
          ? "Clientes da equipe liberados aos vendedores."
          : "Clientes da equipe restritos novamente.",
      );
      queryClient.invalidateQueries({ queryKey: ["team-detail", id] });
    }
  }

  async function linkMember(uid: string) {
    const { error } = await supabase.from("team_members").insert({ team_id: id, user_id: uid });
    if (error) toast.error("Não foi possível vincular o membro.");
    else queryClient.invalidateQueries({ queryKey: ["team-detail", id] });
  }

  async function unlinkMember(uid: string) {
    await supabase.from("team_members").delete().eq("team_id", id).eq("user_id", uid);
    if (managerId === uid) await supabase.from("teams").update({ manager_id: null }).eq("id", id);
    toast.success("Membro removido da equipe.");
    queryClient.invalidateQueries({ queryKey: ["team-detail", id] });
    queryClient.invalidateQueries({ queryKey: ["teams-with-members"] });
    queryClient.invalidateQueries({ queryKey: ["championship-teams"] });
    queryClient.invalidateQueries({ queryKey: ["member-detail"] });
  }

  function PersonRow({ p, icon: Icon, roleLabel }: { p: any; icon: any; roleLabel: string }) {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 pt-6">
          <Avatar className="size-11">
            <AvatarImage src={p.avatar_url ?? undefined} />
            <AvatarFallback>{initials(p.full_name ?? p.email)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 truncate font-medium">
              <Icon className="size-4 text-muted-foreground" />
              <Link className="hover:underline" to="/equipe/$id" params={{ id: p.id }}>
                {p.full_name || p.email}
              </Link>
              <Badge variant="secondary" className="font-normal">
                {roleLabel}
              </Badge>
              {p.is_demo && <Badge variant="outline">Fictício</Badge>}
            </p>
            <p className="truncate text-sm text-muted-foreground">
              {p.email} · {p.cargo || "sem cargo"} · {p.setor || "sem setor"} · último acesso{" "}
              {formatDate(p.last_access)}
            </p>
          </div>
          {isAdmin && (
            <Button
              variant="outline"
              size="icon"
              className="text-destructive"
              title="Remover da equipe"
              onClick={() => unlinkMember(p.id)}
            >
              <UserMinus className="size-4" />
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={team.name}
        description={team.description || "Equipe comercial."}
        actions={
          <Button asChild variant="outline">
            <Link to="/equipe">
              <ArrowLeft className="mr-2 size-4" /> Voltar
            </Link>
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Pedidos", teamTotals.orders],
          ["Vendas", teamTotals.sales],
          ["Contatos", teamTotals.contacts],
          ["Cancelados", teamTotals.cancelled],
          ["Valor vendido", <CurrencyValues value={teamTotals.revenue} currency="BRL" />],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-xl font-semibold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {(isAdmin || managerId === userId) && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
            <div>
              <p className="font-medium">Compartilhar clientes entre vendedores</p>
              <p className="text-sm text-muted-foreground">
                Quando ativo, cada vendedor desta equipe vê os próprios clientes e os clientes dos
                colegas da mesma equipe.
              </p>
            </div>
            <Switch
              checked={Boolean(team.sellers_can_view_team_clients)}
              onCheckedChange={(checked) => void setClientVisibility(checked)}
              aria-label="Permitir que vendedores vejam clientes da equipe"
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Resultado por vendedor</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-[1.5fr_repeat(5,1fr)] gap-3 border-b pb-2 text-xs font-medium text-muted-foreground">
              <span>Vendedor</span>
              <span>Contatos</span>
              <span>Pedidos</span>
              <span>Vendas</span>
              <span>Cancelados</span>
              <span>Valor</span>
            </div>
            {sellerMetrics.map((row) => (
              <div
                key={row.uid}
                className="grid grid-cols-[1.5fr_repeat(5,1fr)] gap-3 border-b py-3 text-sm last:border-0"
              >
                <span className="font-medium">
                  <Link className="hover:underline" to="/equipe/$id" params={{ id: row.uid }}>
                    {row.person?.full_name || row.person?.email || "Membro"}
                  </Link>
                </span>
                <span>{row.contacts}</span>
                <span>{row.orders}</span>
                <span>{row.sales}</span>
                <span>{row.cancelled}</span>
                <CurrencyValues value={row.revenue} currency="BRL" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <EntityOrders orders={data?.orders ?? []} title="Pedidos da equipe" />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="size-5" /> Chat da equipe
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-3 max-h-72 space-y-2 overflow-y-auto rounded-lg border bg-muted/20 p-3">
            {(data?.messages ?? []).map((message: any) => (
              <div key={message.id} className="rounded-lg bg-background p-2 shadow-sm">
                <p className="text-xs font-medium">
                  {personOf(message.sender_id)?.full_name ?? "Membro"}
                </p>
                <p className="text-sm">{message.deleted_at ? "Mensagem apagada" : message.body}</p>
                <p className="text-[11px] text-muted-foreground">
                  {formatDate(message.created_at)}
                </p>
              </div>
            ))}
            {(data?.messages ?? []).length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma mensagem no grupo da equipe.
              </p>
            )}
          </div>
          <form className="flex gap-2" onSubmit={sendTeamMessage}>
            <Input
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              placeholder="Mensagem para a equipe…"
            />
            <Button type="submit" disabled={!chatText.trim() || !data?.conversation?.id}>
              <Send className="mr-2 size-4" /> Enviar
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Crown className="size-4 text-muted-foreground" /> Gerente da equipe
          </h2>
          {isAdmin && (
            <Select
              value={team.manager_id ?? "none"}
              onValueChange={(v) => setManager(v === "none" ? null : v)}
            >
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Definir gerente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem gerente</SelectItem>
                {memberIds.map((uid) => {
                  const p = personOf(uid);
                  if (!p) return null;
                  return (
                    <SelectItem key={uid} value={uid}>
                      {p.full_name || p.email}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          )}
        </div>
        {manager ? (
          <PersonRow p={manager} icon={Crown} roleLabel="Gerente" />
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum gerente definido.</p>
        )}
      </div>

      <div className="grid gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Handshake className="size-4 text-muted-foreground" /> Assistentes
        </h2>
        {assistants.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum assistente. O sistema reconhece como assistente quem tem "assistente" no cargo.
          </p>
        ) : (
          assistants.map((p: any) => (
            <PersonRow key={p.id} p={p} icon={Handshake} roleLabel="Assistente" />
          ))
        )}
      </div>

      <div className="grid gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <User className="size-4 text-muted-foreground" /> Demais membros
        </h2>
        {others.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum outro membro vinculado.</p>
        ) : (
          others.map((p: any) => <PersonRow key={p.id} p={p} icon={User} roleLabel="Membro" />)
        )}
      </div>

      {isAdmin && notLinked.length > 0 && (
        <div className="grid gap-2">
          <h2 className="text-lg font-semibold">Vincular pessoas</h2>
          <p className="text-sm text-muted-foreground">
            Pessoas ainda sem vínculo nesta equipe — clique para adicionar.
          </p>
          <div className="flex flex-wrap gap-2">
            {notLinked.map((p: any) => (
              <Button key={p.id} variant="outline" size="sm" onClick={() => linkMember(p.id)}>
                {p.full_name || p.email}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MemberDetail({ id }: { id: string }) {
  const { isAdmin, userId } = useCurrentUser();
  const [editing, setEditing] = useState(false);
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["member-detail", id, userId, isAdmin],
    queryFn: async () => {
      const [profile, teams, links, roles, assignments, jobs, levels, areas] = await Promise.all([
        supabase
          .from("profiles")
          .select("id,full_name,email,phone,avatar_url,cargo,setor,is_active,last_access")
          .eq("id", id)
          .maybeSingle(),
        supabase.from("teams").select("id,name,manager_id"),
        supabase.from("team_members").select("team_id,user_id"),
        supabase.from("user_roles").select("role").eq("user_id", id),
        (supabase as any).from("member_job_assignments").select("*").eq("user_id", id),
        (supabase as any).from("job_roles").select("id,name,area_id"),
        (supabase as any).from("job_levels").select("id,name"),
        (supabase as any).from("organization_areas").select("id,name"),
      ]);
      for (const result of [profile, teams, links, roles, assignments, jobs, levels, areas])
        if (result.error) throw result.error;
      const memberTeams = (teams.data ?? []).filter(
        (team: any) =>
          team.manager_id === id ||
          (links.data ?? []).some((link: any) => link.team_id === team.id && link.user_id === id),
      );
      const allowed =
        isAdmin ||
        userId === id ||
        memberTeams.some(
          (team: any) =>
            team.manager_id === userId ||
            (links.data ?? []).some(
              (link: any) => link.team_id === team.id && link.user_id === userId,
            ),
        );
      if (!allowed)
        return { allowed: false, profile: null, teams: [], roles: [], jobs: [], orders: [] };
      const orders = await (supabase as any)
        .from("orders")
        .select(
          "id,number,revision_no,seller_id,status,workflow_stage,total,currency,created_at,order_date,shipping_address,shipping_city,shipping_state",
        )
        .eq("seller_id", id)
        .is("deleted_at", null)
        .is("superseded_at", null)
        .order("number", { ascending: true })
        .order("revision_no", { ascending: true });
      if (orders.error) throw orders.error;
      return {
        allowed: true,
        assignments: assignments.data ?? [],
        jobRoles: jobs.data ?? [],
        levels: levels.data ?? [],
        areas: areas.data ?? [],
        profile: profile.data,
        teams: memberTeams,
        roles: roles.data ?? [],
        orders: orders.data ?? [],
        jobs: (assignments.data ?? [])
          .filter(
            (assignment: any) =>
              assignment.status === "ativo" &&
              (!assignment.end_date ||
                assignment.end_date >= new Date().toISOString().slice(0, 10)),
          )
          .map((assignment: any) => ({
            id: assignment.id,
            name: jobs.data?.find((job: any) => job.id === assignment.job_role_id)?.name ?? "Cargo",
            level: levels.data?.find((level: any) => level.id === assignment.job_level_id)?.name,
          })),
      };
    },
  });
  const back = (
    <Button asChild variant="outline">
      <Link to="/equipe">
        <ArrowLeft className="mr-2 size-4" />
        Voltar para Membros
      </Link>
    </Button>
  );
  if (query.isLoading) return <p>Carregando membro…</p>;
  if (query.error)
    return (
      <div className="space-y-4">
        <p role="alert">Não foi possível carregar os dados do membro.</p>
        {back}
      </div>
    );
  const data = query.data;
  if (!data?.profile)
    return (
      <div className="space-y-4">
        <PageHeader
          title={data?.allowed === false ? "Membro restrito" : "Membro não encontrado"}
          description="Você pode abrir seu perfil e os membros das suas equipes. Administradores têm acesso geral."
        />
        {back}
      </div>
    );
  const person = data.profile;
  return (
    <div className="space-y-6">
      <PageHeader
        title={person.full_name || "Membro"}
        description={person.email || "Perfil do membro"}
        actions={
          <div className="flex gap-2">
            {back}
            {isAdmin && <Button onClick={() => setEditing(true)}>Editar membro e cargos</Button>}
          </div>
        }
      />
      {isAdmin && (
        <EditMemberDialog
          member={editing ? person : null}
          assignments={data.assignments ?? []}
          jobRoles={data.jobRoles ?? []}
          levels={data.levels ?? []}
          areas={data.areas ?? []}
          onClose={() => setEditing(false)}
          onSaved={() => {
            void qc.invalidateQueries();
          }}
        />
      )}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center gap-3">
            <Avatar>
              <AvatarImage src={person.avatar_url ?? undefined} />
              <AvatarFallback>{initials(person.full_name)}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">{person.is_active ? "Ativo" : "Inativo"}</p>
              <p className="text-sm text-muted-foreground">
                Último acesso: {formatDate(person.last_access)}
              </p>
            </div>
          </div>
          <div>
            <h2 className="font-semibold">Nível de acesso</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {data.roles.length ? (
                data.roles.map((role: any) => (
                  <Badge key={role.role}>{ROLE_LABELS[role.role as AppRole] ?? role.role}</Badge>
                ))
              ) : (
                <span>Sem perfil de acesso cadastrado</span>
              )}
            </div>
          </div>
          <div>
            <h2 className="font-semibold">Cargos e níveis organizacionais</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {data.jobs.length ? (
                data.jobs.map((job: any) => (
                  <Badge key={job.id} variant="secondary">
                    {job.name}
                    {job.level ? ` · ${job.level}` : ""}
                  </Badge>
                ))
              ) : (
                <span>{person.cargo || "Sem cargo cadastrado"}</span>
              )}
            </div>
            {person.setor && <p className="mt-2 text-sm">Setor: {person.setor}</p>}
          </div>
          <div>
            <h2 className="font-semibold">Equipes</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {data.teams.length ? (
                data.teams.map((team: any) => (
                  <Button key={team.id} asChild variant="outline">
                    <Link to="/equipe/$id" params={{ id: team.id }}>
                      {team.name}
                      {team.manager_id === id ? " · Gerente" : ""}
                    </Link>
                  </Button>
                ))
              ) : (
                <span>Sem equipe vinculada</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      <EntityOrders orders={data.orders} title="Pedidos do membro" />
    </div>
  );
}

function EntityOrders({ orders, title }: { orders: any[]; title: string }) {
  const itemsQuery = useQuery({
    queryKey: ["entity-order-items", orders.map((order) => order.id)],
    enabled: orders.length > 0,
    queryFn: async () => {
      const items: any[] = [];
      for (let offset = 0; offset < orders.length; offset += 100) {
        const result = await supabase
          .from("order_items")
          .select("id,order_id,description,quantity,unit_price")
          .in(
            "order_id",
            orders.slice(offset, offset + 100).map((order) => order.id),
          );
        if (result.error) throw result.error;
        items.push(...(result.data ?? []));
      }
      return items;
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {title} ({orders.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!orders.length && <p className="text-muted-foreground">Nenhum pedido registrado.</p>}
        {itemsQuery.error && <p role="alert">Não foi possível carregar os itens dos pedidos.</p>}
        {[...orders]
          .sort(
            (a, b) =>
              String(b.order_date ?? b.created_at).localeCompare(
                String(a.order_date ?? a.created_at),
              ) || Number(b.number) - Number(a.number),
          )
          .map((order) => (
            <details key={order.id} className="rounded-lg border p-4">
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3">
                <span className="font-medium">
                  Pedido {orderNumber(order.number, order.revision_no)} ·{" "}
                  {formatDate(order.order_date ?? order.created_at)} ·{" "}
                  {order.workflow_stage?.replaceAll("_", " ") ?? order.status}
                </span>
                <CurrencyValues value={Number(order.total)} currency={order.currency} />
              </summary>
              <div className="mt-4 space-y-3 border-t pt-3">
                <p className="text-sm">
                  {[order.shipping_address, order.shipping_city, order.shipping_state]
                    .filter(Boolean)
                    .join(" · ") || "Endereço não informado"}
                </p>
                {itemsQuery.isLoading ? (
                  <p>Carregando itens…</p>
                ) : (
                  (itemsQuery.data ?? [])
                    .filter((item) => item.order_id === order.id)
                    .map((item) => (
                      <div key={item.id} className="flex flex-wrap justify-between gap-2 text-sm">
                        <span>
                          {item.description} · {item.quantity} unidade(s)
                        </span>
                        <div>
                          Preço unitário
                          <CurrencyValues
                            value={Number(item.unit_price)}
                            currency={order.currency}
                          />
                        </div>
                      </div>
                    ))
                )}
              </div>
            </details>
          ))}
      </CardContent>
    </Card>
  );
}
