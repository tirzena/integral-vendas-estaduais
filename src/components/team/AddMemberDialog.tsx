/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createMemberWithDivisionAccess } from "@/lib/member-division.functions";
import { ROLE_LABELS, useCurrentUser, type AppRole } from "@/hooks/useAuth";
import { useProductScope } from "@/hooks/useProductScope";
import { useRows } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";

const steps = [
  "Dados pessoais",
  "Cargos, setores e níveis",
  "Permissões e sistemas",
  "Categorias, produtos e estoques",
  "Remuneração e resumo",
];
const systems = [
  ["vendas_estaduais", "Vendas Estaduais"],
  ["lideranca_regional", "Liderança Regional"],
  ["distribuidores_municipais", "Distribuidores Municipais"],
  ["estoques", "Estoques"],
  ["fornecedores", "Fornecedores"],
  ["transportes", "Transportes"],
  ["captacao", "Captação"],
];
const field = "h-10 rounded-md border bg-background px-3 text-sm";
const deal = () => ({
  label: "",
  product_id: "",
  category_id: "",
  item_id: "",
  notes: "",
  comp_type: "percent" as "percent" | "fixed",
  amount: "",
  currency: "USD" as "USD" | "BRL" | "PYG",
  period: "per_sale" as "per_sale" | "day" | "week" | "month",
});
export function AddMemberDialog() {
  const caller = useCurrentUser(),
    { products } = useProductScope(),
    client = useQueryClient(),
    create = useServerFn(createMemberWithDivisionAccess);
  const [open, setOpen] = useState(false),
    [step, setStep] = useState(0),
    [saving, setSaving] = useState(false),
    [activation, setActivation] = useState("");
  const [generalAccess, setGeneralAccess] = useState(false);
  const [person, setPerson] = useState({ full_name: "", email: "", phone: "" });
  const [roles, setRoles] = useState<AppRole[]>(["vendedor"]),
    [jobs, setJobs] = useState<Record<string, string>>({});
  const [grants, setGrants] = useState<any[]>([]),
    [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<string[]>([]),
    [excludedCategories, setExcludedCategories] = useState<string[]>([]),
    [excludedItems, setExcludedItems] = useState<string[]>([]),
    [warehouses, setWarehouses] = useState<string[]>([]),
    [deals, setDeals] = useState([deal()]);
  const categories = useRows<any>("product_categories", {
      enabled: open,
      limit: 10000,
    }),
    items = useRows<any>("inventory_items", {
      enabled: open,
      limit: 10000,
      filter: { is_active: true },
    });
  const stocks = useRows<any>("warehouses", {
      enabled: open,
      filter: { is_active: true },
    }),
    catalog = useRows<any>("permission_catalog", {
      enabled: open,
      orderBy: { column: "sort_order", ascending: true },
    });
  const jobRoles = useRows<any>("job_roles", {
      enabled: open,
      filter: { active: true },
    }),
    levels = useRows<any>("job_levels", { enabled: open }),
    areas = useRows<any>("organization_areas", { enabled: open });
  const roleRules = useRows<any>("job_role_permissions", {
    enabled: open,
    limit: 10000,
  });
  const selectedJobs = (jobRoles.data ?? []).filter((r) => r.id in jobs);
  const sectors = [
    ...new Set(
      selectedJobs
        .map((r) => (areas.data ?? []).find((a) => a.id === r.area_id)?.name)
        .filter(Boolean),
    ),
  ].join(" · ");
  const toggle = (list: string[], id: string, on: boolean) =>
    on ? [...new Set([...list, id])] : list.filter((x) => x !== id);
  const fieldLabel = (title: string, element: React.ReactNode) => (
    <label className="grid gap-1 text-sm">
      {title}
      {element}
    </label>
  );
  function reset() {
    setStep(0);
    setGeneralAccess(false);
    setPerson({ full_name: "", email: "", phone: "" });
    setRoles(["vendedor"]);
    setJobs({});
    setGrants([]);
    setOverrides({});
    setSelected([]);
    setExcludedCategories([]);
    setExcludedItems([]);
    setWarehouses([]);
    setDeals([deal()]);
    setActivation("");
  }
  function next() {
    if (step === 0 && (!person.full_name.trim() || !/^\S+@\S+\.\S+$/.test(person.email)))
      return void toast.error("Informe nome e e-mail válidos.");
    if (step === 1 && !roles.length) return void toast.error("Selecione um perfil de acesso.");
    if (step === 2 && !generalAccess && !roles.includes("superadmin") && !grants.length)
      return void toast.error("Selecione ao menos um sistema para o membro acessar.");
    setStep(Math.min(4, step + 1));
  }
  async function submit() {
    setSaving(true);
    try {
      const result = await create({
        data: {
          ...person,
          roles,
          general_access: generalAccess || roles.includes("superadmin"),
          access: grants,
          cargo: selectedJobs.map((r) => r.name).join(" · "),
          setor: sectors,
          product_ids: selected,
          warehouse_ids: warehouses,
          excluded_category_ids: excludedCategories,
          excluded_item_ids: excludedItems,
          permission_overrides: overrides,
          jobs: Object.entries(jobs).map(([job_role_id, level]) => ({
            job_role_id,
            job_level_id: level || null,
          })),
          deals: deals
            .filter((d) => d.amount !== "")
            .map((d) => ({ ...d, amount: Number(d.amount) })),
        },
      });
      setActivation(result.activationLink);
      toast.success("Cadastro completo. Copie o link individual de ativação.");
      await client.invalidateQueries();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (saving) return;
        setOpen(value);
        if (!value) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>Adicionar membro</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cadastrar membro · {step + 1}/5</DialogTitle>
        </DialogHeader>
        {activation ? (
          <div className="space-y-3">
            <p>
              Cadastro concluído. O membro define a própria senha pelo link individual de ativação.
            </p>
            <Input readOnly value={activation} />
            <Button
              onClick={async () => {
                await navigator.clipboard.writeText(activation);
                toast.success("Link copiado.");
              }}
            >
              Copiar link de ativação
            </Button>
          </div>
        ) : (
          <>
            <ol className="flex flex-wrap gap-2 text-xs">
              {steps.map((s, i) => (
                <li
                  key={s}
                  className={i === step ? "font-bold text-primary" : "text-muted-foreground"}
                >
                  {i + 1}. {s}
                </li>
              ))}
            </ol>
            {step === 0 && (
              <div className="grid gap-4 sm:grid-cols-2">
                {Object.entries(person).map(([key, value]) =>
                  fieldLabel(
                    key === "full_name"
                      ? "Nome completo *"
                      : key === "email"
                        ? "E-mail *"
                        : "Telefone",
                    <Input
                      key={key}
                      type={key === "email" ? "email" : "text"}
                      value={value}
                      onChange={(e) => setPerson({ ...person, [key]: e.target.value })}
                    />,
                  ),
                )}
                <p className="text-sm text-muted-foreground sm:col-span-2">
                  O acesso inicial será feito por link individual de ativação. Nenhuma senha
                  compartilhada será usada.
                </p>
              </div>
            )}
            {step === 1 && (
              <div className="space-y-4">
                <p className="font-medium">Perfis de acesso</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {(Object.keys(ROLE_LABELS) as AppRole[])
                    .filter((r) => r !== "superadmin" || caller.roles.includes("superadmin"))
                    .map((r) => (
                      <label key={r}>
                        <input
                          type="checkbox"
                          checked={roles.includes(r)}
                          onChange={(e) =>
                            setRoles(toggle(roles, r, e.target.checked) as AppRole[])
                          }
                        />{" "}
                        {ROLE_LABELS[r]}
                      </label>
                    ))}
                </div>
                <p className="font-medium">Funções e níveis organizacionais</p>
                {(jobRoles.data ?? []).map((r) => (
                  <div key={r.id} className="grid gap-2 sm:grid-cols-2">
                    <label>
                      <input
                        type="checkbox"
                        checked={r.id in jobs}
                        onChange={(e) =>
                          setJobs((old) => {
                            const n = { ...old };
                            if (e.target.checked) n[r.id] = "";
                            else delete n[r.id];
                            return n;
                          })
                        }
                      />{" "}
                      {r.name}
                    </label>
                    <select
                      className={field}
                      disabled={!(r.id in jobs)}
                      value={jobs[r.id] ?? ""}
                      onChange={(e) => setJobs({ ...jobs, [r.id]: e.target.value })}
                    >
                      <option value="">Sem nível</option>
                      {(levels.data ?? []).map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
                <p>Setor automático: {sectors || "Conforme perfis selecionados"}</p>
              </div>
            )}
            {step === 2 && (
              <div className="space-y-4">
                <p>Direção Geral: acesso conforme perfis e permissões efetivas abaixo.</p>
                {systems.map(([code, name]) => {
                  const grant = grants.find((g) => g.system_code === code);
                  return (
                    <div key={code} className="space-y-2 rounded-lg border p-3">
                      <label>
                        <input
                          type="checkbox"
                          checked={!!grant}
                          onChange={(e) =>
                            setGrants(
                              e.target.checked
                                ? [
                                    ...grants,
                                    {
                                      system_code: code,
                                      region_code: null,
                                      territory_uf: null,
                                      own_records_only: true,
                                      can_write: false,
                                    },
                                  ]
                                : grants.filter((g) => g.system_code !== code),
                            )
                          }
                        />{" "}
                        {name}
                      </label>
                      {grant && (
                        <div className="flex flex-wrap gap-3">
                          <label>
                            <input
                              type="checkbox"
                              checked={grant.can_write}
                              onChange={(e) =>
                                setGrants(
                                  grants.map((g) =>
                                    g === grant ? { ...g, can_write: e.target.checked } : g,
                                  ),
                                )
                              }
                            />{" "}
                            Escrita
                          </label>
                          <label>
                            <input
                              type="checkbox"
                              checked={grant.own_records_only}
                              onChange={(e) =>
                                setGrants(
                                  grants.map((g) =>
                                    g === grant
                                      ? {
                                          ...g,
                                          own_records_only: e.target.checked,
                                        }
                                      : g,
                                  ),
                                )
                              }
                            />{" "}
                            Registros próprios
                          </label>
                          <select
                            className={field}
                            value={grant.region_code ?? ""}
                            onChange={(e) =>
                              setGrants(
                                grants.map((g) =>
                                  g === grant
                                    ? {
                                        ...g,
                                        region_code: e.target.value || null,
                                        territory_uf: null,
                                      }
                                    : g,
                                ),
                              )
                            }
                          >
                            <option value="">Todas as regiões</option>
                            {["norte", "nordeste", "centro-oeste", "sudeste", "sul"].map((r) => (
                              <option key={r}>{r}</option>
                            ))}
                          </select>
                          <Input
                            className="w-24"
                            placeholder="UF"
                            maxLength={2}
                            value={grant.territory_uf ?? ""}
                            onChange={(e) =>
                              setGrants(
                                grants.map((g) =>
                                  g === grant
                                    ? {
                                        ...g,
                                        territory_uf: e.target.value.toUpperCase() || null,
                                        region_code: null,
                                      }
                                    : g,
                                ),
                              )
                            }
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
                <p className="font-medium">Ajustes individuais de operações</p>
                {(catalog.data ?? [])
                  .filter((p) => p.key.includes("."))
                  .map((p) => {
                    const inherited =
                      roles.some((r) => r === "admin" || r === "superadmin") ||
                      roleRules.data?.some(
                        (g) =>
                          g.permission_key === p.key &&
                          g.allowed &&
                          g.job_role_id in jobs &&
                          (g.job_level_id === null || g.job_level_id === jobs[g.job_role_id]),
                      ) ||
                      (roles.includes("vendedor") &&
                        [
                          "customers.view",
                          "customers.create",
                          "customers.edit",
                          "opportunities.view",
                          "opportunities.create",
                          "opportunities.edit",
                          "orders.view",
                          "orders.create",
                          "orders.edit_open",
                          "orders.request_change",
                          "payments.create",
                          "payments.view",
                          "commissions.view",
                          "stock.view",
                          "history.view",
                          "reports.view",
                        ].includes(p.key));
                    return (
                      <label
                        key={p.key}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        {p.label}
                        <span className="text-xs text-muted-foreground">
                          Efetiva: {(overrides[p.key] ?? inherited) ? "permitida" : "bloqueada"}
                        </span>
                        <select
                          className={field}
                          value={p.key in overrides ? String(overrides[p.key]) : "inherit"}
                          onChange={(e) =>
                            setOverrides((old) => {
                              const n = { ...old };
                              if (e.target.value === "inherit") delete n[p.key];
                              else n[p.key] = e.target.value === "true";
                              return n;
                            })
                          }
                        >
                          <option value="inherit">Herdar cargos</option>
                          <option value="true">Permitir</option>
                          <option value="false">Bloquear</option>
                        </select>
                      </label>
                    );
                  })}
              </div>
            )}
            {step === 3 && (
              <div className="space-y-4">
                <p>
                  Selecionar uma categoria inclui suas subcategorias e produtos ativos. Desmarque as
                  exceções; elas serão preservadas.
                </p>
                {products.map((p) => (
                  <div key={p.id} className="rounded-lg border p-3">
                    <label className="font-medium">
                      <input
                        type="checkbox"
                        checked={selected.includes(p.id)}
                        onChange={(e) => setSelected(toggle(selected, p.id, e.target.checked))}
                      />{" "}
                      {p.name}
                    </label>
                    {selected.includes(p.id) && (
                      <div className="ml-4 space-y-2">
                        {(categories.data ?? [])
                          .filter((c) => c.product_id === p.id)
                          .map((c) => (
                            <label className="block" key={c.id}>
                              <input
                                type="checkbox"
                                checked={!excludedCategories.includes(c.id)}
                                onChange={(e) =>
                                  setExcludedCategories(
                                    toggle(excludedCategories, c.id, !e.target.checked),
                                  )
                                }
                              />{" "}
                              {c.name}
                            </label>
                          ))}
                        {(items.data ?? [])
                          .filter((i) => i.product_id === p.id)
                          .map((i) => (
                            <label className="block text-sm" key={i.id}>
                              <input
                                type="checkbox"
                                disabled={excludedCategories.includes(i.category_id)}
                                checked={
                                  !excludedItems.includes(i.id) &&
                                  !excludedCategories.includes(i.category_id)
                                }
                                onChange={(e) =>
                                  setExcludedItems(toggle(excludedItems, i.id, !e.target.checked))
                                }
                              />{" "}
                              {i.name}
                            </label>
                          ))}
                      </div>
                    )}
                  </div>
                ))}
                <p className="font-medium">Estoques autorizados</p>
                {(stocks.data ?? []).map((w) => (
                  <label className="block" key={w.id}>
                    <input
                      type="checkbox"
                      checked={warehouses.includes(w.id)}
                      onChange={(e) => setWarehouses(toggle(warehouses, w.id, e.target.checked))}
                    />{" "}
                    {w.name}
                  </label>
                ))}
              </div>
            )}
            {step === 4 && (
              <div className="space-y-4">
                {deals.map((d, index) => (
                  <div key={index} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-3">
                    <Input
                      placeholder="Nome do acordo"
                      value={d.label}
                      onChange={(e) =>
                        setDeals(
                          deals.map((v, i) => (i === index ? { ...v, label: e.target.value } : v)),
                        )
                      }
                    />
                    <select
                      className={field}
                      value={d.comp_type}
                      onChange={(e) =>
                        setDeals(
                          deals.map((v, i) =>
                            i === index ? { ...v, comp_type: e.target.value as any } : v,
                          ),
                        )
                      }
                    >
                      <option value="percent">Comissão %</option>
                      <option value="fixed">Valor fixo</option>
                    </select>
                    <Input
                      type="number"
                      min="0"
                      placeholder="Valor"
                      value={d.amount}
                      onChange={(e) =>
                        setDeals(
                          deals.map((v, i) => (i === index ? { ...v, amount: e.target.value } : v)),
                        )
                      }
                    />
                    <select
                      className={field}
                      value={d.product_id}
                      onChange={(e) =>
                        setDeals(
                          deals.map((v, i) =>
                            i === index
                              ? {
                                  ...v,
                                  product_id: e.target.value,
                                  category_id: "",
                                }
                              : v,
                          ),
                        )
                      }
                    >
                      <option value="">Todas as categorias</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <select
                      className={field}
                      value={d.category_id}
                      onChange={(e) =>
                        setDeals(
                          deals.map((v, i) =>
                            i === index ? { ...v, category_id: e.target.value, item_id: "" } : v,
                          ),
                        )
                      }
                    >
                      <option value="">Todas as subcategorias</option>
                      {(categories.data ?? [])
                        .filter((c) => c.product_id === d.product_id)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                    <label className="grid gap-1 text-xs">
                      Produto individual (opcional)
                      <select
                        className={field}
                        value={d.item_id}
                        onChange={(e) => {
                          const item = (items.data ?? []).find(
                            (item) => item.id === e.target.value,
                          );
                          setDeals(
                            deals.map((v, i) =>
                              i === index
                                ? {
                                    ...v,
                                    item_id: e.target.value,
                                    ...(item
                                      ? {
                                          product_id: item.product_id,
                                          category_id: item.category_id ?? "",
                                        }
                                      : {}),
                                  }
                                : v,
                            ),
                          );
                        }}
                      >
                        <option value="">Todos do escopo escolhido</option>
                        {(items.data ?? [])
                          .filter(
                            (item) =>
                              selected.includes(item.product_id) &&
                              (!d.product_id || item.product_id === d.product_id) &&
                              (!d.category_id || item.category_id === d.category_id) &&
                              !excludedItems.includes(item.id) &&
                              !excludedCategories.includes(item.category_id),
                          )
                          .map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <Input
                      placeholder="Condições do acordo (opcional)"
                      maxLength={2000}
                      value={d.notes}
                      onChange={(e) =>
                        setDeals(
                          deals.map((v, i) => (i === index ? { ...v, notes: e.target.value } : v)),
                        )
                      }
                    />
                    <select
                      className={field}
                      value={d.currency}
                      onChange={(e) =>
                        setDeals(
                          deals.map((v, i) =>
                            i === index ? { ...v, currency: e.target.value as any } : v,
                          ),
                        )
                      }
                    >
                      {["USD", "BRL", "PYG"].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                    <select
                      className={field}
                      value={d.period}
                      onChange={(e) =>
                        setDeals(
                          deals.map((v, i) =>
                            i === index ? { ...v, period: e.target.value as any } : v,
                          ),
                        )
                      }
                    >
                      <option value="per_sale">Por venda</option>
                      <option value="day">Diário</option>
                      <option value="week">Semanal</option>
                      <option value="month">Mensal</option>
                    </select>
                    <Button
                      variant="ghost"
                      onClick={() => setDeals(deals.filter((_, i) => i !== index))}
                    >
                      Remover acordo
                    </Button>
                  </div>
                ))}
                <Button variant="outline" onClick={() => setDeals([...deals, deal()])}>
                  Outro acordo
                </Button>
                <div className="rounded-lg bg-muted p-4 text-sm">
                  <p className="font-semibold">Resumo antes de concluir</p>
                  <p>
                    {person.full_name} · {person.email}
                  </p>
                  <p>Cargos: {roles.map((r) => ROLE_LABELS[r]).join(", ")}</p>
                  <p>Setores: {sectors || "Conforme perfis"}</p>
                  <p>
                    Direção Geral:{" "}
                    {generalAccess || roles.includes("superadmin") ? "Permitida" : "Sem acesso"}
                  </p>
                  <p>
                    Sistemas:{" "}
                    {grants
                      .map((g) => systems.find((s) => s[0] === g.system_code)?.[1])
                      .join(", ") || "Nenhuma divisão adicional"}
                  </p>
                  <p>
                    Categorias:{" "}
                    {products
                      .filter((p) => selected.includes(p.id))
                      .map((p) => p.name)
                      .join(", ") || "Nenhuma"}
                  </p>
                  <p>
                    {excludedCategories.length} subcategorias excluídas · {excludedItems.length}{" "}
                    produtos excluídos · {warehouses.length} estoques ·{" "}
                    {Object.keys(overrides).length} ajustes individuais
                  </p>
                  {deals
                    .filter((d) => d.amount)
                    .map((d, i) => (
                      <p key={i}>
                        {d.label || "Acordo"}: {d.amount}
                        {d.comp_type === "percent" ? "%" : " " + d.currency} · {d.period}
                      </p>
                    ))}
                </div>
              </div>
            )}
          </>
        )}
        <DialogFooter>
          {activation ? (
            <Button
              onClick={() => {
                setOpen(false);
                reset();
              }}
            >
              Concluir
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => (step ? setStep(step - 1) : setOpen(false))}
              >
                {step ? "Voltar" : "Cancelar"}
              </Button>
              <Button disabled={saving} onClick={step === 4 ? submit : next}>
                {saving ? "Salvando…" : step === 4 ? "Concluir cadastro" : "Próxima etapa"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
