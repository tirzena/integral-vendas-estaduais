/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { deleteMember } from "@/lib/team.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
export function EditMemberDialog({
  member,
  jobsOnly = false,
  assignments,
  jobRoles,
  levels,
  areas,
  onClose,
  onSaved,
}: {
  member: any | null;
  jobsOnly?: boolean;
  assignments: any[];
  jobRoles: any[];
  levels: any[];
  areas: any[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const jobsSection = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [jobDraft, setJobDraft] = useState<Record<string, string>>({});

  const initializedMember = useRef<string | null>(null);

  useEffect(() => {
    if (!member) {
      initializedMember.current = null;
      return;
    }
    if (initializedMember.current === member.id) return;
    initializedMember.current = member.id;
    setForm(member);
    setJobDraft(
      Object.fromEntries(assignments.map((a: any) => [a.job_role_id, a.job_level_id ?? "none"])),
    );
  }, [member, assignments]);

  function set(key: string, value: string) {
    setForm((f: any) => ({ ...f, [key]: value }));
  }

  async function save() {
    setSaving(true);
    const selectedRoles = jobRoles.filter((r: any) => Object.hasOwn(jobDraft, r.id));
    const selectedAreaNames = [
      ...new Set(
        selectedRoles
          .map((r: any) => areas.find((a: any) => a.id === r.area_id)?.name)
          .filter(Boolean),
      ),
    ];
    const { error } = await supabase
      .from("profiles")
      .update({
        ...(!jobsOnly ? { full_name: form.full_name, email: form.email, phone: form.phone } : {}),
        cargo: selectedRoles.map((r: any) => r.name).join(" · ") || null,
        setor: selectedAreaNames.join(" · ") || null,
      })
      .eq("id", member.id);
    if (!error) {
      const db = supabase as any;
      const { error: deleteError } = await db
        .from("member_job_assignments")
        .delete()
        .eq("user_id", member.id);
      if (!deleteError && selectedRoles.length) {
        const { error: insertError } = await db.from("member_job_assignments").insert(
          selectedRoles.map((r: any) => ({
            user_id: member.id,
            job_role_id: r.id,
            job_level_id: jobDraft[r.id] === "none" ? null : jobDraft[r.id],
          })),
        );
        if (insertError) {
          setSaving(false);
          toast.error("Não foi possível salvar os cargos: " + insertError.message);
          return;
        }
      } else if (deleteError) {
        setSaving(false);
        toast.error("Não foi possível atualizar os cargos: " + deleteError.message);
        return;
      }
    }
    setSaving(false);
    if (error) {
      toast.error("Não foi possível salvar: " + error.message);
      return;
    }
    toast.success("Membro atualizado.");
    onSaved();
    onClose();
  }

  async function remove() {
    if (
      !window.confirm(
        `Excluir definitivamente ${member.full_name || member.email}? Esta ação remove o acesso da pessoa e não pode ser desfeita.`,
      )
    )
      return;
    setDeleting(true);
    try {
      await deleteMember({ data: { userId: member.id } });
      toast.success("Membro excluído.");
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error("Não foi possível excluir: " + (e?.message ?? "erro inesperado"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={!!member} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto"
        onOpenAutoFocus={(e) => {
          if (jobsOnly) {
            e.preventDefault();
            jobsSection.current?.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {jobsOnly
              ? `Vincular cargos · ${member?.full_name || member?.email || "Membro"}`
              : "Editar membro"}
          </DialogTitle>
          <DialogDescription>
            {jobsOnly
              ? "Selecione os cargos e níveis deste membro e salve o vínculo."
              : "Atualize os dados cadastrais. O perfil de acesso e as categorias são alterados no cartão da pessoa."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {!jobsOnly && (
            <>
              <div className="grid gap-1.5">
                <Label>Nome completo</Label>
                <Input
                  value={form.full_name ?? ""}
                  onChange={(e) => set("full_name", e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>E-mail</Label>
                <Input value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Telefone interno</Label>
                <Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
              </div>
            </>
          )}
          <div
            ref={jobsSection}
            tabIndex={-1}
            className="grid gap-2 outline-none"
            aria-label="Cargos e níveis"
          >
            <Label>Cargos e níveis</Label>
            <p className="text-xs text-muted-foreground">
              Uma pessoa pode ter vários cargos. O acesso final mantém somente as permissões comuns
              entre eles.
            </p>
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border p-3">
              {jobRoles.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Nenhum cargo cadastrado. Cadastre um cargo em Cargos e permissões para vinculá-lo
                  ao membro.
                </p>
              )}
              {jobRoles.map((role: any) => {
                const selected = Object.hasOwn(jobDraft, role.id);
                const area = areas.find((a: any) => a.id === role.area_id)?.name;
                return (
                  <div key={role.id} className="grid items-center gap-2 sm:grid-cols-[1fr_180px]">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={selected}
                        onCheckedChange={(on) =>
                          setJobDraft((old) => {
                            const next = { ...old };
                            if (on) next[role.id] = "none";
                            else delete next[role.id];
                            return next;
                          })
                        }
                      />
                      <span>
                        {role.name}
                        <span className="text-muted-foreground"> · {area}</span>
                      </span>
                    </label>
                    <Select
                      value={selected ? jobDraft[role.id] : "none"}
                      disabled={!selected}
                      onValueChange={(v) => setJobDraft((old) => ({ ...old, [role.id]: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem nível</SelectItem>
                        {levels.map((level: any) => (
                          <SelectItem key={level.id} value={level.id}>
                            {level.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          {!jobsOnly && (
            <Button
              variant="destructive"
              onClick={remove}
              disabled={deleting || saving}
              className="gap-2"
            >
              <Trash2 className="size-4" />
              {deleting ? "Excluindo…" : "Excluir membro"}
            </Button>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving || deleting}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving || deleting}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
