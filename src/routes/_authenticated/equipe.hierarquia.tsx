/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  ArrowDown,
  BriefcaseBusiness,
  CircleUserRound,
  Clock3,
  GitBranch,
  GripVertical,
  History,
  LayoutGrid,
  List,
  Maximize2,
  Minus,
  Network,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  UserRoundX,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { RouteGuard } from "@/components/common/RouteGuard";
import { PageHeader } from "@/components/common/PageHeader";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatDate, initials } from "@/lib/format";
import {
  HierarchySummary,
  OCCUPANCY_OPTIONS,
  RECOMMENDATION_OPTIONS,
  RecommendationsView,
  TRIGGER_METRICS,
  approvedVacancies,
  derivedOccupancy,
  occupancyLabel,
  recommendationLabel,
  roleInsight,
  statusClasses,
} from "@/components/hierarchy/HierarchyPlanning";

const db = supabase as any;
const ORGANIZATION_PALETTE = ["#24c982", "#8eae8a", "#a79a7f", "#c77e83", "#f22d63"];

function areaAccent(area: any) {
  const saved = String(area?.color ?? "").toLowerCase();
  if (ORGANIZATION_PALETTE.includes(saved)) return saved;
  const seed = String(area?.system_key ?? area?.name ?? "area");
  const index = [...seed].reduce((total, character) => total + character.charCodeAt(0), 0);
  return ORGANIZATION_PALETTE[index % ORGANIZATION_PALETTE.length];
}

export const Route = createFileRoute("/_authenticated/equipe/hierarquia")({
  head: () => ({
    meta: [
      { title: "Hierarquia organizacional — OS" },
      {
        name: "description",
        content: "Organograma dinâmico vinculado aos cargos, áreas, equipes e membros do OS.",
      },
    ],
  }),
  component: () => (
    <RouteGuard capability="manage_team">
      <HierarchyPage />
    </RouteGuard>
  ),
});

type ViewMode = "chart" | "departments" | "teams" | "roles" | "people";
type ChartScope =
  | "overview"
  | "simple"
  | "governance"
  | "commercial"
  | "operations"
  | "marketing-tech"
  | "administration"
  | "recommendations";

const CHART_SCOPES: Array<{
  value: ChartScope;
  label: string;
  areaKeys?: string[];
}> = [
  { value: "overview", label: "Visão geral" },
  { value: "simple", label: "Cadeia atual" },
  { value: "recommendations", label: "Recomendações" },
  { value: "governance", label: "Governança", areaKeys: ["diretoria", "juridico"] },
  { value: "commercial", label: "Comercial", areaKeys: ["vendas"] },
  {
    value: "operations",
    label: "Operações",
    areaKeys: ["operacoes", "estoque", "entregas", "fornecedores", "gerencia"],
  },
  {
    value: "marketing-tech",
    label: "Marketing e TI",
    areaKeys: ["marketing", "criacao", "tecnologia"],
  },
  {
    value: "administration",
    label: "Administração",
    areaKeys: ["financeiro", "contabilidade", "rh"],
  },
];

const ORG_TIER_OPTIONS = [
  ["fundador", "Fundador"],
  ["conselho", "Conselho de sócios"],
  ["socio", "Cargos societários"],
  ["diretor_geral", "Direção geral"],
  ["diretor", "Diretorias"],
  ["gestor_executivo", "Gestão executiva"],
  ["gestor", "Gestores"],
  ["gerente_geral", "Gerência geral"],
  ["gerente", "Gerentes"],
  ["supervisor_geral", "Supervisão geral"],
  ["supervisor", "Supervisores"],
  ["analista_geral", "Análise geral"],
  ["analista", "Analistas"],
  ["assistente_geral", "Assistência geral"],
  ["assistente", "Assistentes"],
  ["cargo", "Cargos e especialistas"],
] as const;
const ORG_TIER_ORDER = ORG_TIER_OPTIONS.map(([value]) => value);
const ORG_TIER_LABELS = Object.fromEntries(ORG_TIER_OPTIONS) as Record<string, string>;

function organizationTier(role: any) {
  if (role.organization_tier) return role.organization_tier;
  const key = String(role.system_key ?? "");
  const name = String(role.name ?? "").toLowerCase();
  if (key === "fundador") return "fundador";
  if (key.includes("conselho")) return "conselho";
  if (key.startsWith("socio_")) return "socio";
  if (key === "diretor_geral") return "diretor_geral";
  if (key.startsWith("diretor_") || name.startsWith("diretor ")) return "diretor";
  if (key === "gestor_executivo") return "gestor_executivo";
  if (key.startsWith("gestor_") || name.startsWith("gestor ")) return "gestor";
  if (key === "gerente_geral") return "gerente_geral";
  if (key.startsWith("gerente") || name.startsWith("gerente ")) return "gerente";
  if (key === "supervisor_geral") return "supervisor_geral";
  if (key.startsWith("supervisor") || name.startsWith("supervisor ")) return "supervisor";
  if (key === "analista_geral") return "analista_geral";
  if (key.startsWith("analista") || name.startsWith("analista ")) return "analista";
  if (key === "assistente_geral") return "assistente_geral";
  if (key.startsWith("assistente") || name.startsWith("assistente")) return "assistente";
  return "cargo";
}

function HierarchyPage() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<ViewMode>("chart");
  const [chartScope, setChartScope] = useState<ChartScope>("overview");
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState("all");
  const [occupancyFilter, setOccupancyFilter] = useState("all");
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const query = useQuery({
    queryKey: ["company-hierarchy"],
    queryFn: async () => {
      const [
        areas,
        roles,
        levels,
        assignments,
        profiles,
        teams,
        teamMembers,
        history,
        triggerRules,
      ] = await Promise.all([
        db.from("organization_areas").select("*").order("sort_order").order("name"),
        db.from("job_roles").select("*").order("hierarchical_rank"),
        db.from("job_levels").select("*").order("rank"),
        db.from("member_job_assignments").select("*").is("end_date", null),
        db.from("profiles").select("*").order("full_name"),
        db.from("teams").select("*").order("name"),
        db.from("team_members").select("*"),
        db
          .from("organization_history")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100),
        db.from("organization_hierarchy_trigger_rules").select("*").order("priority"),
      ]);
      for (const result of [
        areas,
        roles,
        levels,
        assignments,
        profiles,
        teams,
        teamMembers,
        triggerRules,
      ]) {
        if (result.error) throw result.error;
      }
      return {
        areas: areas.data ?? [],
        roles: roles.data ?? [],
        levels: levels.data ?? [],
        assignments: assignments.data ?? [],
        profiles: profiles.data ?? [],
        teams: teams.data ?? [],
        teamMembers: teamMembers.data ?? [],
        history: history.error ? [] : (history.data ?? []),
        triggerRules: triggerRules.data ?? [],
      };
    },
  });

  const data = query.data;
  const profilesById = useMemo(
    () => new Map((data?.profiles ?? []).map((profile: any) => [profile.id, profile])),
    [data?.profiles],
  );
  const areasById = useMemo(
    () => new Map((data?.areas ?? []).map((area: any) => [area.id, area])),
    [data?.areas],
  );
  const assignmentsByRole = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const assignment of data?.assignments ?? []) {
      const profile = profilesById.get(assignment.user_id);
      if (!profile?.is_active || assignment.status === "inativo") continue;
      map.set(assignment.job_role_id, [
        ...(map.get(assignment.job_role_id) ?? []),
        { ...assignment, profile },
      ]);
    }
    return map;
  }, [data?.assignments, profilesById]);

  const roles = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return (data?.roles ?? []).filter((role: any) => {
      const occupants = assignmentsByRole.get(role.id) ?? [];
      const area = areasById.get(role.area_id);
      const vacancy = approvedVacancies(role, occupants.length) > 0;
      const matchesSearch =
        !term ||
        role.name.toLocaleLowerCase("pt-BR").includes(term) ||
        area?.name.toLocaleLowerCase("pt-BR").includes(term) ||
        occupants.some((item: any) =>
          item.profile.full_name.toLocaleLowerCase("pt-BR").includes(term),
        );
      const matchesArea = areaFilter === "all" || role.area_id === areaFilter;
      const matchesOccupancy =
        occupancyFilter === "all" || (occupancyFilter === "vacant" ? vacancy : !vacancy);
      return matchesSearch && matchesArea && matchesOccupancy;
    });
  }, [areaFilter, areasById, assignmentsByRole, data?.roles, occupancyFilter, search]);

  const chartRoles = useMemo(() => {
    const scope = CHART_SCOPES.find((item) => item.value === chartScope);
    if (chartScope === "overview" || chartScope === "recommendations") return roles;
    if (chartScope === "simple") {
      const included = new Set(
        roles
          .filter((role: any) => {
            const occupants = assignmentsByRole.get(role.id)?.length ?? 0;
            return occupants > 0 || role.occupancy_status === "vago_aprovado";
          })
          .map((role: any) => role.id),
      );
      let changed = true;
      while (changed) {
        changed = false;
        for (const role of roles) {
          if (
            included.has(role.id) &&
            role.reports_to_role_id &&
            !included.has(role.reports_to_role_id)
          ) {
            included.add(role.reports_to_role_id);
            changed = true;
          }
        }
      }
      return roles.filter((role: any) => included.has(role.id));
    }
    const individualRoles = roles.filter((role: any) => organizationTier(role) !== "conselho");
    if (!scope?.areaKeys) return individualRoles;
    const areaIds = new Set(
      (data?.areas ?? [])
        .filter((area: any) => scope.areaKeys!.includes(String(area.system_key)))
        .map((area: any) => area.id),
    );
    return individualRoles.filter((role: any) => areaIds.has(role.area_id));
  }, [assignmentsByRole, chartScope, data?.areas, roles]);

  const selectedRole = data?.roles.find((role: any) => role.id === selectedRoleId) ?? null;

  return (
    <div className="min-w-0">
      <PageHeader
        title="Membros"
        description="Perfis de acesso, equipes, cargos e hierarquia da empresa."
        actions={
          <>
            <Button variant="outline" onClick={() => setHistoryOpen(true)}>
              <History className="mr-2 size-4" /> Histórico
            </Button>
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-2 size-4" /> Editar estrutura
            </Button>
            <Button asChild>
              <Link to="/equipe">
                <Plus className="mr-2 size-4" /> Adicionar membro
              </Link>
            </Button>
          </>
        }
      />

      <Tabs value="hierarquia">
        <TabsList className="h-auto w-full justify-start overflow-x-auto p-1 sm:w-auto">
          <TabsTrigger value="pessoas" asChild>
            <Link to="/equipe" search={{ tab: "pessoas" }}>
              Pessoas
            </Link>
          </TabsTrigger>
          <TabsTrigger value="equipes" asChild>
            <Link to="/equipe" search={{ tab: "equipes" }}>
              Equipes
            </Link>
          </TabsTrigger>
          <TabsTrigger value="cargos" asChild>
            <Link to="/equipe" search={{ tab: "cargos" }}>
              Cargos e permissões
            </Link>
          </TabsTrigger>
          <TabsTrigger value="hierarquia">Hierarquia</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mb-4 mt-6">
        <h2 className="text-xl font-semibold tracking-tight">Hierarquia organizacional</h2>
        <p className="text-sm text-muted-foreground">
          Visão geral da empresa com áreas, equipes, cargos, níveis, relações de liderança e membros
          do OS.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline" className="gap-1.5">
          <Building2 className="size-3" /> Empresa OS
        </Badge>
        <Badge variant="outline">Unidade Matriz</Badge>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => queryClient.invalidateQueries({ queryKey: ["company-hierarchy"] })}
        >
          <RefreshCw className={cn("mr-2 size-3.5", query.isFetching && "animate-spin")} />{" "}
          Atualizar
        </Button>
      </div>

      {data && <HierarchySummary data={data} assignmentsByRole={assignmentsByRole} />}

      <Card className="mb-5">
        <CardContent className="grid gap-3 p-3 md:grid-cols-[minmax(220px,1fr)_220px_180px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar pessoa, cargo, área ou equipe"
              className="pl-9"
            />
          </div>
          <Select value={areaFilter} onValueChange={setAreaFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Área" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as áreas</SelectItem>
              {data?.areas.map((area: any) => (
                <SelectItem key={area.id} value={area.id}>
                  {area.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={occupancyFilter} onValueChange={setOccupancyFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Ocupação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Ocupados e vagos</SelectItem>
              <SelectItem value="occupied">Ocupados</SelectItem>
              <SelectItem value="vacant">Com vagas</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {query.isLoading ? (
        <div className="rounded-xl border p-10 text-center text-sm text-muted-foreground">
          Carregando hierarquia…
        </div>
      ) : query.error ? (
        <div className="rounded-xl border border-destructive/30 p-6 text-sm text-destructive">
          Não foi possível carregar a estrutura.
        </div>
      ) : (
        <Tabs value={view} onValueChange={(value) => setView(value as ViewMode)}>
          <TabsList className="mb-4 h-auto w-full justify-start overflow-x-auto p-1">
            <TabsTrigger value="chart">
              <Network className="mr-2 size-4" /> Organograma
            </TabsTrigger>
            <TabsTrigger value="departments">
              <LayoutGrid className="mr-2 size-4" /> Áreas
            </TabsTrigger>
            <TabsTrigger value="teams">
              <UsersRound className="mr-2 size-4" /> Equipes
            </TabsTrigger>
            <TabsTrigger value="roles">
              <BriefcaseBusiness className="mr-2 size-4" /> Cargos
            </TabsTrigger>
            <TabsTrigger value="people">
              <List className="mr-2 size-4" /> Lista
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chart">
            <Tabs value={chartScope} onValueChange={(value) => setChartScope(value as ChartScope)}>
              <TabsList className="mb-4 h-auto w-full justify-start overflow-x-auto rounded-xl bg-muted/65 p-1">
                {CHART_SCOPES.map((scope) => (
                  <TabsTrigger
                    key={scope.value}
                    value={scope.value}
                    className="whitespace-nowrap px-4"
                  >
                    {scope.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="overview" className="mt-0">
                <OrganizationTreeChart
                  roles={chartRoles}
                  allRoles={data!.roles}
                  areas={data!.areas}
                  assignmentsByRole={assignmentsByRole}
                  triggerRules={data!.triggerRules}
                  onSelect={setSelectedRoleId}
                />
              </TabsContent>
              <TabsContent value="recommendations" className="mt-0">
                <RecommendationsView
                  data={data!}
                  assignmentsByRole={assignmentsByRole}
                  onSelect={setSelectedRoleId}
                  onRefresh={() =>
                    queryClient.invalidateQueries({ queryKey: ["company-hierarchy"] })
                  }
                />
              </TabsContent>
              {CHART_SCOPES.filter(
                (scope) => !["overview", "recommendations"].includes(scope.value),
              ).map((scope) => (
                <TabsContent key={scope.value} value={scope.value} className="mt-0">
                  <OrganizationChart
                    roles={chartRoles}
                    allRoles={data!.roles}
                    areas={data!.areas}
                    assignmentsByRole={assignmentsByRole}
                    triggerRules={data!.triggerRules}
                    onSelect={setSelectedRoleId}
                  />
                </TabsContent>
              ))}
            </Tabs>
          </TabsContent>
          <TabsContent value="departments">
            <DepartmentView
              data={data!}
              assignmentsByRole={assignmentsByRole}
              onSelect={setSelectedAreaId}
            />
          </TabsContent>
          <TabsContent value="teams">
            <TeamView data={data!} />
          </TabsContent>
          <TabsContent value="roles">
            <RoleList
              roles={roles}
              allRoles={data!.roles}
              areas={data!.areas}
              assignmentsByRole={assignmentsByRole}
              onSelect={setSelectedRoleId}
            />
          </TabsContent>
          <TabsContent value="people">
            <PeopleList data={data!} />
          </TabsContent>
        </Tabs>
      )}

      <RoleDetails
        role={selectedRole}
        data={data}
        assignmentsByRole={assignmentsByRole}
        onClose={() => setSelectedRoleId(null)}
      />
      <AreaDetails
        area={data?.areas.find((area: any) => area.id === selectedAreaId) ?? null}
        data={data}
        onClose={() => setSelectedAreaId(null)}
      />
      <EditStructureDialog open={editOpen} onOpenChange={setEditOpen} data={data} />
      <HistoryPanel
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        rows={data?.history ?? []}
        profiles={data?.profiles ?? []}
      />
    </div>
  );
}

function OrganizationTreeChart({
  roles,
  allRoles,
  areas,
  assignmentsByRole,
  triggerRules,
  onSelect,
}: any) {
  const queryClient = useQueryClient();
  const [draggedRoleId, setDraggedRoleId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  const centerChart = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
  }, []);

  const fitChart = useCallback(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    const naturalWidth = content.scrollWidth / zoomRef.current;
    const nextZoom = Math.min(1, Math.max(0.45, (viewport.clientWidth - 32) / naturalWidth));
    setZoom(nextZoom);
    requestAnimationFrame(centerChart);
  }, [centerChart]);

  useEffect(() => {
    const frame = requestAnimationFrame(fitChart);
    window.addEventListener("resize", fitChart);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", fitChart);
    };
  }, [fitChart, roles.length]);

  if (!roles.length) return <EmptyHierarchy />;

  async function moveRole(targetRole: any) {
    const draggedRole = allRoles.find((role: any) => role.id === draggedRoleId);
    if (!draggedRole || draggedRole.id === targetRole.id) return;
    const draggedTier = organizationTier(draggedRole);
    const targetTier = organizationTier(targetRole);
    const previousParent = allRoles.find((item: any) => item.id === draggedRole.reports_to_role_id);
    const newParent =
      draggedTier === targetTier
        ? allRoles.find((item: any) => item.id === targetRole.reports_to_role_id)
        : targetRole;
    const affectedMembers = assignmentsByRole.get(draggedRole.id)?.length ?? 0;
    const confirmed = window.confirm(
      "Confirmar movimento de " +
        draggedRole.name +
        "?\n\n" +
        "Posição anterior: " +
        (ORG_TIER_LABELS[draggedTier] ?? draggedTier) +
        "\n" +
        "Nova posição: " +
        (draggedTier === targetTier
          ? "mesma camada, próximo de " + targetRole.name
          : "subordinado a " + targetRole.name) +
        "\n" +
        "Superior anterior: " +
        (previousParent?.name ?? "Topo da estrutura") +
        "\n" +
        "Novo superior: " +
        (newParent?.name ?? "Topo da estrutura") +
        "\n" +
        "Membros afetados: " +
        affectedMembers +
        "\n" +
        "Permissões não serão alteradas automaticamente.",
    );
    if (!confirmed) return;

    if (draggedTier === targetTier) {
      const { error: parentError } = await db
        .from("job_roles")
        .update({ reports_to_role_id: targetRole.reports_to_role_id })
        .eq("id", draggedRole.id);
      if (parentError) throw parentError;

      const siblings = allRoles
        .filter(
          (role: any) =>
            organizationTier(role) === targetTier &&
            role.reports_to_role_id === targetRole.reports_to_role_id,
        )
        .sort(sortRoles)
        .filter((role: any) => role.id !== draggedRole.id);
      const targetIndex = siblings.findIndex((role: any) => role.id === targetRole.id);
      siblings.splice(Math.max(0, targetIndex), 0, draggedRole);
      const tierBase = (ORG_TIER_ORDER.indexOf(targetTier) + 1) * 1000;
      const results = await Promise.all(
        siblings.map((role: any, index: number) =>
          db
            .from("job_roles")
            .update({ hierarchical_rank: tierBase + index })
            .eq("id", role.id),
        ),
      );
      const failed = results.find((result: any) => result.error);
      if (failed?.error) throw failed.error;
      toast.success("Posição e ramificação do card salvas.");
    } else {
      const { error } = await db
        .from("job_roles")
        .update({ reports_to_role_id: targetRole.id })
        .eq("id", draggedRole.id);
      if (error) throw error;
      toast.success(`${draggedRole.name} agora responde a ${targetRole.name}.`);
    }
    await queryClient.invalidateQueries({ queryKey: ["company-hierarchy"] });
  }

  async function handleDrop(targetRole: any) {
    try {
      await moveRole(targetRole);
    } catch (error: any) {
      toast.error(
        error?.message?.toLowerCase().includes("circular")
          ? "Esse movimento criaria um ciclo na hierarquia."
          : `Não foi possível mover o card: ${error?.message ?? "erro inesperado"}`,
      );
    } finally {
      setDraggedRoleId(null);
      setDropTargetId(null);
    }
  }

  function dragProps(role: any) {
    return {
      draggable: true,
      isDragging: draggedRoleId === role.id,
      isDropTarget: dropTargetId === role.id,
      onDragStart: (event: any) => {
        setDraggedRoleId(role.id);
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", role.id);
      },
      onDragOver: (event: any) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDropTargetId(role.id);
      },
      onDragLeave: () => setDropTargetId((current) => (current === role.id ? null : current)),
      onDrop: (event: any) => {
        event.preventDefault();
        void handleDrop(role);
      },
      onDragEnd: () => {
        setDraggedRoleId(null);
        setDropTargetId(null);
      },
    };
  }

  const bandDefinitions = [
    { key: "fundador", sourceTier: "fundador", label: "Fundador", parentLabel: null },
    {
      key: "conselho",
      sourceTier: "socio",
      label: "Conselho de Sócios",
      parentLabel: "Conselho de Sócios",
      council: true,
    },
    {
      key: "diretor_geral",
      sourceTier: "diretor_geral",
      label: "Diretor geral",
      parentLabel: "Conselho de Sócios",
    },
    {
      key: "diretores",
      sourceTier: "diretor",
      label: "Diretores",
      parentLabel: "Diretor geral",
    },
    {
      key: "gestor_geral",
      sourceTier: "gestor_executivo",
      label: "Gestor geral",
      parentLabel: "Diretores",
    },
    {
      key: "gestores",
      sourceTier: "gestor",
      label: "Gestores",
      parentLabel: "Gestor geral",
    },
    {
      key: "gerente_geral",
      sourceTier: "gerente_geral",
      label: "Gerente geral",
      parentLabel: "Gestores",
    },
    {
      key: "gerentes",
      sourceTier: "gerente",
      label: "Gerentes",
      parentLabel: "Gerente geral",
    },
    {
      key: "supervisor_geral",
      sourceTier: "supervisor_geral",
      label: "Supervisor geral",
      parentLabel: "Gerentes",
    },
    {
      key: "supervisores",
      sourceTier: "supervisor",
      label: "Supervisores",
      parentLabel: "Supervisor geral",
    },
    {
      key: "analista_geral",
      sourceTier: "analista_geral",
      label: "Analista geral",
      parentLabel: "Supervisores",
    },
    {
      key: "analistas",
      sourceTier: "analista",
      label: "Analistas",
      parentLabel: "Analista geral",
    },
    {
      key: "assistente_geral",
      sourceTier: "assistente_geral",
      label: "Assistente geral",
      parentLabel: "Analistas",
    },
    {
      key: "assistentes",
      sourceTier: "assistente",
      label: "Assistentes",
      parentLabel: "Assistente geral",
    },
    {
      key: "execucao",
      sourceTier: "cargo",
      label: "Cargos de execução e especialistas",
      parentLabel: "Assistentes",
    },
  ];
  const bands = bandDefinitions.map((band) => ({
    ...band,
    roles: roles.filter((role: any) => organizationTier(role) === band.sourceTier).sort(sortRoles),
  }));

  return (
    <div
      ref={viewportRef}
      className="relative overflow-x-auto rounded-2xl border bg-gradient-to-b from-secondary/35 via-card to-accent/20 p-4 sm:p-7"
    >
      <div className="sticky left-0 top-2 z-20 mb-3 flex max-w-[calc(100vw-4rem)] justify-end">
        <div className="flex items-center gap-1 rounded-xl border bg-card/95 p-1 shadow-sm backdrop-blur">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Diminuir zoom"
            onClick={() => setZoom((value) => Math.max(0.45, value - 0.1))}
          >
            <Minus className="size-4" />
          </Button>
          <span className="w-12 text-center text-xs font-medium">{Math.round(zoom * 100)}%</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Aumentar zoom"
            onClick={() => setZoom((value) => Math.min(1.4, value + 0.1))}
          >
            <Plus className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Ajustar e centralizar"
            onClick={fitChart}
          >
            <Maximize2 className="size-4" />
          </Button>
        </div>
      </div>
      <div ref={contentRef} className="min-w-max origin-top" style={{ zoom }}>
        <div className="sticky left-0 mb-6 max-w-[calc(100vw-4rem)] text-center text-xs text-muted-foreground">
          Cada linha representa um nível da empresa. Arraste os cards para ordenar cargos
          equivalentes ou definir um novo superior.
        </div>
        <div className="flex min-w-full flex-col items-center px-3 pb-4">
          {bands.map((band, bandIndex) => (
            <div key={band.key} className="flex w-full flex-col items-center">
              {bandIndex > 0 && (
                <div className="flex h-12 flex-col items-center justify-center text-brand-sage">
                  <span className="h-6 w-px bg-brand-sage/60" />
                  <ArrowDown className="size-4" />
                </div>
              )}
              <div className="mb-3 flex w-full items-center gap-3">
                <span className="h-px min-w-16 flex-1 bg-brand-sage/35" />
                <span className="rounded-full border border-brand-sage/35 bg-card px-4 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground shadow-sm">
                  {band.label}
                </span>
                <span className="h-px min-w-16 flex-1 bg-brand-sage/35" />
              </div>
              <div
                className={cn(
                  "relative flex min-h-24 w-full items-stretch justify-center gap-4 rounded-2xl p-3",
                  band.council && "border border-brand-rose/30 bg-card/80 shadow-card",
                )}
              >
                {band.roles.length > 1 && (
                  <span className="absolute left-36 right-36 top-3 h-px bg-brand-sage/50" />
                )}
                {band.roles.length ? (
                  band.roles.map((role: any) => (
                    <div
                      key={role.id}
                      className={cn(
                        "relative w-72 shrink-0",
                        band.roles.length > 1 &&
                          "pt-5 before:absolute before:left-1/2 before:top-0 before:h-5 before:w-px before:bg-brand-sage/50",
                      )}
                    >
                      <RoleCard
                        role={role}
                        areas={areas}
                        occupants={assignmentsByRole.get(role.id) ?? []}
                        allRoles={allRoles}
                        allAssignmentsByRole={assignmentsByRole}
                        triggerRules={triggerRules}
                        onSelect={onSelect}
                        parentName={band.parentLabel}
                        compact={band.roles.length > 2}
                        {...dragProps(role)}
                      />
                    </div>
                  ))
                ) : (
                  <div className="grid min-h-20 w-72 place-items-center rounded-2xl border border-dashed bg-card/45 px-4 text-center text-xs text-muted-foreground">
                    Nenhum cargo cadastrado nesta faixa.
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function OrganizationChart({
  roles,
  allRoles,
  areas,
  assignmentsByRole,
  triggerRules,
  onSelect,
}: any) {
  const queryClient = useQueryClient();
  const [draggedRoleId, setDraggedRoleId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  if (!roles.length) return <EmptyHierarchy />;
  const allRolesById = new Map(allRoles.map((role: any) => [role.id, role]));
  const levels = ORG_TIER_ORDER.map((tier) => ({
    tier,
    roles: roles.filter((role: any) => organizationTier(role) === tier).sort(sortRoles),
  })).filter((level) => level.roles.length);

  async function moveRole(targetRole: any) {
    const draggedRole = allRoles.find((role: any) => role.id === draggedRoleId);
    if (!draggedRole || draggedRole.id === targetRole.id) return;
    const draggedTier = organizationTier(draggedRole);
    const targetTier = organizationTier(targetRole);
    const previousParent = allRoles.find((item: any) => item.id === draggedRole.reports_to_role_id);
    const newParent =
      draggedTier === targetTier
        ? allRoles.find((item: any) => item.id === targetRole.reports_to_role_id)
        : targetRole;
    const affectedMembers = assignmentsByRole.get(draggedRole.id)?.length ?? 0;
    const confirmed = window.confirm(
      "Confirmar movimento de " +
        draggedRole.name +
        "?\n\n" +
        "Posição anterior: " +
        (ORG_TIER_LABELS[draggedTier] ?? draggedTier) +
        "\n" +
        "Nova posição: " +
        (draggedTier === targetTier
          ? "mesma camada, próximo de " + targetRole.name
          : "subordinado a " + targetRole.name) +
        "\n" +
        "Superior anterior: " +
        (previousParent?.name ?? "Topo da estrutura") +
        "\n" +
        "Novo superior: " +
        (newParent?.name ?? "Topo da estrutura") +
        "\n" +
        "Membros afetados: " +
        affectedMembers +
        "\n" +
        "Permissões não serão alteradas automaticamente.",
    );
    if (!confirmed) return;

    if (draggedTier === targetTier) {
      const tierRoles = allRoles
        .filter((role: any) => organizationTier(role) === draggedTier)
        .sort(sortRoles);
      const reordered = tierRoles.filter((role: any) => role.id !== draggedRole.id);
      reordered.splice(
        reordered.findIndex((role: any) => role.id === targetRole.id),
        0,
        draggedRole,
      );
      const tierBase = (ORG_TIER_ORDER.indexOf(draggedTier) + 1) * 1000;
      const results = await Promise.all(
        reordered.map((role: any, index: number) =>
          db
            .from("job_roles")
            .update({ hierarchical_rank: tierBase + index })
            .eq("id", role.id),
        ),
      );
      const failed = results.find((result: any) => result.error);
      if (failed?.error) throw failed.error;
      toast.success("Posição do card salva.");
    } else {
      const { error } = await db
        .from("job_roles")
        .update({ reports_to_role_id: targetRole.id })
        .eq("id", draggedRole.id);
      if (error) throw error;
      toast.success(`${draggedRole.name} agora responde a ${targetRole.name}.`);
    }
    await queryClient.invalidateQueries({ queryKey: ["company-hierarchy"] });
  }

  async function handleDrop(targetRole: any) {
    try {
      await moveRole(targetRole);
    } catch (error: any) {
      toast.error(
        error?.message?.includes("circular")
          ? "Esse movimento criaria um ciclo na hierarquia."
          : `Não foi possível mover o card: ${error?.message ?? "erro inesperado"}`,
      );
    } finally {
      setDraggedRoleId(null);
      setDropTargetId(null);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border bg-gradient-to-b from-secondary/35 via-card to-accent/20 p-4 sm:p-7">
      <div className="mx-auto max-w-7xl">
        <p className="mb-5 text-center text-xs text-muted-foreground">
          Arraste dentro da mesma faixa para ordenar. Solte em outra faixa sobre um cargo para
          definir a quem ele responde.
        </p>
        {levels.map((level, levelIndex) => (
          <div key={level.tier} className="flex flex-col items-center">
            {levelIndex > 0 && (
              <div className="flex h-12 flex-col items-center justify-center text-brand-sage">
                <span className="h-5 w-px bg-brand-sage/50" />
                <ArrowDown className="size-4" />
              </div>
            )}
            <div className="mb-3 flex w-full items-center gap-3">
              <span className="h-px flex-1 bg-brand-sage/35" />
              <span className="rounded-full border border-brand-sage/35 bg-card px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground shadow-sm">
                {ORG_TIER_LABELS[level.tier] ?? level.tier}
              </span>
              <span className="h-px flex-1 bg-brand-sage/35" />
            </div>
            <div
              className={cn(
                "grid w-full gap-3 sm:gap-4",
                level.roles.length === 1 && "mx-auto max-w-xl grid-cols-1",
                level.roles.length === 2 && "mx-auto max-w-4xl grid-cols-1 md:grid-cols-2",
                level.roles.length === 3 && "grid-cols-1 md:grid-cols-3",
                level.roles.length >= 4 && "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4",
              )}
            >
              {level.roles.map((role: any) => {
                const parent = allRolesById.get(role.reports_to_role_id);
                return (
                  <RoleCard
                    key={role.id}
                    role={role}
                    areas={areas}
                    occupants={assignmentsByRole.get(role.id) ?? []}
                    allRoles={allRoles}
                    allAssignmentsByRole={assignmentsByRole}
                    triggerRules={triggerRules}
                    onSelect={onSelect}
                    parentName={parent?.name ?? null}
                    draggable
                    isDragging={draggedRoleId === role.id}
                    isDropTarget={dropTargetId === role.id}
                    onDragStart={(event: any) => {
                      setDraggedRoleId(role.id);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", role.id);
                    }}
                    onDragOver={(event: any) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      setDropTargetId(role.id);
                    }}
                    onDragLeave={() =>
                      setDropTargetId((current) => (current === role.id ? null : current))
                    }
                    onDrop={(event: any) => {
                      event.preventDefault();
                      void handleDrop(role);
                    }}
                    onDragEnd={() => {
                      setDraggedRoleId(null);
                      setDropTargetId(null);
                    }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoleCard({
  role,
  areas,
  occupants,
  allRoles,
  allAssignmentsByRole,
  triggerRules,
  onSelect,
  parentName,
  draggable,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  compact = false,
}: any) {
  const area = areas.find((item: any) => item.id === role.area_id);
  const insight = roleInsight(
    role,
    { roles: allRoles, areas, teams: [], triggerRules },
    allAssignmentsByRole,
  );
  const accent = areaAccent(area);
  const roleName = role.system_key === "gestor_executivo" ? "Gestor geral" : role.name;
  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onClick={() => onSelect(role.id)}
      className={cn(
        "group relative h-full min-h-40 w-full cursor-grab rounded-2xl border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing sm:p-5",
        compact && "min-h-32 p-3 sm:p-3",
        isDragging && "scale-[0.98] opacity-45",
        isDropTarget && !isDragging && "scale-[1.015] ring-2 ring-primary ring-offset-2",
        statusClasses(insight.occupancy, insight.recommendation),
        insight.occupancy === "planejado" && "border-dashed",
      )}
      style={{ boxShadow: "inset 4px 0 " + accent }}
    >
      <GripVertical className="absolute right-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/45 opacity-0 transition group-hover:opacity-100" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold leading-tight">{roleName}</p>
          <p className="mt-1 text-xs font-medium text-muted-foreground">
            {area?.name ?? "Sem departamento"}
          </p>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {parentName ? `Responde a ${parentName}` : "Topo da estrutura"}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge variant="outline" className="text-[10px]">
            {occupancyLabel(insight.occupancy)}
          </Badge>
          {insight.approvedVacancies > 0 && (
            <Badge
              variant="outline"
              className="border-amber-300 bg-amber-50 text-[10px] text-amber-800"
            >
              {insight.approvedVacancies} vaga(s)
            </Badge>
          )}
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {occupants.slice(0, 2).map(({ profile, is_primary }: any) => (
          <div key={profile.id} className="flex items-center gap-2">
            <Avatar className="size-7">
              <AvatarImage src={profile.avatar_url ?? undefined} />
              <AvatarFallback className="text-[10px]">{initials(profile.full_name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{profile.full_name || "Sem nome"}</p>
              <p className="text-[10px] text-muted-foreground">
                {is_primary ? "Cargo principal" : "Cargo adicional"}
              </p>
            </div>
          </div>
        ))}
        {!occupants.length && (
          <div className="flex items-center gap-2 rounded-lg border border-dashed px-2.5 py-2 text-xs text-muted-foreground">
            <UserRoundX className="size-4" /> Cargo vago
          </div>
        )}
        {occupants.length > 2 && (
          <p className="text-[10px] text-muted-foreground">+ {occupants.length - 2} ocupante(s)</p>
        )}
        <div className="border-t border-current/10 pt-2 text-[10px] text-muted-foreground">
          <p>Camada: {ORG_TIER_LABELS[organizationTier(role)] ?? organizationTier(role)}</p>
          <p>
            Subordinados diretos:{" "}
            {allRoles.filter((item: any) => item.reports_to_role_id === role.id).length}
          </p>
          <p>
            {insight.triggerLabel}:{" "}
            {insight.threshold
              ? insight.current + "/" + insight.threshold + " (" + insight.progress + "%)"
              : "não configurado"}
          </p>
          <p className="font-medium">{recommendationLabel(insight.recommendation)}</p>
        </div>
      </div>
    </button>
  );
}

function DepartmentView({ data, assignmentsByRole, onSelect }: any) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {data.areas.map((area: any) => {
        const roles = data.roles.filter((role: any) => role.area_id === area.id);
        const members = new Set(
          roles.flatMap((role: any) =>
            (assignmentsByRole.get(role.id) ?? []).map((item: any) => item.user_id),
          ),
        );
        const vacancies = roles.reduce(
          (sum: number, role: any) =>
            sum +
            Math.max(
              0,
              (role.planned_headcount ?? 1) - (assignmentsByRole.get(role.id)?.length ?? 0),
            ),
          0,
        );
        return (
          <Card
            key={area.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(area.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") onSelect(area.id);
            }}
            className="cursor-pointer transition hover:-translate-y-0.5 hover:border-foreground/25 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <span
                  className="size-3 rounded-full"
                  style={{ backgroundColor: areaAccent(area) }}
                />
                <CardTitle className="text-base">{area.name}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="min-h-10 text-sm text-muted-foreground">
                {area.description || "Departamento ativo na estrutura da empresa."}
              </p>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <MiniMetric label="Cargos" value={roles.length} />
                <MiniMetric label="Membros" value={members.size} />
                <MiniMetric label="Vagas" value={vacancies} />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function TeamView({ data }: any) {
  if (!data.teams.length) return <EmptyHierarchy text="Nenhuma equipe foi criada em Membros." />;
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {data.teams.map((team: any) => {
        const memberIds = data.teamMembers
          .filter((item: any) => item.team_id === team.id)
          .map((item: any) => item.user_id);
        const manager = data.profiles.find((item: any) => item.id === team.manager_id);
        return (
          <Card key={team.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{team.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {team.description || "Equipe vinculada à estrutura."}
              </p>
              <div className="mt-4 flex items-center justify-between text-sm">
                <span>{memberIds.length} membro(s)</span>
                <span className="truncate text-muted-foreground">
                  Líder: {manager?.full_name || "Não definido"}
                </span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function RoleList({ roles, allRoles, areas, assignmentsByRole, onSelect }: any) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="hidden grid-cols-[1.2fr_1fr_1fr_1fr_auto] gap-3 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground md:grid">
        <span>Cargo</span>
        <span>Departamento</span>
        <span>Superior direto</span>
        <span>Ocupante</span>
        <span>Situação</span>
      </div>
      {roles.map((role: any) => {
        const area = areas.find((item: any) => item.id === role.area_id);
        const parent = allRoles.find((item: any) => item.id === role.reports_to_role_id);
        const occupants = assignmentsByRole.get(role.id) ?? [];
        const vacant = occupants.length < (role.planned_headcount ?? 1);
        return (
          <button
            key={role.id}
            onClick={() => onSelect(role.id)}
            className="grid w-full gap-2 border-b px-4 py-3 text-left text-sm last:border-0 hover:bg-muted/30 md:grid-cols-[1.2fr_1fr_1fr_1fr_auto] md:items-center"
          >
            <strong>{role.name}</strong>
            <span>{area?.name ?? "—"}</span>
            <span className="text-muted-foreground">{parent?.name ?? "Topo da estrutura"}</span>
            <span className="truncate">
              {occupants.map((item: any) => item.profile.full_name).join(", ") || "—"}
            </span>
            <Badge
              variant={vacant ? "outline" : "secondary"}
              className={cn("w-fit", vacant && "border-amber-300 text-amber-800")}
            >
              {vacant ? "Com vaga" : "Ocupado"}
            </Badge>
          </button>
        );
      })}
    </div>
  );
}

function PeopleList({ data }: any) {
  const primaryByUser = new Map<string, any>();
  for (const assignment of data.assignments)
    if (assignment.is_primary || !primaryByUser.has(assignment.user_id))
      primaryByUser.set(assignment.user_id, assignment);
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-3">Membro</th>
            <th className="px-4 py-3">Cargo</th>
            <th className="px-4 py-3">Departamento</th>
            <th className="px-4 py-3">Gestor direto</th>
            <th className="px-4 py-3">Equipe</th>
            <th className="px-4 py-3">Situação</th>
          </tr>
        </thead>
        <tbody>
          {data.profiles.map((profile: any) => {
            const assignment = primaryByUser.get(profile.id);
            const role = data.roles.find((item: any) => item.id === assignment?.job_role_id);
            const area = data.areas.find((item: any) => item.id === role?.area_id);
            const managerId = assignment?.manager_user_id ?? profile.manager_id;
            const manager = data.profiles.find((item: any) => item.id === managerId);
            const teams = data.teamMembers
              .filter((item: any) => item.user_id === profile.id)
              .map((item: any) => data.teams.find((team: any) => team.id === item.team_id)?.name)
              .filter(Boolean);
            return (
              <tr key={profile.id} className="border-t">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Avatar className="size-8">
                      <AvatarImage src={profile.avatar_url ?? undefined} />
                      <AvatarFallback className="text-xs">
                        {initials(profile.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{profile.full_name || "Sem nome"}</p>
                      <p className="text-xs text-muted-foreground">
                        {profile.email || "Sem e-mail"}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">{role?.name ?? "Sem cargo"}</td>
                <td className="px-4 py-3">{area?.name ?? "—"}</td>
                <td className="px-4 py-3">{manager?.full_name ?? "Não definido"}</td>
                <td className="px-4 py-3">{teams.join(", ") || "—"}</td>
                <td className="px-4 py-3">
                  <Badge variant={profile.is_active ? "secondary" : "outline"}>
                    {profile.is_active ? "Ativo" : "Inativo"}
                  </Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AreaDetails({ area, data, onClose }: any) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    description: "",
    color: ORGANIZATION_PALETTE[0],
    costCenter: "",
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!area) return;
    setForm({
      name: area.name ?? "",
      description: area.description ?? "",
      color: areaAccent(area),
      costCenter: area.cost_center ?? "",
    });
  }, [area]);

  if (!data) return null;
  const roles = area ? data.roles.filter((role: any) => role.area_id === area.id) : [];
  const childAreas = area ? data.areas.filter((item: any) => item.parent_area_id === area.id) : [];

  async function saveArea() {
    if (!area) return;
    if (!form.name.trim()) return toast.error("Informe o nome da área.");
    setSaving(true);
    const { error } = await db
      .from("organization_areas")
      .update({
        name: form.name.trim(),
        description: form.description.trim() || null,
        color: form.color || ORGANIZATION_PALETTE[0],
        cost_center: form.costCenter.trim() || null,
      })
      .eq("id", area.id);
    setSaving(false);
    if (error) return toast.error("Não foi possível editar a área: " + error.message);
    toast.success("Área atualizada.");
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["company-hierarchy"] }),
      queryClient.invalidateQueries({ queryKey: ["job-catalog"] }),
    ]);
    onClose();
  }

  async function deleteArea() {
    if (!area) return;
    if (roles.length || childAreas.length) {
      toast.error(
        `Esta área possui ${roles.length} cargo(s) e ${childAreas.length} área(s) subordinada(s). Mova ou exclua esses vínculos primeiro.`,
      );
      return;
    }
    if (!window.confirm(`Excluir definitivamente a área “${area.name}”?`)) return;
    setDeleting(true);
    const { error } = await db.from("organization_areas").delete().eq("id", area.id);
    setDeleting(false);
    if (error) return toast.error("Não foi possível excluir a área: " + error.message);
    toast.success("Área excluída.");
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["company-hierarchy"] }),
      queryClient.invalidateQueries({ queryKey: ["job-catalog"] }),
    ]);
    onClose();
  }

  return (
    <Sheet open={!!area} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Editar área</SheetTitle>
          <SheetDescription>
            Altere as informações do card ou exclua uma área que não tenha vínculos.
          </SheetDescription>
        </SheetHeader>
        {area && (
          <div className="mt-6 space-y-5">
            <div className="space-y-2">
              <Label>Nome da área</Label>
              <Input
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <textarea
                rows={4}
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
                placeholder="Explique a responsabilidade desta área."
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Cor do card</Label>
                <div className="flex flex-wrap gap-2">
                  {ORGANIZATION_PALETTE.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={`Selecionar cor ${color}`}
                      onClick={() => setForm((current) => ({ ...current, color }))}
                      className={cn(
                        "size-9 rounded-full border-2 border-card shadow-sm transition hover:scale-110",
                        form.color === color && "ring-2 ring-foreground ring-offset-2",
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Centro de custo</Label>
                <Input
                  value={form.costCenter}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, costCenter: event.target.value }))
                  }
                />
              </div>
            </div>
            <div className="rounded-xl border bg-muted/30 p-4 text-sm">
              <p>
                <strong>{roles.length}</strong> cargo(s) vinculado(s)
              </p>
              <p className="mt-1 text-muted-foreground">
                <strong>{childAreas.length}</strong> área(s) subordinada(s)
              </p>
            </div>
            <div className="sticky bottom-0 flex flex-wrap justify-between gap-2 border-t bg-background py-4">
              <Button variant="destructive" onClick={deleteArea} disabled={deleting}>
                <Trash2 className="mr-2 size-4" />
                {deleting ? "Excluindo…" : "Excluir área"}
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>
                  Cancelar
                </Button>
                <Button onClick={saveArea} disabled={saving}>
                  {saving ? "Salvando…" : "Salvar alterações"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function RoleDetails({ role, data, assignmentsByRole, onClose }: any) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    areaId: "none",
    parentId: "root",
    rank: "100",
    headcount: "1",
    engagementType: "interno",
    organizationTier: "cargo",
    occupancyStatus: "review",
    recommendationStatus: "nao_necessario",
    functionalParentId: "root",
    isCorporate: false,
    allowsMultiple: false,
    triggerMetric: "none",
    triggerThreshold: "",
    triggerManualValue: "",
    responsibilities: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!role) return;
    setForm({
      name: role.name ?? "",
      areaId: role.area_id ?? "none",
      parentId: role.reports_to_role_id ?? "root",
      rank: String(role.hierarchical_rank ?? 100),
      headcount: String(role.planned_headcount ?? 1),
      engagementType: role.engagement_type ?? "interno",
      organizationTier: role.organization_tier ?? "cargo",
      occupancyStatus: role.occupancy_status ?? "review",
      recommendationStatus: role.recommendation_status ?? "nao_necessario",
      functionalParentId: role.functional_reports_to_role_id ?? "root",
      isCorporate: Boolean(role.is_corporate),
      allowsMultiple: Boolean(role.allows_multiple_occupants),
      triggerMetric: role.trigger_metric ?? "none",
      triggerThreshold: role.trigger_threshold == null ? "" : String(role.trigger_threshold),
      triggerManualValue:
        role.trigger_manual_value == null ? "" : String(role.trigger_manual_value),
      responsibilities: role.responsibilities ?? "",
    });
  }, [role]);

  if (!data) return null;
  const area = data.areas.find((item: any) => item.id === role?.area_id);
  const parent = data.roles.find((item: any) => item.id === role?.reports_to_role_id);
  const occupants = role ? (assignmentsByRole.get(role.id) ?? []) : [];
  const children = role
    ? data.roles.filter((item: any) => item.reports_to_role_id === role.id)
    : [];

  async function saveRole() {
    if (!role) return;
    if (!form.name.trim()) return toast.error("Informe o nome do cargo.");
    setSaving(true);
    const { error } = await db
      .from("job_roles")
      .update({
        name: form.name.trim(),
        area_id: form.areaId === "none" ? null : form.areaId,
        reports_to_role_id: form.parentId === "root" ? null : form.parentId,
        hierarchical_rank: Math.max(1, Number(form.rank) || 100),
        planned_headcount: Math.max(1, Number(form.headcount) || 1),
        engagement_type: form.engagementType,
        organization_tier: form.organizationTier,
        occupancy_status: form.occupancyStatus === "review" ? null : form.occupancyStatus,
        recommendation_status: form.recommendationStatus,
        functional_reports_to_role_id:
          form.functionalParentId === "root" ? null : form.functionalParentId,
        is_corporate: form.isCorporate,
        allows_multiple_occupants: form.allowsMultiple,
        trigger_metric: form.triggerMetric === "none" ? null : form.triggerMetric,
        trigger_threshold: form.triggerThreshold ? Number(form.triggerThreshold) : null,
        trigger_manual_value: form.triggerManualValue ? Number(form.triggerManualValue) : null,
        responsibilities: form.responsibilities.trim() || null,
      })
      .eq("id", role.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Cargo atualizado no organograma.");
    await queryClient.invalidateQueries({ queryKey: ["company-hierarchy"] });
    onClose();
  }

  return (
    <Sheet open={!!role} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Editar cargo</SheetTitle>
          <SheetDescription>
            Altere as informações deste card e salve para atualizar a hierarquia.
          </SheetDescription>
        </SheetHeader>
        {role && (
          <div className="mt-6 space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Nome do cargo</Label>
                <Input
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Área</Label>
                <Select
                  value={form.areaId}
                  onValueChange={(value) => setForm((current) => ({ ...current, areaId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem área</SelectItem>
                    {data.areas.map((item: any) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Superior direto</Label>
                <Select
                  value={form.parentId}
                  onValueChange={(value) => setForm((current) => ({ ...current, parentId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="root">Topo da estrutura</SelectItem>
                    {data.roles
                      .filter((item: any) => item.id !== role.id)
                      .map((item: any) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Faixa no organograma</Label>
                <Select
                  value={form.organizationTier}
                  onValueChange={(value) =>
                    setForm((current) => ({ ...current, organizationTier: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ORG_TIER_OPTIONS.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Ordem hierárquica</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.rank}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, rank: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Quantidade prevista</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.headcount}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, headcount: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Tipo de vínculo</Label>
                <Select
                  value={form.engagementType}
                  onValueChange={(value) =>
                    setForm((current) => ({ ...current, engagementType: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="interno">Interno</SelectItem>
                    <SelectItem value="externo">Externo</SelectItem>
                    <SelectItem value="societario">Societário</SelectItem>
                    <SelectItem value="terceirizado">Terceirizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status de ocupação</Label>
                <Select
                  value={form.occupancyStatus}
                  onValueChange={(value) =>
                    setForm((current) => ({ ...current, occupancyStatus: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="review">Revisar classificação</SelectItem>
                    {OCCUPANCY_OPTIONS.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status de recomendação</Label>
                <Select
                  value={form.recommendationStatus}
                  onValueChange={(value) =>
                    setForm((current) => ({ ...current, recommendationStatus: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RECOMMENDATION_OPTIONS.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Superior funcional</Label>
                <Select
                  value={form.functionalParentId}
                  onValueChange={(value) =>
                    setForm((current) => ({ ...current, functionalParentId: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="root">Não definido</SelectItem>
                    {data.roles
                      .filter((item: any) => item.id !== role.id)
                      .map((item: any) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Principal gatilho</Label>
                <Select
                  value={form.triggerMetric}
                  onValueChange={(value) =>
                    setForm((current) => ({ ...current, triggerMetric: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Usar padrão da camada/área</SelectItem>
                    {TRIGGER_METRICS.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Limite do gatilho</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.triggerThreshold}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, triggerThreshold: event.target.value }))
                  }
                  placeholder="Usar padrão"
                />
              </div>
              {form.triggerMetric === "manual" && (
                <div className="space-y-2 sm:col-span-2">
                  <Label>Valor atual do indicador manual</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.triggerManualValue}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, triggerManualValue: event.target.value }))
                    }
                  />
                </div>
              )}
              <label className="flex items-center gap-2 rounded-xl border p-3 text-sm">
                <input
                  type="checkbox"
                  checked={form.isCorporate}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, isCorporate: event.target.checked }))
                  }
                />{" "}
                Cargo corporativo
              </label>
              <label className="flex items-center gap-2 rounded-xl border p-3 text-sm">
                <input
                  type="checkbox"
                  checked={form.allowsMultiple}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, allowsMultiple: event.target.checked }))
                  }
                />{" "}
                Permite múltiplos ocupantes
              </label>
              <div className="space-y-2 sm:col-span-2">
                <Label>Responsabilidades</Label>
                <textarea
                  value={form.responsibilities}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, responsibilities: event.target.value }))
                  }
                  rows={4}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
            </div>
            <section>
              <h3 className="mb-3 text-sm font-semibold">Ocupantes atuais</h3>
              <div className="space-y-2">
                {occupants.map(({ profile, is_primary }: any) => (
                  <div key={profile.id} className="flex items-center gap-3 rounded-xl border p-3">
                    <Avatar>
                      <AvatarImage src={profile.avatar_url ?? undefined} />
                      <AvatarFallback>{initials(profile.full_name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{profile.full_name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {profile.email || "Sem e-mail"} · {is_primary ? "Principal" : "Adicional"}
                      </p>
                    </div>
                  </div>
                ))}
                {!occupants.length && (
                  <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                    Cargo vago. O cargo permanece na estrutura até receber um novo membro.
                  </div>
                )}
              </div>
            </section>
            <section>
              <h3 className="mb-2 text-sm font-semibold">Cadeia completa até o Fundador</h3>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {(() => {
                  const chain: any[] = [];
                  const seen = new Set<string>();
                  let current: any = role;
                  while (current && !seen.has(current.id)) {
                    chain.push(current);
                    seen.add(current.id);
                    current = data.roles.find(
                      (item: any) => item.id === current.reports_to_role_id,
                    );
                  }
                  return chain.map((item, index) => (
                    <span key={item.id} className="flex items-center gap-2">
                      <Badge variant="outline">{item.name}</Badge>
                      {index < chain.length - 1 && <span>→</span>}
                    </span>
                  ));
                })()}
              </div>
            </section>
            <section>
              <h3 className="mb-2 text-sm font-semibold">Cargos subordinados</h3>
              <div className="flex flex-wrap gap-2">
                {children.length ? (
                  children.map((item: any) => (
                    <Badge key={item.id} variant="outline">
                      {item.name}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">Nenhum cargo subordinado.</span>
                )}
              </div>
            </section>
            {role.responsibilities && (
              <p className="text-xs text-muted-foreground">
                As responsabilidades atuais podem ser alteradas no campo acima.
              </p>
            )}
            <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-background py-4">
              <Button variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button onClick={saveRole} disabled={saving}>
                {saving ? "Salvando…" : "Salvar alterações"}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function EditStructureDialog({ open, onOpenChange, data }: any) {
  const queryClient = useQueryClient();
  const [roleId, setRoleId] = useState("");
  const [parentId, setParentId] = useState("root");
  const [headcount, setHeadcount] = useState("1");
  const [organizationTier, setOrganizationTier] = useState("cargo");
  const [saving, setSaving] = useState(false);
  const role = data?.roles.find((item: any) => item.id === roleId);
  function selectRole(value: string) {
    const selected = data?.roles.find((item: any) => item.id === value);
    setRoleId(value);
    setParentId(selected?.reports_to_role_id ?? "root");
    setHeadcount(String(selected?.planned_headcount ?? 1));
    setOrganizationTier(selected?.organization_tier ?? "cargo");
  }
  async function save() {
    if (!roleId) return toast.error("Escolha um cargo.");
    setSaving(true);
    const { error } = await db
      .from("job_roles")
      .update({
        reports_to_role_id: parentId === "root" ? null : parentId,
        planned_headcount: Math.max(1, Number(headcount) || 1),
        organization_tier: organizationTier,
      })
      .eq("id", roleId);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Estrutura atualizada.");
    await queryClient.invalidateQueries({ queryKey: ["company-hierarchy"] });
    onOpenChange(false);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar estrutura</DialogTitle>
          <DialogDescription>
            Defina o cargo superior e a quantidade prevista de ocupantes. O banco impede relações
            circulares.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label>Cargo</Label>
            <Select value={roleId} onValueChange={selectRole}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha o cargo" />
              </SelectTrigger>
              <SelectContent>
                {data?.roles.map((item: any) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Cargo superior direto</Label>
            <Select value={parentId} onValueChange={setParentId} disabled={!roleId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="root">Topo da estrutura</SelectItem>
                {data?.roles
                  .filter((item: any) => item.id !== roleId)
                  .map((item: any) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Faixa no organograma</Label>
            <Select value={organizationTier} onValueChange={setOrganizationTier} disabled={!roleId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORG_TIER_OPTIONS.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Quantidade prevista de ocupantes</Label>
            <Input
              type="number"
              min={1}
              value={headcount}
              onChange={(event) => setHeadcount(event.target.value)}
            />
          </div>
          <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            <ShieldAlert className="mr-2 inline size-4" />
            Ao remover um ocupante, o cargo continuará visível como vago.
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving || !role}>
            {saving ? "Salvando…" : "Salvar estrutura"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistoryPanel({ open, onOpenChange, rows, profiles }: any) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Histórico da hierarquia</SheetTitle>
          <SheetDescription>
            Alterações de cargos, departamentos, vínculos e gestores.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-3">
          {rows.map((row: any) => {
            const actor = profiles.find((profile: any) => profile.id === row.changed_by);
            return (
              <div key={row.id} className="rounded-xl border p-3">
                <div className="flex items-center justify-between gap-3">
                  <Badge variant="outline">{historyEntityLabel(row.entity_type)}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(row.created_at)}
                  </span>
                </div>
                <p className="mt-2 text-sm font-medium">{historyActionLabel(row.action)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Responsável: {actor?.full_name || "Sistema"}
                </p>
              </div>
            );
          })}
          {!rows.length && (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              <Clock3 className="mx-auto mb-2 size-5" />O histórico começará a aparecer após as
              próximas alterações.
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}
function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted p-2">
      <p className="font-semibold">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
function EmptyHierarchy({ text = "Nenhum cargo corresponde aos filtros." }: { text?: string }) {
  return (
    <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
      <GitBranch className="mx-auto mb-2 size-6" />
      {text}
    </div>
  );
}
function sortRoles(a: any, b: any) {
  return (
    (a.hierarchical_rank ?? 100) - (b.hierarchical_rank ?? 100) ||
    a.name.localeCompare(b.name, "pt-BR")
  );
}
function historyEntityLabel(value: string) {
  return (
    (
      {
        organization_areas: "Departamento",
        job_roles: "Cargo",
        member_job_assignments: "Vínculo",
        profiles: "Membro",
      } as Record<string, string>
    )[value] ?? value
  );
}
function historyActionLabel(value: string) {
  return (
    (
      {
        insert: "Registro criado",
        update: "Registro atualizado",
        delete: "Registro encerrado",
      } as Record<string, string>
    )[value] ?? value
  );
}
