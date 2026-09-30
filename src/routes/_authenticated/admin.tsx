/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Eye, KeyRound, Search, ShieldCheck } from "lucide-react";
import { adminListMembers, adminMemberDetail, adminUpdateMember } from "@/lib/admin.functions";
import { useCurrentUser, ROLE_LABELS, type AppRole } from "@/hooks/useAuth";
import { setViewAs } from "@/hooks/useImpersonation";
import { formatDate, formatDateTime, formatMoney, initials } from "@/lib/format";
import { CurrencyValues } from "@/components/common/CurrencyValues";
import { PageHeader, EmptyState } from "@/components/common/PageHeader";
import { DivisionAccessPanel } from "@/components/admin/DivisionAccessPanel";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Visão interna do administrador — OS" },
      {
        name: "description",
        content: "Área exclusiva do administrador para acompanhar e editar tudo de cada membro.",
      },
      { property: "og:title", content: "Visão interna do administrador — OS" },
      {
        property: "og:description",
        content: "Área exclusiva do administrador para acompanhar e editar tudo de cada membro.",
      },
    ],
  }),
  component: AdminArea,
});

const ROLE_VALUES: AppRole[] = [
  "superadmin",
  "admin",
  "gestor",
  "vendedor",
  "financeiro",
  "estoque",
  "fornecedor",
  "entregador",
];

function Info({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium break-words">{value || "—"}</p>
    </div>
  );
}

function AdminArea() {
  const { isAdmin, loading } = useCurrentUser();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const listFn = useServerFn(adminListMembers);
  const detailFn = useServerFn(adminMemberDetail);
  const updateFn = useServerFn(adminUpdateMember);

  const [term, setTerm] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<any>({});
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const members = useQuery({
    queryKey: ["admin-members"],
    enabled: isAdmin,
    queryFn: () => listFn({ data: {} as any }) as Promise<any[]>,
  });

  const detail = useQuery({
    queryKey: ["admin-member", selected],
    enabled: isAdmin && !!selected,
    queryFn: () => detailFn({ data: { userId: selected! } }) as Promise<any>,
  });

  useEffect(() => {
    const p = detail.data?.profile;
    if (!p) return;
    setForm({
      full_name: p.full_name ?? "",
      email: p.email ?? "",
      phone: p.phone ?? "",
      cargo: p.cargo ?? "",
      setor: p.setor ?? "",
      is_active: !!p.is_active,
    });
    setRoles((detail.data?.roles as AppRole[]) ?? []);
    setNewEmail("");
    setNewPassword("");
  }, [detail.data]);

  if (loading) return null;
  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="Visão interna" description="Área exclusiva da administração." />
        <EmptyState
          title="Acesso restrito"
          description="Somente administradores e superadministradores podem abrir esta área."
        />
      </div>
    );
  }

  const list = (members.data ?? []).filter((m: any) =>
    `${m.full_name ?? ""} ${m.auth_email ?? ""} ${m.cargo ?? ""}`
      .toLowerCase()
      .includes(term.toLowerCase()),
  );

  async function save() {
    if (!selected) return;
    setSaving(true);
    try {
      await updateFn({
        data: {
          userId: selected,
          profile: form,
          roles,
          newEmail: newEmail.trim() || undefined,
          newPassword: newPassword.trim() || undefined,
        },
      });
      toast.success("Dados do membro atualizados.");
      setNewEmail("");
      setNewPassword("");
      await queryClient.invalidateQueries({ queryKey: ["admin-member", selected] });
      await queryClient.invalidateQueries({ queryKey: ["admin-members"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  const d = detail.data;

  return (
    <div>
      <PageHeader
        title="Visão interna (administração)"
        description="Área exclusiva de administradores: veja e edite tudo de cada membro, incluindo acesso e resultados."
      />

      <DivisionAccessPanel />
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <div className="surface-card flex max-h-[75vh] flex-col">
          <div className="relative border-b p-3">
            <Search className="absolute top-5.5 left-6 size-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar membro…"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {list.map((m: any) => (
              <button
                key={m.id}
                onClick={() => setSelected(m.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg p-2.5 text-left hover:bg-muted",
                  selected === m.id && "bg-muted",
                )}
              >
                <Avatar className="size-9">
                  <AvatarFallback>{initials(m.full_name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.full_name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {m.auth_email ?? "sem e-mail"}
                  </p>
                </div>
                {(m.roles ?? []).includes("superadmin") && (
                  <ShieldCheck className="size-4 text-primary" />
                )}
              </button>
            ))}
            {members.isLoading && <p className="p-4 text-sm text-muted-foreground">Carregando…</p>}
            {!members.isLoading && list.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">Nenhum membro encontrado.</p>
            )}
          </div>
        </div>

        <div className="surface-card min-h-[50vh] p-4">
          {!selected && (
            <EmptyState
              title="Escolha um membro"
              description="Selecione uma pessoa na lista para abrir a visão interna completa."
            />
          )}
          {selected && detail.isLoading && (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          )}
          {selected && d && (
            <Tabs defaultValue="dados">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <TabsList className="flex-wrap">
                  <TabsTrigger value="dados">Dados e acesso</TabsTrigger>
                  <TabsTrigger value="remuneracao">Remuneração</TabsTrigger>
                  <TabsTrigger value="resultados">Resultados</TabsTrigger>
                  <TabsTrigger value="atividade">Atividade</TabsTrigger>
                </TabsList>
                <Button
                  onClick={() => {
                    setViewAs({
                      userId: selected!,
                      name: d.profile?.full_name ?? "membro",
                      roles: (d.roles?.length ? d.roles : roles) as AppRole[],
                    });
                    toast.success("Você entrou na tela deste membro.");
                    void navigate({ to: "/painel" });
                  }}
                >
                  <Eye className="size-4" /> Entrar na tela do membro
                </Button>
              </div>

              <TabsContent value="dados" className="mt-4 space-y-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Nome completo</Label>
                    <Input
                      className="mt-1.5"
                      value={form.full_name ?? ""}
                      onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>E-mail de contato</Label>
                    <Input
                      className="mt-1.5"
                      value={form.email ?? ""}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Telefone</Label>
                    <Input
                      className="mt-1.5"
                      value={form.phone ?? ""}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Cargo</Label>
                    <Input
                      className="mt-1.5"
                      value={form.cargo ?? ""}
                      onChange={(e) => setForm({ ...form, cargo: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Setor</Label>
                    <Input
                      className="mt-1.5"
                      value={form.setor ?? ""}
                      onChange={(e) => setForm({ ...form, setor: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Perfis de acesso</Label>
                    <div className="mt-1.5 grid grid-cols-2 gap-2 rounded-md border p-2">
                      {ROLE_VALUES.map((r) => <label key={r} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={roles.includes(r)} onChange={(e) => setRoles((current) => e.target.checked ? [...current, r] : current.filter((item) => item !== r))} />{ROLE_LABELS[r]}</label>)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 pt-2">
                    <Switch
                      checked={!!form.is_active}
                      onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                    />
                    <span className="text-sm">Membro ativo</span>
                  </div>
                </div>

                <div className="rounded-xl border p-4">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <KeyRound className="size-4" /> Acesso ao sistema
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Info label="E-mail de login" value={d.account?.email} />
                    <Info
                      label="Último acesso"
                      value={formatDateTime(d.account?.last_sign_in_at)}
                    />
                    <Info label="Conta criada em" value={formatDate(d.account?.created_at)} />
                    <Info
                      label="Forma de entrada"
                      value={(d.account?.providers ?? []).filter(Boolean).join(", ")}
                    />
                    <Info
                      label="E-mail confirmado"
                      value={d.account?.email_confirmed_at ? "Sim" : "Não"}
                    />
                    <Info label="Conversas internas" value={d.conversationsCount} />
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    A senha é guardada criptografada e não pode ser lida por ninguém, nem pela
                    administração. Para dar acesso, defina uma nova senha abaixo e envie ao membro.
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label>Novo e-mail de login</Label>
                      <Input
                        className="mt-1.5"
                        placeholder="deixe em branco para manter"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Nova senha</Label>
                      <Input
                        className="mt-1.5"
                        placeholder="mínimo de 6 caracteres"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setViewAs({
                        userId: selected!,
                        name: d.profile?.full_name ?? "membro",
                        roles: (d.roles?.length ? d.roles : roles) as AppRole[],
                      });
                      toast.success("Agora você vê o sistema como este membro.");
                      void navigate({ to: "/painel" });
                    }}
                  >
                    <Eye className="size-4" /> Ver a tela como este membro
                  </Button>
                  <Button onClick={() => void save()} disabled={saving}>
                    {saving ? "Salvando…" : "Salvar alterações"}
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="remuneracao" className="mt-4 space-y-4">
                <section>
                  <p className="mb-2 text-sm font-medium">Acordos de remuneração</p>
                  {d.compensations.length === 0 && (
                    <p className="text-sm text-muted-foreground">Nenhum acordo cadastrado.</p>
                  )}
                  <div className="space-y-2">
                    {d.compensations.map((c: any) => (
                      <div
                        key={c.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
                      >
                        <span>
                          {c.label || c.comp_type} — {c.products?.name ?? "Todas as categorias"}
                        </span>
                        <span className="font-medium">
                          {c.comp_type === "percentual" ? (
                            `${c.amount}%`
                          ) : (
                            <CurrencyValues
                              value={Number(c.amount)}
                              currency={c.currency}
                              layout="inline"
                            />
                          )}{" "}
                          <Badge variant="secondary">{c.period}</Badge>
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
                <section>
                  <p className="mb-2 text-sm font-medium">Lançamentos da folha</p>
                  {d.payroll.length === 0 && (
                    <p className="text-sm text-muted-foreground">Nenhum lançamento.</p>
                  )}
                  <div className="space-y-2">
                    {d.payroll.map((p: any) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm"
                      >
                        <span>
                          {p.entry_type} — {p.description ?? "sem descrição"}
                        </span>
                        <CurrencyValues value={Number(p.amount)} currency={p.currency} emphasize />
                      </div>
                    ))}
                  </div>
                </section>
                <section>
                  <p className="mb-2 text-sm font-medium">Bonificações</p>
                  {d.bonuses.length === 0 && (
                    <p className="text-sm text-muted-foreground">Nenhuma bonificação.</p>
                  )}
                  <div className="space-y-2">
                    {d.bonuses.map((b: any) => (
                      <div
                        key={b.id}
                        className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm"
                      >
                        <span>{b.description ?? "Bonificação"}</span>
                        <CurrencyValues value={Number(b.amount)} currency={b.currency} emphasize />
                      </div>
                    ))}
                  </div>
                </section>
                <section>
                  <p className="mb-2 text-sm font-medium">Investimentos do membro</p>
                  {d.investments.length === 0 && (
                    <p className="text-sm text-muted-foreground">Nenhum investimento.</p>
                  )}
                  <div className="space-y-2">
                    {d.investments.map((i: any) => (
                      <div
                        key={i.id}
                        className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm"
                      >
                        <span>
                          {i.name} <Badge variant="secondary">{i.scope}</Badge>
                        </span>
                        <CurrencyValues value={Number(i.amount)} currency={i.currency} emphasize />
                      </div>
                    ))}
                  </div>
                </section>
              </TabsContent>

              <TabsContent value="resultados" className="mt-4 space-y-4">
                <section>
                  <p className="mb-2 text-sm font-medium">Pedidos ({d.orders.length})</p>
                  <div className="space-y-2">
                    {d.orders.map((o: any) => (
                      <div
                        key={o.id}
                        className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm"
                      >
                        <span>
                          #{o.number} — {o.customers?.name ?? "sem cliente"}{" "}
                          <Badge variant="secondary">{o.status}</Badge>
                        </span>
                        <CurrencyValues value={Number(o.total)} currency={o.currency} emphasize />
                      </div>
                    ))}
                    {d.orders.length === 0 && (
                      <p className="text-sm text-muted-foreground">Nenhum pedido.</p>
                    )}
                  </div>
                </section>
                <section>
                  <p className="mb-2 text-sm font-medium">Orçamentos ({d.quotes.length})</p>
                  <div className="space-y-2">
                    {d.quotes.map((q: any) => (
                      <div
                        key={q.id}
                        className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm"
                      >
                        <span>
                          #{q.number} <Badge variant="secondary">{q.status}</Badge>
                        </span>
                        <CurrencyValues value={Number(q.total)} currency={q.currency} emphasize />
                      </div>
                    ))}
                    {d.quotes.length === 0 && (
                      <p className="text-sm text-muted-foreground">Nenhum orçamento.</p>
                    )}
                  </div>
                </section>
                <section>
                  <p className="mb-2 text-sm font-medium">
                    Oportunidades ({d.opportunities.length})
                  </p>
                  <div className="space-y-2">
                    {d.opportunities.map((o: any) => (
                      <div
                        key={o.id}
                        className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm"
                      >
                        <span>
                          {o.customers?.name ?? "sem contato"} —{" "}
                          {o.products?.name ?? "sem categoria"}{" "}
                          <Badge variant="secondary">{o.commercial_status}</Badge>
                        </span>
                        <span className="font-medium">
                          <CurrencyValues
                            value={Number(o.potential_value ?? 0)}
                            currency={o.currency}
                          />
                        </span>
                      </div>
                    ))}
                    {d.opportunities.length === 0 && (
                      <p className="text-sm text-muted-foreground">Nenhuma oportunidade.</p>
                    )}
                  </div>
                </section>
              </TabsContent>

              <TabsContent value="atividade" className="mt-4 space-y-4">
                <section>
                  <p className="mb-2 text-sm font-medium">Categorias vinculadas</p>
                  <div className="flex flex-wrap gap-2">
                    {d.products.map((p: any) => (
                      <Badge key={p.id} variant="secondary">
                        {p.products?.name ?? "categoria"} — {p.role_in_product}
                      </Badge>
                    ))}
                    {d.products.length === 0 && (
                      <p className="text-sm text-muted-foreground">Nenhuma categoria vinculada.</p>
                    )}
                  </div>
                </section>
                <section>
                  <p className="mb-2 text-sm font-medium">Tarefas</p>
                  <div className="space-y-2">
                    {d.tasks.map((t: any) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm"
                      >
                        <span>{t.title}</span>
                        <span className="text-muted-foreground">
                          {formatDate(t.due_at)} <Badge variant="secondary">{t.status}</Badge>
                        </span>
                      </div>
                    ))}
                    {d.tasks.length === 0 && (
                      <p className="text-sm text-muted-foreground">Nenhuma tarefa.</p>
                    )}
                  </div>
                </section>
                <section>
                  <p className="mb-2 text-sm font-medium">Últimas interações</p>
                  <div className="space-y-2">
                    {d.activities.map((a: any) => (
                      <div key={a.id} className="rounded-lg border p-3 text-sm">
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(a.created_at)} — {a.type}
                        </p>
                        <p>{a.content}</p>
                      </div>
                    ))}
                    {d.activities.length === 0 && (
                      <p className="text-sm text-muted-foreground">Nenhuma interação registrada.</p>
                    )}
                  </div>
                </section>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </div>
  );
}
