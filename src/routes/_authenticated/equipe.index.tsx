import { EditMemberDialog } from "@/components/team/EditMemberDialog";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { RouteGuard } from "@/components/common/RouteGuard";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser, ROLE_LABELS, type AppRole } from "@/hooks/useAuth";
import { useProductScope } from "@/hooks/useProductScope";
import { formatDate, initials } from "@/lib/format";
import { PageHeader, EmptyState } from "@/components/common/PageHeader";
import { AddMemberDialog } from "@/components/team/AddMemberDialog";
import { TeamsSection } from "@/components/team/TeamsSection";
import { RolesPermissionsSection } from "@/components/team/RolesPermissionsSection";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trash2 } from "lucide-react";
import { deleteMember } from "@/lib/team.functions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/equipe/")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab:
      search.tab === "equipes" || search.tab === "cargos" || search.tab === "pessoas"
        ? search.tab
        : "pessoas",
  }),
  head: () => ({
    meta: [
      { title: "Membros — OS" },
      {
        name: "description",
        content: "Perfis de acesso, equipes e vínculo de vendedores a produtos.",
      },
      { property: "og:title", content: "Membros — OS" },
      { property: "og:description", content: "Perfis de acesso, equipes e produtos por vendedor." },
    ],
  }),
  component: GuardedEquipe,
});

const ROLES = Object.keys(ROLE_LABELS) as AppRole[];

function Equipe() {
  const { isAdmin } = useCurrentUser();
  const search = Route.useSearch();
  const [tab, setTab] = useState(search.tab);

  useEffect(() => setTab(search.tab), [search.tab]);

  return (
    <div>
      <PageHeader
        title="Membros"
        description="Perfis de acesso, equipes e categorias de cada pessoa."
        actions={isAdmin && tab === "pessoas" ? <AddMemberDialog /> : undefined}
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto w-full justify-start overflow-x-auto p-1 sm:w-auto">
          <TabsTrigger value="pessoas">Pessoas</TabsTrigger>
          <TabsTrigger value="equipes">Equipes</TabsTrigger>
          <TabsTrigger value="cargos">Cargos e permissões</TabsTrigger>
          <TabsTrigger value="hierarquia" asChild>
            <Link to="/equipe/hierarquia">Hierarquia</Link>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="pessoas" className="pt-4">
          <People canManage={isAdmin} />
        </TabsContent>
        <TabsContent value="equipes" className="pt-4">
          <TeamsSection canWrite={isAdmin} />
        </TabsContent>
        <TabsContent value="cargos" className="pt-4">
          <RolesPermissionsSection canWrite={isAdmin} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function People({ canManage }: { canManage: boolean }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { products } = useProductScope();
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [editingJobs, setEditingJobs] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["team-people"],
    queryFn: async () => {
      const [
        { data: profiles },
        { data: roles },
        { data: links },
        assignments,
        jobRoles,
        levels,
        areas,
      ] = await Promise.all([
        supabase.from("profiles").select("*").order("full_name"),
        supabase.from("user_roles").select("user_id,role"),
        supabase.from("product_users").select("user_id,product_id"),
        (supabase as any).from("member_job_assignments").select("*"),
        (supabase as any).from("job_roles").select("*"),
        (supabase as any).from("job_levels").select("*"),
        (supabase as any).from("organization_areas").select("*"),
      ]);
      return {
        profiles: profiles ?? [],
        roles: roles ?? [],
        links: links ?? [],
        assignments: assignments.data ?? [],
        jobRoles: jobRoles.data ?? [],
        levels: levels.data ?? [],
        areas: areas.data ?? [],
      };
    },
  });

  async function changeRole(userId: string, role: AppRole) {
    setBusy(userId);
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
    if (!error) await supabase.from("user_roles").delete().eq("user_id", userId).neq("role", role);
    setBusy(null);
    if (error) {
      const denied = /row-level security/i.test(error.message);
      toast.error(
        denied
          ? "Você não tem permissão para alterar perfis de acesso."
          : "Não foi possível alterar o perfil: " + error.message,
      );
    } else toast.success("Perfil atualizado.");
    queryClient.invalidateQueries({ queryKey: ["team-people"] });
  }

  async function toggleProduct(userId: string, productId: string, on: boolean) {
    if (on) {
      const { error } = await supabase
        .from("product_users")
        .insert({ user_id: userId, product_id: productId });
      if (error) toast.error("Não foi possível vincular o produto.");
    } else {
      await supabase
        .from("product_users")
        .delete()
        .eq("user_id", userId)
        .eq("product_id", productId);
    }
    queryClient.invalidateQueries({ queryKey: ["team-people"] });
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  const people = data?.profiles ?? [];
  if (people.length === 0)
    return (
      <EmptyState
        title="Nenhuma pessoa cadastrada"
        description="Convide alguém para criar uma conta."
      />
    );

  return (
    <div className="grid gap-3">
      {people.map((p: any) => {
        const role = (data?.roles ?? []).find((r: any) => r.user_id === p.id)?.role as AppRole;
        const jobs = (data?.assignments ?? [])
          .filter((a: any) => a.user_id === p.id)
          .map((a: any) => ({
            ...a,
            role: (data?.jobRoles ?? []).find((r: any) => r.id === a.job_role_id),
            level: (data?.levels ?? []).find((l: any) => l.id === a.job_level_id),
          }));
        const linked = new Set(
          (data?.links ?? []).filter((l: any) => l.user_id === p.id).map((l: any) => l.product_id),
        );
        return (
          <Card
            key={p.id}
            className="cursor-pointer transition-shadow hover:shadow-md"
            onClick={() => navigate({ to: "/equipe/$id", params: { id: p.id } })}
          >
            <CardContent className="flex flex-wrap items-center gap-4 pt-6">
              <Avatar className="size-11">
                <AvatarImage src={p.avatar_url ?? undefined} />
                <AvatarFallback>{initials(p.full_name ?? p.email)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate font-medium">
                  <Link to="/equipe/$id" params={{ id: p.id }} className="hover:underline">
                    {p.full_name || p.email}
                  </Link>
                  {p.is_demo && <Badge variant="outline">Fictício</Badge>}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {p.email} · último acesso {formatDate(p.last_access)}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {jobs.length ? (
                    jobs.map((j: any) => (
                      <button
                        key={j.id}
                        type="button"
                        disabled={!canManage}
                        aria-label={`Alterar cargo de ${p.full_name || p.email}: ${j.role?.name ?? "Cargo"}`}
                        className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingJobs(true);
                          setEditing(p);
                        }}
                      >
                        <Badge variant="secondary" className="font-normal hover:bg-secondary/80">
                          {j.role?.name ?? "Cargo"}
                          {j.level ? ` · ${j.level.name}` : ""}
                        </Badge>
                      </button>
                    ))
                  ) : (
                    <button
                      type="button"
                      disabled={!canManage}
                      aria-label={`Vincular cargo a ${p.full_name || p.email}`}
                      className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingJobs(true);
                        setEditing(p);
                      }}
                    >
                      <Badge variant="outline" className="hover:bg-accent">
                        Sem cargo
                      </Badge>
                    </button>
                  )}
                </div>
              </div>
              <div onClick={(e) => e.stopPropagation()}>
                {canManage && (
                  <Button
                    variant="outline"
                    className="mb-2"
                    onClick={() => {
                      setEditingJobs(false);
                      setEditing(p);
                    }}
                  >
                    Editar membro
                  </Button>
                )}
                <Select
                  value={role ?? ""}
                  disabled={!canManage || busy === p.id}
                  onValueChange={(v) => changeRole(p.id, v as AppRole)}
                >
                  <SelectTrigger className="w-52">
                    <SelectValue placeholder="Perfil de acesso" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div
                className="flex w-full flex-wrap gap-3 border-t pt-3"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="text-xs text-muted-foreground">Produtos:</span>
                {products.length === 0 && (
                  <span className="text-xs text-muted-foreground">Nenhum produto cadastrado.</span>
                )}
                {products.map((prod) => (
                  <label key={prod.id} className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={linked.has(prod.id)}
                      disabled={!canManage}
                      onCheckedChange={(v) => toggleProduct(p.id, prod.id, !!v)}
                    />
                    {prod.name}
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
      {!canManage && (
        <p className="text-xs text-muted-foreground">
          Apenas administradores podem alterar perfis e vínculos de produto.
        </p>
      )}
      <EditMemberDialog
        member={editing}
        jobsOnly={editingJobs}
        assignments={(data?.assignments ?? []).filter((a: any) => a.user_id === editing?.id)}
        jobRoles={data?.jobRoles ?? []}
        levels={data?.levels ?? []}
        areas={data?.areas ?? []}
        onClose={() => setEditing(null)}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["team-people"] })}
      />
    </div>
  );
}

function GuardedEquipe() {
  return (
    <RouteGuard capability="manage_team">
      <Equipe />
    </RouteGuard>
  );
}
