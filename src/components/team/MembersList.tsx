/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCurrentUser, ROLE_LABELS, type AppRole } from "@/hooks/useAuth";
import { useProductScope } from "@/hooks/useProductScope";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, initials } from "@/lib/format";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Named = { id: string; name: string };
type JobRole = Named & { area_id: string | null };
type Assignment = {
  id: string;
  user_id: string;
  job_role_id: string;
  job_level_id: string | null;
  status: string;
};
type Job = Assignment & {
  job: JobRole | undefined;
  level: Named | undefined;
  area: Named | undefined;
};
type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  cargo: string | null;
  setor: string | null;
  is_active: boolean;
  is_demo: boolean;
  avatar_url: string | null;
  last_access: string | null;
};
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim();

/** Each page uses stable ordering; a server row limit must not hide members. */
async function pages<T>(makeQuery: () => any): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await makeQuery().range(offset, offset + 499);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return rows;
  }
}

export function MembersList() {
  const { userId } = useCurrentUser();
  const { products } = useProductScope();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("todos");
  const [jobRole, setJobRole] = useState("todos");
  const [level, setLevel] = useState("todos");
  const [area, setArea] = useState("todos");
  const [category, setCategory] = useState("todos");
  const [status, setStatus] = useState("todos");
  const query = useQuery({
    queryKey: ["team-people", userId, "read-only"],
    enabled: !!userId,
    queryFn: async () => {
      const [profiles, roles, links, assignments, jobRoles, levels, areas] =
        await Promise.all([
          pages<Profile>(() =>
            supabase
              .from("profiles")
              .select(
                "id,full_name,email,cargo,setor,is_active,is_demo,avatar_url,last_access",
              )
              .order("id"),
          ),
          pages<{ user_id: string; role: AppRole }>(() =>
            supabase
              .from("user_roles")
              .select("user_id,role")
              .order("user_id")
              .order("role"),
          ),
          pages<{ user_id: string; product_id: string }>(() =>
            supabase
              .from("product_users")
              .select("user_id,product_id")
              .order("user_id")
              .order("product_id"),
          ),
          pages<Assignment>(() =>
            (supabase as any)
              .from("member_job_assignments")
              .select("id,user_id,job_role_id,job_level_id,status")
              .order("id"),
          ),
          pages<JobRole>(() =>
            (supabase as any)
              .from("job_roles")
              .select("id,name,area_id")
              .order("id"),
          ),
          pages<Named>(() =>
            (supabase as any).from("job_levels").select("id,name").order("id"),
          ),
          pages<Named>(() =>
            (supabase as any)
              .from("organization_areas")
              .select("id,name")
              .order("id"),
          ),
        ]);
      return { profiles, roles, links, assignments, jobRoles, levels, areas };
    },
    staleTime: 60_000,
  });
  const members = useMemo(() => {
    const data = query.data;
    if (!data) return [];
    const jobsById = new Map(data.jobRoles.map((r) => [r.id, r]));
    const levelsById = new Map(data.levels.map((r) => [r.id, r]));
    const areasById = new Map(data.areas.map((r) => [r.id, r]));
    const rolesByUser = new Map<string, AppRole[]>();
    const linksByUser = new Map<string, Set<string>>();
    const jobsByUser = new Map<string, Job[]>();
    for (const r of data.roles)
      rolesByUser.set(r.user_id, [
        ...(rolesByUser.get(r.user_id) ?? []),
        r.role,
      ]);
    for (const r of data.links) {
      if (!linksByUser.has(r.user_id)) linksByUser.set(r.user_id, new Set());
      linksByUser.get(r.user_id)!.add(r.product_id);
    }
    for (const a of data.assignments) {
      if (
        a.status === "inactive" ||
        a.status === "inativo" ||
        a.status === "ended"
      )
        continue;
      const job = jobsById.get(a.job_role_id);
      const entry = {
        ...a,
        job,
        level: levelsById.get(a.job_level_id ?? ""),
        area: areasById.get(job?.area_id ?? ""),
      };
      jobsByUser.set(a.user_id, [...(jobsByUser.get(a.user_id) ?? []), entry]);
    }
    return data.profiles
      .map((p) => ({
        ...p,
        roles: rolesByUser.get(p.id) ?? [],
        categories: linksByUser.get(p.id) ?? new Set<string>(),
        jobs: jobsByUser.get(p.id) ?? [],
      }))
      .sort((a, b) =>
        (a.full_name || a.email || "").localeCompare(
          b.full_name || b.email || "",
          "pt-BR",
        ),
      );
  }, [query.data]);
  const visible = members.filter(
    (m) =>
      normalize(
        [
          m.full_name,
          m.email,
          m.cargo,
          m.setor,
          ...m.jobs.flatMap((j) => [j.job?.name, j.level?.name, j.area?.name]),
        ]
          .filter(Boolean)
          .join(" "),
      ).includes(normalize(search)) &&
      (role === "todos" || m.roles.includes(role as AppRole)) &&
      (jobRole === "todos" || m.jobs.some((j) => j.job_role_id === jobRole)) &&
      (level === "todos" || m.jobs.some((j) => j.job_level_id === level)) &&
      (area === "todos" || m.jobs.some((j) => j.job?.area_id === area)) &&
      (category === "todos" || m.categories.has(category)) &&
      (status === "todos" || m.is_active === (status === "ativo")),
  );
  const select = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    options: { id: string; name: string }[],
  ) => (
    <label className="grid gap-1 text-xs text-muted-foreground">
      {label}
      <select
        className="h-10 max-w-full rounded-md border bg-background px-3 text-sm text-foreground"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="todos">Todos</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
  if (query.isPending)
    return <p className="text-sm text-muted-foreground">Carregando membros…</p>;
  if (query.isError)
    return (
      <div role="alert" className="rounded-xl border p-6">
        <p>Não foi possível carregar a lista de membros.</p>
        <Button
          className="mt-3"
          variant="outline"
          onClick={() => void query.refetch()}
        >
          Tentar novamente
        </Button>
      </div>
    );
  return (
    <div className="space-y-4">
      <label className="grid gap-1 text-sm">
        Pesquisar membro
        <Input
          placeholder="Nome, e-mail, cargo, nível ou setor"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {select(
          "Perfil de acesso",
          role,
          setRole,
          Object.entries(ROLE_LABELS).map(([id, name]) => ({ id, name })),
        )}
        {select("Cargo", jobRole, setJobRole, query.data?.jobRoles ?? [])}
        {select("Nível", level, setLevel, query.data?.levels ?? [])}
        {select("Setor", area, setArea, query.data?.areas ?? [])}
        {select("Categoria principal", category, setCategory, products)}
        {select("Situação", status, setStatus, [
          { id: "ativo", name: "Ativo" },
          { id: "inativo", name: "Inativo" },
        ])}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <p>
          {visible.length} de {members.length} membros acessíveis
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSearch("");
            setRole("todos");
            setJobRole("todos");
            setLevel("todos");
            setArea("todos");
            setCategory("todos");
            setStatus("todos");
          }}
        >
          Limpar filtros
        </Button>
      </div>
      {!visible.length && (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nenhum membro encontrado.
        </p>
      )}
      {visible.map((m) => {
        const categories = products.filter((p) => m.categories.has(p.id));
        const sectors =
          [...new Set(m.jobs.map((j) => j.area?.name).filter(Boolean))].join(
            " · ",
          ) ||
          m.setor ||
          "Sem setor";
        return (
          <Link
            key={m.id}
            to="/equipe/$id"
            params={{ id: m.id }}
            className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Card className="transition-shadow hover:shadow-md">
              <CardContent className="flex gap-4 pt-6">
                <Avatar className="size-11 shrink-0">
                  <AvatarImage src={m.avatar_url ?? undefined} />
                  <AvatarFallback>
                    {initials(m.full_name || m.email || "?")}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="break-words font-medium">
                      {m.full_name || m.email}
                    </span>
                    <Badge variant="outline">
                      {m.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                    {m.is_demo && <Badge variant="outline">Fictício</Badge>}
                  </div>
                  <p className="break-words text-sm text-muted-foreground">
                    {m.email} · {sectors}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {m.roles.map((r) => (
                      <Badge key={r} variant="secondary">
                        {ROLE_LABELS[r]}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {m.jobs.map((j) => (
                      <Badge key={j.id} variant="outline">
                        {j.job?.name || "Cargo"}
                        {j.level ? " · " + j.level.name : ""}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Categorias:{" "}
                    {categories.map((p) => p.name).join(" · ") || "Sem vínculo"}{" "}
                    · Último acesso: {formatDate(m.last_access)}
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
