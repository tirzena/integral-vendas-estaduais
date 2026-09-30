/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const db = supabase as any;

export function RolesPermissionsSection({ canWrite }: { canWrite: boolean }) {
  const queryClient = useQueryClient();
  const [areaName, setAreaName] = useState("");
  const [levelName, setLevelName] = useState("");
  const [roleName, setRoleName] = useState("");
  const [roleArea, setRoleArea] = useState("");
  const [selectedRole, setSelectedRole] = useState("");
  const [selectedLevel, setSelectedLevel] = useState("default");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const query = useQuery({
    queryKey: ["job-catalog"],
    queryFn: async () => {
      const [areas, levels, roles, permissions, grants] = await Promise.all([
        db.from("organization_areas").select("*").order("name"),
        db.from("job_levels").select("*").order("rank"),
        db.from("job_roles").select("*").order("name"),
        db.from("permission_catalog").select("*").order("sort_order"),
        db.from("job_role_permissions").select("*"),
      ]);
      for (const result of [areas, levels, roles, permissions, grants]) {
        if (result.error) throw result.error;
      }
      return {
        areas: areas.data ?? [],
        levels: levels.data ?? [],
        roles: roles.data ?? [],
        permissions: permissions.data ?? [],
        grants: grants.data ?? [],
      };
    },
  });

  const data = query.data;
  useEffect(() => {
    if (!selectedRole && data?.roles?.[0]) setSelectedRole(data.roles[0].id);
  }, [data?.roles, selectedRole]);

  const visibleGrants = useMemo(() => {
    if (!data || !selectedRole) return new Set<string>();
    const levelId = selectedLevel === "default" ? null : selectedLevel;
    const exact = data.grants.filter(
      (g: any) => g.job_role_id === selectedRole && g.job_level_id === levelId,
    );
    const source =
      exact.length || levelId === null
        ? exact
        : data.grants.filter((g: any) => g.job_role_id === selectedRole && g.job_level_id === null);
    return new Set(source.filter((g: any) => g.allowed).map((g: any) => g.permission_key));
  }, [data, selectedRole, selectedLevel]);

  useEffect(() => setChecked(new Set(visibleGrants)), [visibleGrants]);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["job-catalog"] });
    await queryClient.invalidateQueries({ queryKey: ["team-people"] });
  }

  async function createArea() {
    if (!areaName.trim()) return;
    const { error } = await db.from("organization_areas").insert({ name: areaName.trim() });
    if (error) return toast.error("Não foi possível criar a área: " + error.message);
    setAreaName("");
    toast.success("Área criada.");
    await refresh();
  }

  async function createLevel() {
    if (!levelName.trim()) return;
    const rank = Math.max(0, ...(data?.levels ?? []).map((l: any) => Number(l.rank))) + 10;
    const { error } = await db.from("job_levels").insert({ name: levelName.trim(), rank });
    if (error) return toast.error("Não foi possível criar o nível: " + error.message);
    setLevelName("");
    toast.success("Nível criado.");
    await refresh();
  }

  async function createRole() {
    if (!roleName.trim() || !roleArea) return toast.error("Informe a área e o nome do cargo.");
    const { data: role, error } = await db
      .from("job_roles")
      .insert({ name: roleName.trim(), area_id: roleArea })
      .select("id")
      .single();
    if (error) return toast.error("Não foi possível criar o cargo: " + error.message);
    setRoleName("");
    setSelectedRole(role.id);
    toast.success("Cargo criado.");
    await refresh();
  }

  async function remove(
    kind: "organization_areas" | "job_levels" | "job_roles",
    id: string,
    systemKey?: string,
  ) {
    if (systemKey) return toast.error("Este item padrão pode ser desativado, mas não excluído.");
    const { error } = await db.from(kind).delete().eq("id", id);
    if (error) return toast.error("Não foi possível excluir: " + error.message);
    toast.success("Item excluído.");
    await refresh();
  }

  async function savePermissions() {
    if (!selectedRole) return;
    setSaving(true);
    const levelId = selectedLevel === "default" ? null : selectedLevel;
    let del = db.from("job_role_permissions").delete().eq("job_role_id", selectedRole);
    del = levelId ? del.eq("job_level_id", levelId) : del.is("job_level_id", null);
    const { error: deleteError } = await del;
    if (deleteError) {
      setSaving(false);
      return toast.error(deleteError.message);
    }
    if (checked.size) {
      const { error } = await db.from("job_role_permissions").insert(
        [...checked].map((permission_key) => ({
          job_role_id: selectedRole,
          job_level_id: levelId,
          permission_key,
          allowed: true,
        })),
      );
      if (error) {
        setSaving(false);
        return toast.error(error.message);
      }
    }
    setSaving(false);
    toast.success("Permissões atualizadas.");
    await refresh();
  }

  if (query.isLoading)
    return <p className="text-sm text-muted-foreground">Carregando estrutura…</p>;
  if (query.error)
    return <p className="text-sm text-destructive">Não foi possível carregar áreas e cargos.</p>;

  const areaNameOf = (id: string) => data?.areas.find((a: any) => a.id === id)?.name ?? "Sem área";
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Estrutura organizacional</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-3">
          <CatalogColumn
            title="Áreas"
            value={areaName}
            setValue={setAreaName}
            onAdd={createArea}
            disabled={!canWrite}
            items={(data?.areas ?? []).map((x: any) => ({ ...x, label: x.name }))}
            onRemove={(x) => remove("organization_areas", x.id, x.system_key)}
          />
          <CatalogColumn
            title="Níveis"
            value={levelName}
            setValue={setLevelName}
            onAdd={createLevel}
            disabled={!canWrite}
            items={(data?.levels ?? []).map((x: any) => ({ ...x, label: x.name }))}
            onRemove={(x) => remove("job_levels", x.id, x.system_key)}
          />
          <div className="space-y-3">
            <Label>Cargos</Label>
            <Select value={roleArea} onValueChange={setRoleArea} disabled={!canWrite}>
              <SelectTrigger>
                <SelectValue placeholder="Área do novo cargo" />
              </SelectTrigger>
              <SelectContent>
                {data?.areas.map((a: any) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Input
                placeholder="Nome do cargo"
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
                disabled={!canWrite}
              />
              <Button size="icon" onClick={createRole} disabled={!canWrite}>
                <Plus className="size-4" />
              </Button>
            </div>
            <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
              {data?.roles.map((r: any) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-md border px-2 py-1.5 text-sm"
                >
                  <span>
                    {r.name}
                    <span className="ml-1 text-xs text-muted-foreground">
                      · {areaNameOf(r.area_id)}
                    </span>
                  </span>
                  {canWrite && !r.system_key && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => remove("job_roles", r.id, r.system_key)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4" /> Permissões por cargo e nível
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Quando uma pessoa tem vários cargos, ela mantém apenas as permissões comuns a todos
            eles.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger>
                <SelectValue placeholder="Cargo" />
              </SelectTrigger>
              <SelectContent>
                {data?.roles.map((r: any) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name} · {areaNameOf(r.area_id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedLevel} onValueChange={setSelectedLevel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Padrão do cargo</SelectItem>
                {data?.levels.map((l: any) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedLevel !== "default" &&
            !data?.grants.some(
              (g: any) => g.job_role_id === selectedRole && g.job_level_id === selectedLevel,
            ) && <Badge variant="outline">Usando permissões padrão até salvar este nível</Badge>}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data?.permissions.map((p: any) => (
              <label key={p.key} className="flex items-start gap-2 rounded-lg border p-3">
                <Checkbox
                  checked={checked.has(p.key)}
                  disabled={!canWrite}
                  onCheckedChange={(on) =>
                    setChecked((old) => {
                      const next = new Set(old);
                      if (on) next.add(p.key);
                      else next.delete(p.key);
                      return next;
                    })
                  }
                />
                <span>
                  <span className="block text-sm font-medium">{p.label}</span>
                  <span className="text-xs text-muted-foreground">{p.description}</span>
                </span>
              </label>
            ))}
          </div>
          {canWrite && (
            <Button onClick={savePermissions} disabled={saving}>
              {saving ? "Salvando…" : "Salvar permissões"}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CatalogColumn({
  title,
  value,
  setValue,
  onAdd,
  disabled,
  items,
  onRemove,
}: {
  title: string;
  value: string;
  setValue: (v: string) => void;
  onAdd: () => void;
  disabled: boolean;
  items: any[];
  onRemove: (x: any) => void;
}) {
  return (
    <div className="space-y-3">
      <Label>{title}</Label>
      <div className="flex gap-2">
        <Input
          placeholder={`Nova ${title.toLowerCase().replace(/s$/, "")}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={disabled}
        />
        <Button size="icon" onClick={onAdd} disabled={disabled}>
          <Plus className="size-4" />
        </Button>
      </div>
      <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
        {items.map((x) => (
          <div
            key={x.id}
            className="flex items-center justify-between rounded-md border px-2 py-1.5 text-sm"
          >
            <span>{x.label}</span>
            {!disabled && !x.system_key && (
              <Button variant="ghost" size="icon" onClick={() => onRemove(x)}>
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
