/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser, ROLE_LABELS } from "@/hooks/useAuth";
import { readAllRows } from "@/lib/read-all-rows";
import { newPolicyGoal, newPolicyRule, type PolicyRule } from "@/lib/remuneration-policy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const db = supabase as any;
const options = {
  kind: {
    commission: "Comissão",
    salary: "Salário",
    bonus: "Bonificação",
    prolabore: "Pró-labore",
    other: "Outro pagamento",
  },
  basis: {
    sale: "Venda após descontos, sem frete",
    cost: "Custo da mercadoria",
    cost_freight: "Custo da mercadoria com frete",
    profit: "Lucro após mercadoria, frete e custos variáveis",
    custom: "Base personalizada por unidade",
  },
  period: {
    per_sale: "Por venda",
    per_unit: "Por unidade",
    day: "Por dia",
    week: "Por semana",
    month: "Por mês",
  },
  metric: { units: "Unidades", revenue: "Valor vendido", orders: "Pedidos", profit: "Lucro" },
};
function Choice({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: string;
  values: Record<string, string>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-sm">
      {label}
      <select
        className="h-10 rounded-md border bg-background px-3"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {Object.entries(values).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
function Multiple({
  label,
  rows,
  selected,
  onChange,
}: {
  label: string;
  rows: any[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  return (
    <details className="rounded-md border p-3">
      <summary className="cursor-pointer text-sm font-medium">
        {label} · {selected.length} selecionado(s)
      </summary>
      <Input
        className="my-2"
        placeholder="Pesquisar"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="max-h-40 space-y-1 overflow-auto">
        {rows
          .filter((r) =>
            String(r.name ?? r.full_name)
              .toLowerCase()
              .includes(search.toLowerCase()),
          )
          .map((r) => (
            <label key={r.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(r.id)}
                onChange={(e) =>
                  onChange(
                    e.target.checked ? [...selected, r.id] : selected.filter((id) => id !== r.id),
                  )
                }
              />
              {r.name ?? r.full_name}
            </label>
          ))}
      </div>
    </details>
  );
}
const fresh = () => ({
  name: "",
  app_roles: [] as string[],
  job_role_ids: [] as string[],
  member_ids: [] as string[],
  priority: 0,
  starts_at: "",
  ends_at: "",
  active: true,
  definition: {
    payout_frequency: "month",
    payout_day: 1,
    payout_date: "",
    rules: [newPolicyRule()],
  },
});
const localTime = (value: string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat("sv-SE", {
        timeZone: "America/Sao_Paulo",
        dateStyle: "short",
        timeStyle: "short",
      })
        .format(new Date(value))
        .replace(" ", "T")
    : "";
const timestamp = (value: string) => (value ? new Date(value + "-03:00").toISOString() : null);

export function RemunerationPolicies() {
  const { userId, isAdmin } = useCurrentUser();
  const client = useQueryClient();
  const [open, setOpen] = useState(false),
    [editing, setEditing] = useState<string | null>(null),
    [draft, setDraft] = useState<any>(fresh),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false);
  const policies = useQuery({
    queryKey: ["remuneration-policies", userId],
    queryFn: async () => (await readAllRows(db.from("remuneration_policies").select("*"))).data,
  });
  const meta = useQuery({
    queryKey: ["remuneration-policy-options", userId],
    enabled: open && isAdmin,
    staleTime: 60_000,
    queryFn: async () => {
      const [jobs, members, products, categories, items] = await Promise.all([
        readAllRows(db.from("job_roles").select("id,name")),
        readAllRows(db.from("profiles").select("id,full_name").eq("is_active", true)),
        readAllRows(db.from("products").select("id,name").is("deleted_at", null)),
        readAllRows(db.from("product_categories").select("id,name,product_id")),
        readAllRows(
          db.from("inventory_items").select("id,name,product_id,category_id").eq("is_active", true),
        ),
      ]);
      return {
        jobs: jobs.data,
        members: members.data,
        products: products.data,
        categories: categories.data,
        items: items.data,
      };
    },
  });
  const initialMemberHandled = useRef(false);
  useEffect(() => {
    if (!isAdmin || initialMemberHandled.current) return;
    const member = new URLSearchParams(window.location.search).get("politicaMembro");
    if (member && /^[0-9a-f-]{36}$/i.test(member)) {
      initialMemberHandled.current = true;
      setEditing(null);
      setReason("");
      setDraft({ ...fresh(), member_ids: [member] });
      setOpen(true);
    }
  }, [isAdmin]);
  const latest = (policies.data ?? []).filter(
    (p: any) =>
      !(policies.data ?? []).some(
        (other: any) => other.series_id === p.series_id && other.version > p.version,
      ),
  );
  function edit(p?: any) {
    setEditing(p?.id ?? null);
    setReason("");
    setDraft(
      p
        ? {
            ...p,
            starts_at: localTime(p.starts_at),
            ends_at: localTime(p.ends_at),
            definition: {
              ...fresh().definition,
              ...p.definition,
              rules: p.definition.rules.map((r: any) => ({ ...newPolicyRule(), ...r })),
            },
          }
        : fresh(),
    );
    setOpen(true);
  }
  function rule(index: number, change: Partial<PolicyRule>) {
    setDraft((d: any) => ({
      ...d,
      definition: {
        ...d.definition,
        rules: d.definition.rules.map((r: any, i: number) =>
          i === index ? { ...r, ...change } : r,
        ),
      },
    }));
  }
  function goal(ri: number, gi: number, change: any) {
    rule(ri, {
      goals: draft.definition.rules[ri].goals.map((g: any, i: number) =>
        i === gi ? { ...g, ...change } : g,
      ),
    });
  }
  async function save() {
    if (!draft.name.trim() || reason.trim().length < 5)
      return void toast.error("Informe o nome da política e o motivo da alteração.");
    setBusy(true);
    try {
      const payload = {
        ...draft,
        starts_at: timestamp(draft.starts_at),
        ends_at: timestamp(draft.ends_at),
        definition: {
          ...draft.definition,
          rules: draft.definition.rules.map((r: any) => ({
            ...r,
            goals: r.goals.map((g: any) => ({
              ...g,
              starts_at: g.starts_at ? timestamp(g.starts_at.slice(0, 16)) : null,
              ends_at: g.ends_at ? timestamp(g.ends_at.slice(0, 16)) : null,
            })),
          })),
        },
      };
      const { error } = await db.rpc("remuneration_save_policy", {
        p_previous: editing,
        p_payload: payload,
        p_reason: reason,
      });
      if (error) throw error;
      await client.invalidateQueries();
      setOpen(false);
      toast.success("Política registrada com histórico de versão.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Políticas de remuneração</h2>
          <p className="text-sm text-muted-foreground">
            Definição central de pagamentos, comissões, metas e bonificações. Alterações geram uma
            nova versão e preservam os pedidos anteriores.
          </p>
        </div>
        {isAdmin && <Button onClick={() => edit()}>Nova política</Button>}
      </div>
      {policies.error ? (
        <p role="alert">Não foi possível carregar as políticas.</p>
      ) : policies.isLoading ? (
        <p>Carregando políticas…</p>
      ) : !latest.length ? (
        <p className="surface-card p-6 text-muted-foreground">
          Nenhuma política vinculada aos seus cargos ou ao seu perfil.
        </p>
      ) : (
        latest.map((p: any) => (
          <article key={p.id} className="surface-card space-y-3 p-4">
            <div className="flex justify-between gap-3">
              <div>
                <h3 className="font-semibold">
                  {p.name} · versão {p.version}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {p.active ? "Ativa" : "Inativa"} · Desde{" "}
                  {new Date(p.starts_at).toLocaleString("pt-BR")}
                  {p.ends_at
                    ? ` até ${new Date(p.ends_at).toLocaleString("pt-BR")}`
                    : " · Vigência permanente"}
                </p>
              </div>
              {isAdmin && (
                <Button variant="outline" onClick={() => edit(p)}>
                  Revisar política
                </Button>
              )}
            </div>
            {p.definition.rules.map((r: any, i: number) => (
              <p key={i} className="text-sm">
                {options.kind[r.kind as keyof typeof options.kind] ?? "Comissão"}: {r.amount}
                {r.type === "percent" ? "%" : ` ${r.currency}`} ·{" "}
                {options.basis[r.basis as keyof typeof options.basis] ?? "Venda"} ·{" "}
                {options.period[r.period as keyof typeof options.period]} · {r.goals?.length ?? 0}{" "}
                meta(s)
              </p>
            ))}
            <details>
              <summary className="cursor-pointer text-sm">Histórico de versões</summary>
              {(policies.data ?? [])
                .filter((v: any) => v.series_id === p.series_id)
                .sort((a: any, b: any) => b.version - a.version)
                .map((v: any) => (
                  <p key={v.id} className="mt-2 text-sm">
                    Versão {v.version} · {new Date(v.created_at).toLocaleString("pt-BR")} ·{" "}
                    {v.change_reason}
                  </p>
                ))}
            </details>
          </article>
        ))
      )}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!busy) setOpen(v);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Nova versão da política" : "Nova política de remuneração"}
            </DialogTitle>
          </DialogHeader>
          {meta.isLoading ? (
            <p>Carregando cargos e produtos…</p>
          ) : meta.error ? (
            <p role="alert">Não foi possível carregar os dados para configuração.</p>
          ) : (
            <div className="space-y-4">
              <label className="grid gap-1 text-sm">
                Nome da política
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <Multiple
                  label="Perfis funcionais"
                  rows={Object.entries(ROLE_LABELS).map(([id, name]) => ({ id, name }))}
                  selected={draft.app_roles ?? []}
                  onChange={(ids) => setDraft({ ...draft, app_roles: ids })}
                />
                <Multiple
                  label="Cargos abrangidos"
                  rows={meta.data?.jobs ?? []}
                  selected={draft.job_role_ids}
                  onChange={(ids) => setDraft({ ...draft, job_role_ids: ids })}
                />
                <Multiple
                  label="Membros específicos / exceção individual"
                  rows={meta.data?.members ?? []}
                  selected={draft.member_ids}
                  onChange={(ids) => setDraft({ ...draft, member_ids: ids })}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="grid gap-1 text-sm">
                  Início (Brasília)
                  <Input
                    type="datetime-local"
                    value={draft.starts_at}
                    onChange={(e) => setDraft({ ...draft, starts_at: e.target.value })}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  Fim (vazio = permanente)
                  <Input
                    type="datetime-local"
                    value={draft.ends_at}
                    onChange={(e) => setDraft({ ...draft, ends_at: e.target.value })}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  Prioridade entre políticas equivalentes
                  <Input
                    type="number"
                    value={draft.priority}
                    onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })}
                  />
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                Produto prevalece sobre subcategoria, categoria e regra geral. No mesmo escopo, a
                exceção individual prevalece sobre a política do cargo; a temporária prevalece
                durante sua vigência. Regras de mesma prioridade se acumulam.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Choice
                  label="Calendário de pagamento"
                  value={draft.definition.payout_frequency}
                  values={{
                    day: "Diário",
                    week: "Semanal",
                    month: "Mensal",
                    custom: "Data definida",
                  }}
                  onChange={(v) =>
                    setDraft({ ...draft, definition: { ...draft.definition, payout_frequency: v } })
                  }
                />
                {draft.definition.payout_frequency === "custom" ? (
                  <label className="grid gap-1 text-sm">
                    Data de pagamento
                    <Input
                      type="date"
                      value={draft.definition.payout_date ?? ""}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          definition: { ...draft.definition, payout_date: e.target.value },
                        })
                      }
                    />
                  </label>
                ) : (
                  draft.definition.payout_frequency !== "day" && (
                    <label className="grid gap-1 text-sm">
                      {draft.definition.payout_frequency === "week"
                        ? "Dia da semana (1 = segunda, 7 = domingo)"
                        : "Dia do mês"}
                      <Input
                        type="number"
                        min={1}
                        max={draft.definition.payout_frequency === "week" ? 7 : 31}
                        value={draft.definition.payout_day}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            definition: { ...draft.definition, payout_day: Number(e.target.value) },
                          })
                        }
                      />
                    </label>
                  )
                )}
              </div>
              {draft.definition.rules.map((r: PolicyRule, ri: number) => (
                <fieldset key={ri} className="space-y-3 rounded-lg border p-4">
                  <legend className="px-2 font-semibold">Regra {ri + 1}</legend>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Choice
                      label="Pagamento"
                      value={r.kind}
                      values={options.kind}
                      onChange={(v) =>
                        rule(ri, {
                          kind: v as PolicyRule["kind"],
                          ...(["salary", "prolabore", "other"].includes(v)
                            ? { type: "fixed", period: "month" }
                            : { period: "per_sale" }),
                        })
                      }
                    />
                    <Choice
                      label="Cálculo"
                      value={r.type}
                      values={
                        ["salary", "prolabore", "other"].includes(r.kind)
                          ? { fixed: "Valor fixo" }
                          : { percent: "Percentual", fixed: "Valor fixo" }
                      }
                      onChange={(v) =>
                        rule(ri, {
                          type: v as PolicyRule["type"],
                          ...(v === "percent" ? { period: "per_sale" } : {}),
                        })
                      }
                    />
                    <label className="grid gap-1 text-sm">
                      {r.type === "percent" ? "Percentual (%)" : "Valor"}
                      <Input
                        type="number"
                        min={0}
                        max={r.type === "percent" ? 100 : undefined}
                        step="0.01"
                        value={r.amount}
                        onChange={(e) => rule(ri, { amount: Number(e.target.value) })}
                      />
                    </label>
                    <Choice
                      label="Base de cálculo"
                      value={r.basis}
                      values={options.basis}
                      onChange={(v) => rule(ri, { basis: v as PolicyRule["basis"] })}
                    />
                    <Choice
                      label="Moeda dos valores fixos e metas"
                      value={r.currency}
                      values={{ BRL: "Real", USD: "Dólar", PYG: "Guarani" }}
                      onChange={(v) => rule(ri, { currency: v as PolicyRule["currency"] })}
                    />
                    <Choice
                      label="Periodicidade"
                      value={r.period}
                      values={Object.fromEntries(
                        Object.entries(options.period).filter(([key]) =>
                          r.kind === "commission" || r.type === "percent"
                            ? ["per_sale", "per_unit"].includes(key)
                            : ["salary", "prolabore", "other"].includes(r.kind)
                              ? ["day", "week", "month"].includes(key)
                              : true,
                        ),
                      )}
                      onChange={(v) => rule(ri, { period: v as PolicyRule["period"] })}
                    />
                  </div>
                  {r.basis === "custom" && (
                    <label className="grid gap-1 text-sm">
                      Valor da base por unidade ({r.currency})
                      <Input
                        type="number"
                        min={0}
                        value={r.basis_value ?? 0}
                        onChange={(e) => rule(ri, { basis_value: Number(e.target.value) })}
                      />
                    </label>
                  )}
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Multiple
                      label="Categorias"
                      rows={meta.data?.products ?? []}
                      selected={r.product_ids}
                      onChange={(ids) => rule(ri, { product_ids: ids })}
                    />
                    <Multiple
                      label="Subcategorias"
                      rows={meta.data?.categories ?? []}
                      selected={r.category_ids}
                      onChange={(ids) => rule(ri, { category_ids: ids })}
                    />
                    <Multiple
                      label="Produtos"
                      rows={meta.data?.items ?? []}
                      selected={r.item_ids}
                      onChange={(ids) => rule(ri, { item_ids: ids })}
                    />
                  </div>
                  <Choice
                    label="Combinação de metas"
                    value={r.combination}
                    values={{
                      max: "Maior remuneração entre time e individual",
                      sum: "Somar os aumentos sobre o padrão",
                      sum_rates: "Somar as taxas de time e individual atingidas",
                      individual: "Considerar somente a meta individual",
                    }}
                    onChange={(v) => rule(ri, { combination: v as PolicyRule["combination"] })}
                  />
                  {r.goals.map((g, gi) => (
                    <div key={gi} className="space-y-3 rounded-md bg-muted/40 p-3">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <Choice
                          label="Meta"
                          value={g.scope}
                          values={{ individual: "Individual", team: "Time" }}
                          onChange={(v) => goal(ri, gi, { scope: v })}
                        />
                        <Choice
                          label="Medir por"
                          value={g.metric}
                          values={options.metric}
                          onChange={(v) => goal(ri, gi, { metric: v })}
                        />
                        <Choice
                          label="Período"
                          value={g.period}
                          values={{
                            day: "Diário",
                            week: "Semanal",
                            month: "Mensal",
                            custom: "Definir início e fim",
                          }}
                          onChange={(v) => goal(ri, gi, { period: v })}
                        />
                      </div>
                      {g.scope === "team" && (
                        <Multiple
                          label="Participantes do time"
                          rows={meta.data?.members ?? []}
                          selected={g.member_ids}
                          onChange={(ids) => goal(ri, gi, { member_ids: ids })}
                        />
                      )}
                      {g.period === "custom" && (
                        <div className="grid grid-cols-2 gap-3">
                          {["starts_at", "ends_at"].map((key) => (
                            <label key={key} className="grid gap-1 text-sm">
                              {key === "starts_at" ? "Início" : "Fim"} (Brasília)
                              <Input
                                type="datetime-local"
                                value={(g as any)[key]?.slice(0, 16) ?? ""}
                                onChange={(e) => goal(ri, gi, { [key]: e.target.value })}
                              />
                            </label>
                          ))}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-3 text-sm">
                        {[
                          ["approved", "Pedidos aprovados"],
                          ["partial", "Com pagamento confirmado"],
                          ["paid", "Totalmente pagos"],
                        ].map(([key, label]) => (
                          <label key={key} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={g.statuses.includes(key!)}
                              onChange={(e) =>
                                goal(ri, gi, {
                                  statuses: e.target.checked
                                    ? [...g.statuses, key]
                                    : g.statuses.filter((s) => s !== key),
                                })
                              }
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                      <Choice
                        label="Condições de elegibilidade"
                        value={g.conditions}
                        values={{
                          any: "Qualquer condição selecionada",
                          all: "Todas as condições selecionadas",
                        }}
                        onChange={(v) => goal(ri, gi, { conditions: v })}
                      />
                      <p className="text-xs text-muted-foreground">
                        Cada pedido conta uma vez. Quando a meta considera apenas recebimentos,
                        unidades e valores são proporcionais ao valor confirmado. A faixa substitui
                        a remuneração anterior em todo o período elegível.
                      </p>
                      {g.tiers.map((t, ti) => (
                        <div key={ti} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                          <label className="text-xs">
                            A partir de
                            <Input
                              type="number"
                              min={0}
                              value={t.threshold}
                              onChange={(e) =>
                                goal(ri, gi, {
                                  tiers: g.tiers.map((v, i) =>
                                    i === ti ? { ...v, threshold: Number(e.target.value) } : v,
                                  ),
                                })
                              }
                            />
                          </label>
                          <label className="text-xs">
                            Nova remuneração ({r.type === "percent" ? "%" : r.currency})
                            <Input
                              type="number"
                              min={0}
                              max={r.type === "percent" ? 100 : undefined}
                              value={t.amount}
                              onChange={(e) =>
                                goal(ri, gi, {
                                  tiers: g.tiers.map((v, i) =>
                                    i === ti ? { ...v, amount: Number(e.target.value) } : v,
                                  ),
                                })
                              }
                            />
                          </label>
                          <Button
                            variant="ghost"
                            onClick={() =>
                              goal(ri, gi, { tiers: g.tiers.filter((_, i) => i !== ti) })
                            }
                          >
                            Remover
                          </Button>
                        </div>
                      ))}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() =>
                            goal(ri, gi, {
                              tiers: [
                                ...g.tiers,
                                {
                                  threshold: (g.tiers.at(-1)?.threshold ?? 0) + 1,
                                  amount: r.amount,
                                },
                              ],
                            })
                          }
                        >
                          Adicionar faixa
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => rule(ri, { goals: r.goals.filter((_, i) => i !== gi) })}
                        >
                          Remover meta
                        </Button>
                      </div>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => rule(ri, { goals: [...r.goals, newPolicyGoal()] })}
                    >
                      Adicionar meta
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          definition: {
                            ...draft.definition,
                            rules: draft.definition.rules.filter((_: any, i: number) => i !== ri),
                          },
                        })
                      }
                    >
                      Remover regra
                    </Button>
                  </div>
                </fieldset>
              ))}
              <Button
                variant="outline"
                onClick={() =>
                  setDraft({
                    ...draft,
                    definition: {
                      ...draft.definition,
                      rules: [...draft.definition.rules, newPolicyRule()],
                    },
                  })
                }
              >
                Adicionar regra de pagamento
              </Button>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
                />
                Política ativa
              </label>
              <label className="grid gap-1 text-sm">
                Motivo do cadastro ou da alteração
                <Input value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>
              <div className="flex justify-end gap-2">
                <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button disabled={busy || !isAdmin} onClick={save}>
                  {busy ? "Registrando…" : "Salvar política e registrar versão"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
