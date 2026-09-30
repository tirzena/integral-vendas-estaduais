/* eslint-disable @typescript-eslint/no-explicit-any, react-refresh/only-export-components */
import { useMemo, useState } from "react";
import { AlertTriangle, BriefcaseBusiness, Clock3, Settings2, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

export const OCCUPANCY_OPTIONS = [
  ["ocupado", "Ocupado"],
  ["vago_aprovado", "Vaga aprovada"],
  ["planejado", "Planejado"],
  ["acumulado", "Acumulado"],
  ["terceirizado", "Terceirizado"],
  ["inativo", "Inativo"],
] as const;

export const RECOMMENDATION_OPTIONS = [
  ["nao_necessario", "Ainda não necessário"],
  ["monitoramento", "Monitoramento"],
  ["proximo_do_gatilho", "Próximo do gatilho"],
  ["contratacao_recomendada", "Contratação recomendada"],
  ["contratacao_critica", "Contratação crítica"],
] as const;

export const TRIGGER_METRICS = [
  ["membros_area", "Membros ativos na área"],
  ["subordinados_diretos", "Subordinados diretos"],
  ["cargos_area", "Cargos na área"],
  ["equipes_area", "Equipes na área"],
  ["unidades", "Unidades"],
  ["areas", "Áreas"],
  ["volume_mensal", "Volume mensal"],
  ["turnos", "Turnos"],
  ["complexidade", "Complexidade"],
  ["manual", "Indicador manual"],
] as const;

export const TIER_OPTIONS = [
  ["fundador", "Fundador"],
  ["conselho", "Governança"],
  ["socio", "Sócios"],
  ["diretor_geral", "Direção geral"],
  ["diretor", "Diretores"],
  ["gestor_executivo", "Gestão geral"],
  ["gestor", "Gestores"],
  ["gerente_geral", "Gerência geral"],
  ["gerente", "Gerentes"],
  ["supervisor_geral", "Supervisão geral"],
  ["supervisor", "Supervisores"],
  ["analista_geral", "Análise geral"],
  ["analista", "Analistas"],
  ["assistente_geral", "Assistência geral"],
  ["assistente", "Assistentes"],
  ["cargo", "Execução e especialistas"],
] as const;

const severity: Record<string, number> = {
  nao_necessario: 0,
  monitoramento: 1,
  proximo_do_gatilho: 2,
  contratacao_recomendada: 3,
  contratacao_critica: 4,
};

export function derivedOccupancy(role: any, occupantCount: number) {
  if (!role.active || role.occupancy_status === "inativo") return "inativo";
  if (role.occupancy_status === "acumulado" || role.occupancy_status === "terceirizado") {
    return role.occupancy_status;
  }
  if (occupantCount > 0) return "ocupado";
  return role.occupancy_status || "revisar";
}

export function approvedVacancies(role: any, occupantCount: number) {
  return role.occupancy_status === "vago_aprovado"
    ? Math.max(0, Number(role.planned_headcount ?? 1) - occupantCount)
    : 0;
}

function metricValue(metric: string, role: any, data: any, assignmentsByRole: Map<string, any[]>) {
  const activeRoles = (data.roles ?? []).filter((item: any) => item.active);
  if (metric === "subordinados_diretos") {
    return activeRoles
      .filter((item: any) => item.reports_to_role_id === role.id)
      .reduce((sum: number, item: any) => sum + (assignmentsByRole.get(item.id)?.length ?? 0), 0);
  }
  if (metric === "membros_area") {
    return activeRoles
      .filter((item: any) => item.area_id === role.area_id)
      .reduce((sum: number, item: any) => sum + (assignmentsByRole.get(item.id)?.length ?? 0), 0);
  }
  if (metric === "cargos_area")
    return activeRoles.filter((item: any) => item.area_id === role.area_id).length;
  if (metric === "equipes_area")
    return (data.teams ?? []).filter((item: any) => item.area_id === role.area_id).length;
  if (metric === "areas") return (data.areas ?? []).length;
  if (metric === "unidades") return 1;
  return Number(role.trigger_manual_value ?? 0);
}

function recommendationForProgress(progress: number, exceededSince?: string | null) {
  if (exceededSince) {
    const elapsed = (Date.now() - new Date(exceededSince).getTime()) / 86400000;
    if (elapsed >= 60) return "contratacao_critica";
  }
  if (progress >= 125) return "contratacao_critica";
  if (progress >= 100) return "contratacao_recomendada";
  if (progress >= 90) return "proximo_do_gatilho";
  if (progress >= 70) return "monitoramento";
  return "nao_necessario";
}

export function roleInsight(role: any, data: any, assignmentsByRole: Map<string, any[]>) {
  const occupants = assignmentsByRole.get(role.id)?.length ?? 0;
  const rules = (data.triggerRules ?? [])
    .filter((rule: any) => rule.active)
    .filter(
      (rule: any) =>
        (rule.scope_type === "cargo" && rule.role_id === role.id) ||
        (rule.scope_type === "area" && rule.area_id === role.area_id) ||
        (rule.scope_type === "camada" && rule.organization_tier === role.organization_tier),
    )
    .sort((a: any, b: any) => {
      const scopeWeight: Record<string, number> = { cargo: 0, area: 1, camada: 2 };
      return scopeWeight[a.scope_type] - scopeWeight[b.scope_type] || a.priority - b.priority;
    });
  const rule =
    role.trigger_metric && role.trigger_threshold
      ? {
          metric: role.trigger_metric,
          threshold: Number(role.trigger_threshold),
          label:
            TRIGGER_METRICS.find(([key]) => key === role.trigger_metric)?.[1] ?? "Gatilho do cargo",
        }
      : rules[0];
  const current = rule ? metricValue(rule.metric, role, data, assignmentsByRole) : 0;
  const threshold = Number(rule?.threshold ?? 0);
  const progress = threshold > 0 ? Math.round((current / threshold) * 100) : 0;
  const calculated = recommendationForProgress(progress, role.trigger_exceeded_since);
  const stored = role.recommendation_status ?? "nao_necessario";
  const recommendation = severity[stored] > severity[calculated] ? stored : calculated;
  const dismissed =
    role.recommendation_dismissed_until &&
    new Date(role.recommendation_dismissed_until).getTime() >= new Date().setHours(0, 0, 0, 0);
  const directRoles = (data.roles ?? []).filter((item: any) => item.reports_to_role_id === role.id);
  return {
    occupants,
    occupancy: derivedOccupancy(role, occupants),
    approvedVacancies: approvedVacancies(role, occupants),
    directRoles: directRoles.length,
    triggerLabel: rule?.label ?? "Sem gatilho configurado",
    current,
    threshold,
    progress,
    recommendation,
    dismissed,
  };
}

export function occupancyLabel(value: string) {
  if (value === "revisar") return "Revisar classificação";
  return OCCUPANCY_OPTIONS.find(([key]) => key === value)?.[1] ?? value;
}

export function recommendationLabel(value: string) {
  return RECOMMENDATION_OPTIONS.find(([key]) => key === value)?.[1] ?? value;
}

export function statusClasses(occupancy: string, recommendation?: string) {
  if (recommendation === "contratacao_critica") return "border-red-400 bg-red-50 text-red-800";
  if (recommendation === "contratacao_recomendada")
    return "border-orange-400 bg-orange-50 text-orange-800";
  if (occupancy === "ocupado") return "border-emerald-300 bg-emerald-50 text-emerald-800";
  if (occupancy === "vago_aprovado") return "border-amber-300 bg-amber-50 text-amber-800";
  if (occupancy === "planejado") return "border-blue-300 bg-blue-50 text-blue-800";
  if (occupancy === "acumulado") return "border-purple-300 bg-purple-50 text-purple-800";
  if (occupancy === "terceirizado") return "border-slate-300 bg-slate-100 text-slate-700";
  return "border-slate-300 bg-card text-muted-foreground";
}

export function HierarchySummary({ data, assignmentsByRole }: any) {
  const metrics = useMemo(() => {
    const insights = (data.roles ?? []).map((role: any) =>
      roleInsight(role, data, assignmentsByRole),
    );
    return [
      ["Cargos", (data.roles ?? []).length],
      ["Ocupados", insights.filter((item: any) => item.occupancy === "ocupado").length],
      [
        "Ocupantes ativos",
        [...assignmentsByRole.values()].reduce((sum: number, rows: any[]) => sum + rows.length, 0),
      ],
      [
        "Vagas aprovadas",
        insights.reduce((sum: number, item: any) => sum + item.approvedVacancies, 0),
      ],
      ["Planejados", insights.filter((item: any) => item.occupancy === "planejado").length],
      ["Acumulados", insights.filter((item: any) => item.occupancy === "acumulado").length],
      ["Terceirizados", insights.filter((item: any) => item.occupancy === "terceirizado").length],
      ["Inativos", insights.filter((item: any) => item.occupancy === "inativo").length],
    ];
  }, [assignmentsByRole, data]);
  return (
    <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
      {metrics.map(([label, value]) => (
        <Card key={String(label)}>
          <CardContent className="p-3">
            <p className="text-xl font-semibold">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function InsightCard({ role, data, assignmentsByRole, onSelect }: any) {
  const insight = roleInsight(role, data, assignmentsByRole);
  const area = data.areas.find((item: any) => item.id === role.area_id);
  return (
    <button
      type="button"
      onClick={() => onSelect(role.id)}
      className={cn(
        "w-full rounded-xl border p-4 text-left transition hover:shadow-sm",
        statusClasses(insight.occupancy, insight.recommendation),
        insight.occupancy === "planejado" && "border-dashed",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{role.name}</p>
          <p className="text-xs opacity-75">
            {area?.name ?? "Corporativo"} · {occupancyLabel(insight.occupancy)}
          </p>
        </div>
        <Badge variant="outline">{insight.occupants} ocupante(s)</Badge>
      </div>
      <p className="mt-3 text-xs">Subordinados: {insight.directRoles} cargo(s)</p>
      <p className="mt-1 text-xs">
        {insight.triggerLabel}: {insight.current}/{insight.threshold || "—"}
      </p>
      {insight.threshold > 0 && (
        <div className="mt-2">
          <div className="h-2 overflow-hidden rounded-full bg-black/10">
            <div
              className="h-full rounded-full bg-current"
              style={{ width: `${Math.min(100, insight.progress)}%` }}
            />
          </div>
          <p className="mt-1 text-xs">
            {insight.progress}% · {recommendationLabel(insight.recommendation)}
          </p>
        </div>
      )}
    </button>
  );
}

export function LayersView({ data, assignmentsByRole, onSelect }: any) {
  const [tier, setTier] = useState("supervisor");
  const groups = (data.areas ?? [])
    .map((area: any) => ({
      area,
      roles: (data.roles ?? []).filter(
        (role: any) => role.organization_tier === tier && role.area_id === area.id,
      ),
    }))
    .filter((group: any) => group.roles.length);
  const corporate = (data.roles ?? []).filter(
    (role: any) => role.organization_tier === tier && !role.area_id,
  );
  return (
    <div className="space-y-5">
      <div className="max-w-sm">
        <Select value={tier} onValueChange={setTier}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIER_OPTIONS.map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {[
        ...(corporate.length
          ? [{ area: { id: "corporate", name: "Corporativo" }, roles: corporate }]
          : []),
        ...groups,
      ].map((group: any) => (
        <section key={group.area.id}>
          <h3 className="mb-3 flex items-center gap-2 font-semibold">
            <BriefcaseBusiness className="size-4" />
            {group.area.name}
          </h3>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {group.roles.map((role: any) => (
              <InsightCard
                key={role.id}
                role={role}
                data={data}
                assignmentsByRole={assignmentsByRole}
                onSelect={onSelect}
              />
            ))}
          </div>
        </section>
      ))}
      {!groups.length && !corporate.length && (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nenhum cargo cadastrado nesta camada.
        </div>
      )}
    </div>
  );
}

export function RecommendationsView({ data, assignmentsByRole, onSelect, onRefresh }: any) {
  const rows = (data.roles ?? [])
    .map((role: any) => ({ role, insight: roleInsight(role, data, assignmentsByRole) }))
    .filter(({ insight }: any) => insight.recommendation !== "nao_necessario" && !insight.dismissed)
    .sort(
      (a: any, b: any) =>
        severity[b.insight.recommendation] - severity[a.insight.recommendation] ||
        b.insight.progress - a.insight.progress,
    );
  async function dismiss(role: any) {
    const until = new Date();
    until.setDate(until.getDate() + 30);
    const { error } = await db
      .from("job_roles")
      .update({
        recommendation_dismissed_until: until.toISOString().slice(0, 10),
        recommendation_dismissed_by: (await db.auth.getUser()).data.user?.id ?? null,
      })
      .eq("id", role.id);
    if (!error) onRefresh();
  }
  const summaries = [
    [
      "Críticas",
      rows.filter(({ insight }: any) => insight.recommendation === "contratacao_critica").length,
      AlertTriangle,
    ],
    [
      "Recomendadas",
      rows.filter(({ insight }: any) => insight.recommendation === "contratacao_recomendada")
        .length,
      UsersRound,
    ],
    [
      "Próximas",
      rows.filter(({ insight }: any) => insight.recommendation === "proximo_do_gatilho").length,
      Clock3,
    ],
    [
      "Monitoramento",
      rows.filter(({ insight }: any) => insight.recommendation === "monitoramento").length,
      Settings2,
    ],
  ];
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {summaries.map(([label, value, Icon]: any) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-3 p-4">
              <Icon className="size-5" />
              <div>
                <p className="text-xl font-semibold">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {rows.map(({ role, insight }: any) => (
        <Card
          key={role.id}
          className={cn("border-l-4", statusClasses(insight.occupancy, insight.recommendation))}
        >
          <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center">
            <div className="flex-1">
              <p className="font-semibold">{role.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {insight.triggerLabel}: existem {insight.current} para um gatilho de{" "}
                {insight.threshold}. Progresso de {insight.progress}%.
              </p>
              <p className="mt-1 text-xs font-medium">
                {recommendationLabel(insight.recommendation)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => onSelect(role.id)}>
                Revisar
              </Button>
              <Button size="sm" variant="outline" onClick={() => onSelect(role.id)}>
                Configurar gatilho
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void dismiss(role)}>
                Dispensar por 30 dias
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
      {!rows.length && (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nenhuma recomendação ativa no momento.
        </div>
      )}
    </div>
  );
}
