/* eslint-disable @typescript-eslint/no-explicit-any */
import { MemberEarnings } from "./MemberEarnings";
import { useMemo, useState } from "react";
import { ResourcePage } from "@/components/common/ResourcePage";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCurrentUser } from "@/hooks/useAuth";
import { usePeople } from "@/hooks/usePeople";
import { useProductScope } from "@/hooks/useProductScope";
import { useRates, type Currency } from "@/hooks/useRates";
import { useRows, useSaveRow } from "@/lib/db";
import { CURRENCIES, formatDate, formatMoney } from "@/lib/format";
import { convertFinancialAmount } from "@/lib/financial-exchange";
import { CurrencyValues } from "@/components/common/CurrencyValues";

const ENTRY_TYPES = [
  { value: "fixed", label: "Fixo / salário" },
  { value: "prolabore", label: "Pró-labore (sócio)" },
  { value: "commission", label: "Comissão" },
  { value: "bonus", label: "Bonificação" },
  { value: "other", label: "Ajuda de custo / outros valores" },
];

const PERIODS = [
  { value: "day", label: "Por dia" },
  { value: "week", label: "Por semana" },
  { value: "month", label: "Por mês" },
  { value: "per_sale", label: "Por venda" },
];

export function PayrollSection({
  filterRow,
  currency = "USD",
}: { filterRow?: (row: any) => boolean; currency?: Currency } = {}) {
  const { isAdmin } = useCurrentUser();
  const [payrollOpen, setPayrollOpen] = useState(false);
  const [payrollDraft, setPayrollDraft] = useState({ user_id: "", entry_type: "fixed", description: "", amount: "", currency: "USD", period_end: "", status: "aberto" });
  const savePayroll = useSaveRow("payroll_entries", () => {
    setPayrollOpen(false);
    setPayrollDraft({ user_id: "", entry_type: "fixed", description: "", amount: "", currency: "USD", period_end: "", status: "aberto" });
  });
  const { options, nameOf } = usePeople();
  const { products, productId, current } = useProductScope();
  const scopeFilter = productId === "todos" ? {} : { product_id: productId };
  const scopeNote =
    productId === "todos"
      ? "Mostrando todas as categorias."
      : `Mostrando apenas a categoria ${current?.name ?? ""}.`;
  const inScope = (r: any) => productId === "todos" || !r.product_id || r.product_id === productId;
  const { convert } = useRates();

  const productOptions = products.map((p) => ({ value: p.id, label: p.name }));
  const subcategories = useRows<any>("product_categories", {
    orderBy: { column: "name", ascending: true },
    limit: 500,
  });
  const categoryOptions = (subcategories.data ?? []).map((c: any) => ({
    value: c.id,
    label: `${products.find((p) => p.id === c.product_id)?.name ?? "Categoria"} › ${c.name}`,
  }));
  const categoryLabel = (id: string | null) =>
    categoryOptions.find((c) => c.value === id)?.label ?? null;

  const entries = useRows<any>("payroll_entries", {
    orderBy: { column: "created_at", ascending: false },
  });

  const payrollByPerson = useMemo(() => {
    const map = new Map<
      string,
      { fixed: number; commission: number; bonus: number; other: number }
    >();
    const usd = (row: any) => convertFinancialAmount(row, "USD", convert);
    for (const e of (entries.data ?? [])
      .filter(inScope)
      .filter(
        (r: any) =>
          !["commission", "comissao", "bonus", "bonificacao"].includes(r.entry_type) &&
          (!filterRow || filterRow(r)),
      )) {
      const cur = map.get(e.user_id) ?? { fixed: 0, commission: 0, bonus: 0, other: 0 };
      const key = (e.entry_type ?? "other") as keyof typeof cur;
      cur[key in cur ? key : "other"] += usd(e);
      map.set(e.user_id, cur);
    }
    return [...map.entries()]
      .map(([userId, v]) => ({
        userId,
        name: nameOf(userId),
        ...v,
        total: v.fixed + v.commission + v.bonus + v.other,
      }))
      .sort((a, b) => b.total - a.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries.data, convert, nameOf, productId, filterRow]);

  const grandTotal = payrollByPerson.reduce((s, p) => s + p.total, 0);

  return (
    <Tabs defaultValue="salarios">
      <TabsList className="flex-wrap">
        <TabsTrigger value="salarios">Salários e ajuda de custo</TabsTrigger>
        <TabsTrigger value="comissoes">Comissões e bonificações</TabsTrigger>
      </TabsList>
      <TabsContent value="comissoes" className="pt-4">
        <MemberEarnings currency={currency} />
      </TabsContent>
      <TabsContent value="salarios" className="pt-4">
        <Tabs defaultValue="folha">
          <TabsList>
            <TabsTrigger value="folha">Folha de pagamento</TabsTrigger>
            <TabsTrigger value="acordos">Acordos de remuneração</TabsTrigger>
            <TabsTrigger value="lancamentos">Lançamentos</TabsTrigger>
          </TabsList>

          <TabsContent value="folha" className="space-y-4 pt-4">
            {isAdmin && (
              <div className="flex justify-end">
                <Button onClick={() => setPayrollOpen(true)}><Plus className="mr-2 h-4 w-4" />Cadastrar na folha</Button>
              </div>
            )}
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">
                  Salários, pró-labore e ajuda de custo do período
                </p>
                <CurrencyValues
                  value={grandTotal}
                  currency="USD"
                  className="font-display text-2xl"
                  emphasize
                />
              </CardContent>
            </Card>
            <div className="surface-card overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pessoa</TableHead>
                    <TableHead className="text-right">Fixo</TableHead>

                    <TableHead className="text-right">Outros</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payrollByPerson.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-muted-foreground">
                        Nenhum valor lançado neste período. Use “Cadastrar na folha” para incluir um pagamento.
                      </TableCell>
                    </TableRow>
                  )}
                  {payrollByPerson.map((p) => (
                    <TableRow key={p.userId}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-right">
                        <CurrencyValues value={p.fixed} currency="USD" />
                      </TableCell>
                      <TableCell className="text-right">
                        <CurrencyValues value={p.other} currency="USD" />
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        <CurrencyValues value={p.total} currency="USD" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <Dialog open={payrollOpen} onOpenChange={setPayrollOpen}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Cadastrar na folha de pagamento</DialogTitle>
                <DialogDescription>O lançamento aparecerá nesta folha e na lista de lançamentos.</DialogDescription>
              </DialogHeader>
              <form className="grid gap-4" onSubmit={(event) => {
                event.preventDefault();
                if (!isAdmin || !payrollDraft.user_id || !payrollDraft.period_end || Number(payrollDraft.amount) <= 0) return;
                savePayroll.mutate({
                  ...payrollDraft,
                  amount: Number(payrollDraft.amount),
                  product_id: productId === "todos" ? null : productId,
                  paid_at: payrollDraft.status === "pago" ? payrollDraft.period_end : null,
                });
              }}>
                <div className="grid gap-2"><Label htmlFor="payroll-person">Pessoa</Label><select id="payroll-person" className="h-10 rounded-md border bg-background px-3 text-sm" required value={payrollDraft.user_id} onChange={(e) => setPayrollDraft((v) => ({ ...v, user_id: e.target.value }))}><option value="">Selecione</option>{options.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></div>
                <div className="grid gap-2"><Label htmlFor="payroll-type">Tipo de valor</Label><select id="payroll-type" className="h-10 rounded-md border bg-background px-3 text-sm" value={payrollDraft.entry_type} onChange={(e) => setPayrollDraft((v) => ({ ...v, entry_type: e.target.value }))}>{ENTRY_TYPES.filter((t) => !["commission", "bonus"].includes(t.value)).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
                <div className="grid gap-2"><Label htmlFor="payroll-description">Descrição</Label><Input id="payroll-description" value={payrollDraft.description} onChange={(e) => setPayrollDraft((v) => ({ ...v, description: e.target.value }))} /></div>
                <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label htmlFor="payroll-amount">Valor</Label><Input id="payroll-amount" type="number" min="0.01" step="0.01" required value={payrollDraft.amount} onChange={(e) => setPayrollDraft((v) => ({ ...v, amount: e.target.value }))} /></div><div className="grid gap-2"><Label htmlFor="payroll-currency">Moeda</Label><select id="payroll-currency" className="h-10 rounded-md border bg-background px-3 text-sm" value={payrollDraft.currency} onChange={(e) => setPayrollDraft((v) => ({ ...v, currency: e.target.value }))}>{CURRENCIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div></div>
                <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label htmlFor="payroll-date">Data de referência</Label><Input id="payroll-date" type="date" required value={payrollDraft.period_end} onChange={(e) => setPayrollDraft((v) => ({ ...v, period_end: e.target.value }))} /></div><div className="grid gap-2"><Label htmlFor="payroll-status">Situação</Label><select id="payroll-status" className="h-10 rounded-md border bg-background px-3 text-sm" value={payrollDraft.status} onChange={(e) => setPayrollDraft((v) => ({ ...v, status: e.target.value }))}><option value="aberto">Em aberto</option><option value="pago">Pago</option></select></div></div>
                <DialogFooter><Button type="button" variant="outline" onClick={() => setPayrollOpen(false)}>Cancelar</Button><Button type="submit" disabled={savePayroll.isPending}>{savePayroll.isPending ? "Salvando…" : "Salvar lançamento"}</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <TabsContent value="acordos" className="pt-4">
            <ResourcePage
              title="Quanto cada pessoa recebe"
              description={`A mesma pessoa pode ter vários acordos ao mesmo tempo: um percentual em uma categoria, um valor fixo em outra, outro em marketing. ${scopeNote}`}
              table="member_compensations"
              filter={scopeFilter}
              beforeSave={(v: any) => ({
                ...v,
                product_id: v["product_id"] || (productId === "todos" ? null : productId),
              })}
              canWrite={isAdmin}
              searchKeys={["notes", "label"]}
              emptyTitle="Nenhum acordo cadastrado"
              emptyDescription="Defina quanto cada membro recebe por categoria, subcategoria, semana, dia ou mês."
              columns={[
                { key: "user_id", label: "Pessoa", render: (r: any) => nameOf(r.user_id) },
                { key: "label", label: "Acordo", render: (r: any) => r.label || "—" },
                {
                  key: "product_id",
                  label: "Categoria",
                  render: (r: any) =>
                    categoryLabel(r.category_id) ??
                    productOptions.find((p) => p.value === r.product_id)?.label ??
                    "Todas",
                },
                {
                  key: "comp_type",
                  label: "Como recebe",
                  render: (r: any) =>
                    r.comp_type === "percent" ? (
                      `${r.amount}% sobre a venda`
                    ) : (
                      <CurrencyValues value={r.amount} currency={r.currency} />
                    ),
                },
                {
                  key: "period",
                  label: "Periodicidade",
                  render: (r: any) => PERIODS.find((p) => p.value === r.period)?.label ?? r.period,
                },
                {
                  key: "active",
                  label: "Ativo",
                  render: (r: any) => (
                    <Badge variant={r.active ? "default" : "secondary"}>
                      {r.active ? "Sim" : "Não"}
                    </Badge>
                  ),
                },
              ]}
              fields={[
                { name: "user_id", label: "Pessoa", type: "select", required: true, options },
                {
                  name: "label",
                  label: "Nome do acordo",
                  placeholder: "Comissão de vendas, fixo de marketing…",
                  full: true,
                },
                {
                  name: "product_id",
                  label: "Macro categoria (deixe vazio para valer em tudo)",
                  type: "select",
                  options: productOptions,
                },
                {
                  name: "category_id",
                  label: "Subcategoria (opcional)",
                  type: "select",
                  options: categoryOptions,
                },

                {
                  name: "comp_type",
                  label: "Forma de pagamento",
                  type: "select",
                  defaultValue: "percent",
                  options: [
                    { value: "percent", label: "Percentual sobre a venda" },
                    { value: "fixed", label: "Valor fixo" },
                  ],
                },
                { name: "amount", label: "Valor ou percentual", type: "number", required: true },
                {
                  name: "currency",
                  label: "Moeda",
                  type: "select",
                  defaultValue: "USD",
                  options: CURRENCIES.map((c) => ({ value: c.value, label: c.label })),
                },
                {
                  name: "period",
                  label: "Periodicidade",
                  type: "select",
                  defaultValue: "month",
                  options: PERIODS,
                },
                { name: "active", label: "Acordo ativo", type: "switch", defaultValue: true },
                { name: "notes", label: "Observações", type: "textarea" },
              ]}
            />
          </TabsContent>

          <TabsContent value="lancamentos" className="pt-4">
            <ResourcePage
              title="Lançamentos da folha"
              description={`Salários, comissões, bonificações e outros valores de cada período. ${scopeNote}`}
              table="payroll_entries"
              filter={scopeFilter}
              {...(filterRow ? { filterRow } : {})}
              beforeSave={(v: any) => ({
                ...v,
                product_id: v["product_id"] || (productId === "todos" ? null : productId),
              })}
              canWrite={isAdmin}
              searchKeys={["description"]}
              emptyTitle="Nenhum lançamento"
              emptyDescription="Lance o que será pago a cada pessoa neste período."
              columns={[
                { key: "user_id", label: "Pessoa", render: (r: any) => nameOf(r.user_id) },
                {
                  key: "entry_type",
                  label: "Tipo",
                  render: (r: any) =>
                    ENTRY_TYPES.find((t) => t.value === r.entry_type)?.label ?? r.entry_type,
                },
                { key: "description", label: "Descrição" },
                {
                  key: "amount",
                  label: "Valor",
                  render: (r: any) => <CurrencyValues value={r.amount} currency={r.currency} />,
                },
                {
                  key: "period_end",
                  label: "Referência",
                  render: (r: any) => formatDate(r.period_end),
                },
                {
                  key: "status",
                  label: "Situação",
                  render: (r: any) => (
                    <Badge variant={r.status === "pago" ? "default" : "secondary"}>
                      {r.status}
                    </Badge>
                  ),
                },
              ]}
              fields={[
                { name: "user_id", label: "Pessoa", type: "select", required: true, options },
                {
                  name: "entry_type",
                  label: "Tipo de valor",
                  type: "select",
                  defaultValue: "fixed",
                  options: ENTRY_TYPES,
                },
                { name: "description", label: "Descrição", full: true },
                {
                  name: "product_id",
                  label: "Macro categoria (opcional)",
                  type: "select",
                  options: productOptions,
                },
                {
                  name: "category_id",
                  label: "Subcategoria (opcional)",
                  type: "select",
                  options: categoryOptions,
                },

                { name: "amount", label: "Valor", type: "number", required: true },
                {
                  name: "currency",
                  label: "Moeda",
                  type: "select",
                  defaultValue: "USD",
                  options: CURRENCIES.map((c) => ({ value: c.value, label: c.label })),
                },
                { name: "period_start", label: "Início do período", type: "date" },
                { name: "period_end", label: "Fim do período", type: "date" },
                {
                  name: "status",
                  label: "Situação",
                  type: "select",
                  defaultValue: "aberto",
                  options: [
                    { value: "aberto", label: "Em aberto" },
                    { value: "pago", label: "Pago" },
                  ],
                },
                { name: "paid_at", label: "Data do pagamento", type: "date" },
              ]}
            />
          </TabsContent>
        </Tabs>
      </TabsContent>
    </Tabs>
  );
}
