/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { createMemberWithDivisionAccess } from "@/lib/member-division.functions";
import { ROLE_LABELS, useCurrentUser, type AppRole } from "@/hooks/useAuth";
import { useProductScope } from "@/hooks/useProductScope";
import { useRows } from "@/lib/db";
import { CURRENCIES } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ROLES = Object.keys(ROLE_LABELS) as AppRole[];
const DIVISIONS = [["captacao", "Captação"], ["vendas_estaduais", "Vendas Estaduais"], ["lideranca_regional", "Liderança Regional"], ["distribuidores_municipais", "Distribuidores Municipais"], ["estoques", "Estoques"], ["fornecedores", "Fornecedores"], ["transportes", "Transportes"]] as const;
type Division = { system_code: (typeof DIVISIONS)[number][0]; region_code: "norte" | "nordeste" | "centro-oeste" | "sudeste" | "sul" | null; territory_uf: string | null; own_records_only: boolean; can_write: boolean };

const PERIODS = [
  { value: "day", label: "Por dia" },
  { value: "week", label: "Por semana" },
  { value: "month", label: "Por mês" },
  { value: "per_sale", label: "Por venda" },
];

type Deal = {
  key: string;
  label: string;
  product_id: string;
  category_id: string;
  comp_type: "percent" | "fixed";
  amount: string;
  currency: string;
  period: string;
};

function newDeal(): Deal {
  return {
    key: Math.random().toString(36).slice(2),
    label: "",
    product_id: "",
    category_id: "",
    comp_type: "percent",
    amount: "",
    currency: "USD",
    period: "month",
  };
}

export function AddMemberDialog() {
  const { roles: callerRoles } = useCurrentUser();
  const createMember = useServerFn(createMemberWithDivisionAccess);
  const queryClient = useQueryClient();
  const { products } = useProductScope();
  const subcategories = useRows<any>("product_categories", {
    orderBy: { column: "name", ascending: true },
    limit: 500,
  });
  const jobRoles = useRows<any>("job_roles", { orderBy: { column: "name", ascending: true } });
  const jobLevels = useRows<any>("job_levels", { orderBy: { column: "rank", ascending: true } });
  const areas = useRows<any>("organization_areas", {
    orderBy: { column: "name", ascending: true },
  });

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    cargo: "",
    setor: "",
    roles: ["vendedor"] as AppRole[],
  });
  const [productIds, setProductIds] = useState<string[]>([]);
  const [jobDraft, setJobDraft] = useState<Record<string, string>>({});
  const [deals, setDeals] = useState<Deal[]>([newDeal()]);
  const [divisions, setDivisions] = useState<Division[]>([]);

  function reset() {
    setForm({ full_name: "", email: "", phone: "", cargo: "", setor: "", roles: ["vendedor"] });
    setProductIds([]);
    setJobDraft({});
    setDeals([newDeal()]);
    setDivisions([]);
  }

  function setDeal(key: string, patch: Partial<Deal>) {
    setDeals((d) => d.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  }

  async function submit() {
    if (!form.full_name.trim()) {
      toast.error("Informe o nome do membro.");
      return;
    }
    if (!form.email.trim()) { toast.error("Informe o e-mail para criar o login e enviar o convite."); return; }
    setSaving(true);
    const selectedRoles = (jobRoles.data ?? []).filter((r: any) => Object.hasOwn(jobDraft, r.id));
    const selectedAreaNames = [
      ...new Set(
        selectedRoles
          .map((r: any) => (areas.data ?? []).find((a: any) => a.id === r.area_id)?.name)
          .filter(Boolean),
      ),
    ];
    let id: string;
    try {
      const result = await createMember({ data: {
        full_name: form.full_name.trim(), email: form.email.trim(), phone: form.phone.trim(),
        cargo: selectedRoles.map((r: any) => r.name).join(" · ") || form.cargo.trim(),
        setor: selectedAreaNames.join(" · ") || form.setor.trim(),
        roles: form.roles, access: divisions,
      } });
      id = result.id;
    } catch (error) {
      setSaving(false);
      toast.error("Não foi possível cadastrar o membro: " + (error as Error).message);
      return;
    }
    if (selectedRoles.length) {
      await (supabase as any).from("member_job_assignments").insert(
        selectedRoles.map((r: any) => ({
          user_id: id,
          job_role_id: r.id,
          job_level_id: jobDraft[r.id] === "none" ? null : jobDraft[r.id],
        })),
      );
    }

    if (productIds.length > 0) {
      await supabase
        .from("product_users")
        .insert(productIds.map((product_id) => ({ user_id: id, product_id })));
    }

    const validDeals = deals.filter((d) => d.amount !== "" && Number(d.amount) > 0);
    if (validDeals.length > 0) {
      const { error: compError } = await supabase.from("member_compensations").insert(
        validDeals.map((d) => ({
          user_id: id,
          label: d.label || null,
          product_id: d.product_id || null,
          category_id: d.category_id || null,
          comp_type: d.comp_type,
          amount: Number(d.amount),
          currency: d.currency as any,
          period: d.period,
          active: true,
        })),
      );
      if (compError) toast.error("Membro criado, mas a remuneração falhou: " + compError.message);
    }

    setSaving(false);
    toast.success("Membro cadastrado. Convite de acesso enviado por e-mail.");
    reset();
    setOpen(false);
    queryClient.invalidateQueries({ queryKey: ["team-people"] });
    queryClient.invalidateQueries({ queryKey: ["rows", "member_compensations"] });
    queryClient.invalidateQueries({ queryKey: ["people"] });
  }

  const subOptions = (productId: string) =>
    (subcategories.data ?? []).filter((c: any) => !productId || c.product_id === productId);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button className="gap-2">
          <UserPlus className="size-4" /> Adicionar membro
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cadastrar membro</DialogTitle>
          <DialogDescription>
            Preencha os dados, o perfil de acesso, as categorias em que a pessoa trabalha e quanto
            ela recebe.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Nome completo *</Label>
            <Input
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>E-mail</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Telefone interno</Label>
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Cargo</Label>
            <Input
              value={form.cargo}
              onChange={(e) => setForm({ ...form, cargo: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Setor</Label>
            <Input
              value={form.setor}
              onChange={(e) => setForm({ ...form, setor: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Perfis de acesso (selecione todos os aplicáveis)</Label>
            <div className="grid grid-cols-2 gap-2 rounded-md border p-2">
              {ROLES.filter((r) => r !== "superadmin" || callerRoles.includes("superadmin")).map((r) => (
                <label key={r} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.roles.includes(r)} onChange={(e) => setForm({ ...form, roles: e.target.checked ? [...form.roles, r] : form.roles.filter((role) => role !== r) })} />{ROLE_LABELS[r]}</label>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between"><Label>Acesso aos sistemas divisionais</Label>
            <Button type="button" size="sm" variant="outline" onClick={() => setDivisions((list) => [...list, { system_code: "vendas_estaduais", region_code: null, territory_uf: null, own_records_only: true, can_write: false }])}>Adicionar permissão</Button></div>
          <p className="text-xs text-muted-foreground">O membro recebe convite de login. “Registros próprios” limita o acesso aos dados vinculados à conta; escolha região ou estado para liberar um território inteiro.</p>
          {divisions.map((grant, index) => <div key={index} className="grid gap-2 rounded-md border p-2 sm:grid-cols-2">
            <label className="grid gap-1 text-xs">Sistema<select className="h-9 rounded-md border bg-background px-2" value={grant.system_code} onChange={(e) => setDivisions((rows) => rows.map((r, i) => i === index ? { ...r, system_code: e.target.value as Division["system_code"] } : r))}>{DIVISIONS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
            <label className="grid gap-1 text-xs">Região<select className="h-9 rounded-md border bg-background px-2" value={grant.region_code ?? ""} onChange={(e) => setDivisions((rows) => rows.map((r, i) => i === index ? { ...r, region_code: e.target.value as Division["region_code"] || null, territory_uf: null, own_records_only: false } : r))}><option value="">Todas / selecione estado</option>{["norte", "nordeste", "centro-oeste", "sudeste", "sul"].map((r) => <option key={r} value={r}>{r}</option>)}</select></label>
            <label className="grid gap-1 text-xs">Estado (UF)<input className="h-9 rounded-md border bg-background px-2" value={grant.territory_uf ?? ""} maxLength={2} placeholder="Todos" onChange={(e) => setDivisions((rows) => rows.map((r, i) => i === index ? { ...r, territory_uf: e.target.value.toUpperCase() || null, region_code: null, own_records_only: false } : r))} /></label>
            <div className="flex flex-wrap items-center gap-3 text-xs"><label><input type="checkbox" checked={grant.own_records_only} onChange={(e) => setDivisions((rows) => rows.map((r, i) => i === index ? { ...r, own_records_only: e.target.checked, region_code: e.target.checked ? null : r.region_code, territory_uf: e.target.checked ? null : r.territory_uf } : r))} /> Registros próprios</label><label><input type="checkbox" checked={grant.can_write} onChange={(e) => setDivisions((rows) => rows.map((r, i) => i === index ? { ...r, can_write: e.target.checked } : r))} /> Pode alterar</label><Button type="button" size="sm" variant="ghost" onClick={() => setDivisions((rows) => rows.filter((_, i) => i !== index))}>Remover</Button></div>
          </div>)}
        </div>

        <div className="space-y-2">
          <Label>Cargos e níveis</Label>
          <p className="text-xs text-muted-foreground">
            Marque todos os cargos da pessoa. As permissões concedidas por cada cargo se somam.
          </p>
          <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border p-3">
            {(jobRoles.data ?? []).map((role: any) => {
              const selected = Object.hasOwn(jobDraft, role.id);
              const area = (areas.data ?? []).find((a: any) => a.id === role.area_id)?.name;
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
                    value={selected ? (jobDraft[role.id] ?? "none") : "none"}
                    disabled={!selected}
                    onValueChange={(v) => setJobDraft((old) => ({ ...old, [role.id]: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem nível</SelectItem>
                      {(jobLevels.data ?? []).map((level: any) => (
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

        <div className="space-y-2">
          <Label>Categorias em que vai trabalhar</Label>
          {products.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhuma categoria cadastrada ainda.</p>
          )}
          <div className="flex flex-wrap gap-3">
            {products.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={productIds.includes(p.id)}
                  onCheckedChange={(v) =>
                    setProductIds((ids) => (v ? [...ids, p.id] : ids.filter((x) => x !== p.id)))
                  }
                />
                {p.name}
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Como essa pessoa recebe</Label>
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => setDeals((d) => [...d, newDeal()])}
            >
              <Plus className="size-4" /> Outro acordo
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            A mesma pessoa pode receber de várias formas: percentual em uma categoria, valor fixo em
            outra, por dia, semana ou mês.
          </p>
          {deals.map((d) => (
            <Card key={d.key}>
              <CardContent className="grid gap-3 pt-6 sm:grid-cols-3">
                <div className="space-y-1.5 sm:col-span-3">
                  <Label>Nome do acordo</Label>
                  <Input
                    placeholder="Comissão de vendas, fixo de marketing…"
                    value={d.label}
                    onChange={(e) => setDeal(d.key, { label: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Categoria</Label>
                  <Select
                    value={d.product_id}
                    onValueChange={(v) => setDeal(d.key, { product_id: v, category_id: "" })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Todas" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Subcategoria</Label>
                  <Select
                    value={d.category_id}
                    onValueChange={(v) => setDeal(d.key, { category_id: v })}
                    disabled={!d.product_id}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Opcional" />
                    </SelectTrigger>
                    <SelectContent>
                      {subOptions(d.product_id).map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Forma</Label>
                  <Select
                    value={d.comp_type}
                    onValueChange={(v) => setDeal(d.key, { comp_type: v as Deal["comp_type"] })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">Percentual sobre a venda</SelectItem>
                      <SelectItem value="fixed">Valor fixo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{d.comp_type === "percent" ? "Percentual (%)" : "Valor"}</Label>
                  <Input
                    type="number"
                    value={d.amount}
                    onChange={(e) => setDeal(d.key, { amount: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Moeda</Label>
                  <Select value={d.currency} onValueChange={(v) => setDeal(d.key, { currency: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Periodicidade</Label>
                  <Select value={d.period} onValueChange={(v) => setDeal(d.key, { period: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PERIODS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {deals.length > 1 && (
                  <div className="sm:col-span-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-destructive"
                      onClick={() => setDeals((list) => list.filter((x) => x.key !== d.key))}
                    >
                      <Trash2 className="size-4" /> Remover acordo
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Salvando…" : "Cadastrar membro"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
