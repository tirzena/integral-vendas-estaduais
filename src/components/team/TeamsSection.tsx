/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Team = { id: string; name: string; description: string | null; is_demo?: boolean };

/** Equipes com vínculo de membros. Ao marcar alguém que já está em outra equipe, avisamos. */
export function TeamsSection({ canWrite }: { canWrite: boolean }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<Team | null>(null);
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["teams-with-members"],
    queryFn: async () => {
      const [{ data: teams }, { data: members }, { data: people }] = await Promise.all([
        supabase.from("teams").select("*").order("name"),
        supabase.from("team_members").select("id,team_id,user_id"),
        supabase.from("profiles").select("id,full_name,email").order("full_name"),
      ]);
      return { teams: teams ?? [], members: members ?? [], people: people ?? [] };
    },
  });

  const teams = data?.teams ?? [];
  const members = data?.members ?? [];
  const people = data?.people ?? [];
  const nameOf = (id: string) => {
    const p = people.find((x: any) => x.id === id);
    return p?.full_name || p?.email || "Sem nome";
  };

  async function removeTeam(team: Team) {
    if (!window.confirm(`Excluir a equipe ${team.name}?`)) return;
    await supabase.from("team_members").delete().eq("team_id", team.id);
    const { error } = await supabase.from("teams").delete().eq("id", team.id);
    if (error) toast.error("Não foi possível excluir a equipe.");
    else {
      toast.success("Equipe excluída.");
      queryClient.invalidateQueries({ queryKey: ["teams-with-members"] });
    }
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Equipes</h2>
          <p className="text-sm text-muted-foreground">
            Agrupe pessoas por time comercial. Os times disputam o campeonato do ranking.
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-2 size-4" /> Nova equipe
          </Button>
        )}
      </div>

      {teams.length === 0 ? (
        <EmptyState
          title="Nenhuma equipe criada"
          description="Crie a primeira equipe e vincule os membros que vão competir juntos."
        />
      ) : (
        <div className="grid gap-3">
          {teams.map((t: any) => {
            const teamPeople = members.filter((m: any) => m.team_id === t.id);
            return (
              <Card
                key={t.id}
                className="cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => navigate({ to: "/equipe/$id", params: { id: t.id } })}
              >
                <CardContent className="flex flex-wrap items-start gap-4 pt-6">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-medium">
                      <Users className="size-4 text-muted-foreground" />
                      {t.name}
                      {t.is_demo && <Badge variant="outline">Fictício</Badge>}
                    </p>
                    <p className="text-sm text-muted-foreground">{t.description || "—"}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {teamPeople.length === 0 ? (
                        <span className="text-xs text-muted-foreground">
                          Nenhum membro vinculado ainda.
                        </span>
                      ) : (
                        teamPeople.map((m: any) => (
                          <Badge key={m.id} variant="secondary" className="font-normal">
                            {nameOf(m.user_id)}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>
                  {canWrite && (
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <Button variant="outline" size="icon" onClick={() => setEditing(t)}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="text-destructive"
                        onClick={() => removeTeam(t)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {(creating || editing) && (
        <TeamDialog
          team={editing}
          people={people}
          members={members}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => { for (const key of ["teams-with-members", "championship-teams", "team-detail", "member-detail"]) queryClient.invalidateQueries({queryKey:[key]}); }}
        />
      )}
    </div>
  );
}

function TeamDialog({
  team,
  people,
  members,
  onClose,
  onSaved,
}: {
  team: Team | null;
  people: any[];
  members: any[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(team?.name ?? "");
  const [description, setDescription] = useState(team?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<string[]>(
    team ? members.filter((m) => m.team_id === team.id).map((m) => m.user_id) : [],
  );

  // Onde cada pessoa já está vinculada hoje (fora desta equipe).
  const otherTeams = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const m of members) {
      if (team && m.team_id === team.id) continue;
      map.set(m.user_id, [...(map.get(m.user_id) ?? []), m.team_id]);
    }
    return map;
  }, [members, team]);

  const teamNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) map.set(m.team_id, m.team_id);
    return map;
  }, [members]);

  function toggle(userId: string, on: boolean) {
    setSelected((s) => (on ? [...s, userId] : s.filter((x) => x !== userId)));
  }

  async function save() {
    if (!name.trim()) return void toast.error("Informe o nome da equipe.");
    setSaving(true);
    let teamId = team?.id;
    if (team) {
      const { error } = await supabase
        .from("teams")
        .update({ name: name.trim(), description: description || null })
        .eq("id", team.id);
      if (error) {
        setSaving(false);
        return void toast.error("Não foi possível salvar a equipe.");
      }
    } else {
      const { data: created, error } = await supabase
        .from("teams")
        .insert({ name: name.trim(), description: description || null })
        .select("id")
        .single();
      if (error || !created) {
        setSaving(false);
        return void toast.error("Não foi possível criar a equipe.");
      }
      teamId = created.id;
    }

    const before = team ? members.filter((m) => m.team_id === team.id).map((m) => m.user_id) : [];
    const toAdd = selected.filter((id) => !before.includes(id));
    const toRemove = before.filter((id) => !selected.includes(id));
    if (toAdd.length)
      await supabase
        .from("team_members")
        .insert(toAdd.map((user_id) => ({ team_id: teamId!, user_id })));
    if (toRemove.length)
      await supabase.from("team_members").delete().eq("team_id", teamId!).in("user_id", toRemove);

    setSaving(false);
    toast.success(team ? "Equipe atualizada." : "Equipe criada.");
    onSaved();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{team ? "Editar equipe" : "Nova equipe"}</DialogTitle>
          <DialogDescription>
            Marque quem faz parte. Se a pessoa já estiver em outra equipe, o aviso aparece ao lado —
            você decide se coloca mesmo assim.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Nome da equipe *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Descrição</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Membros da equipe</Label>
            {people.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma pessoa cadastrada ainda.</p>
            )}
            {people.map((p) => {
              const others = otherTeams.get(p.id) ?? [];
              return (
                <label
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <Checkbox
                      checked={selected.includes(p.id)}
                      onCheckedChange={(v) => toggle(p.id, !!v)}
                    />
                    {p.full_name || p.email}
                  </span>
                  {others.length > 0 && (
                    <Badge variant="outline" className="shrink-0 font-normal">
                      Já está em {others.length} equipe(s)
                    </Badge>
                  )}
                </label>
              );
            })}
            {teamNames.size === 0 && null}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
