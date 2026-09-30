import { financeDashboard } from "@/lib/finance-dashboard";
import { convertFinancialAmount } from "@/lib/financial-exchange";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useAuth";
import { useProductScope } from "@/hooks/useProductScope";
import { useRates, type Currency } from "@/hooks/useRates";
import { useFinanceTotals } from "@/hooks/useFinanceTotals";
import { calculateFinance } from "@/lib/finance-totals";
import { CurrencyValues } from "@/components/common/CurrencyValues";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
const db = supabase as any;
const blank = { user_id: "", name: "", percent: "", product_id: "geral", notes: "" };
export function ProfitSplitCard({
  productId,
}: {
  realProfit?: number;
  productId: string | "todos";
}) {
  const { isAdmin } = useCurrentUser();
  const { products } = useProductScope();
  const { convert, ready } = useRates();
  const qc = useQueryClient();
  const finance = useFinanceTotals("tudo", "todos");
  const [editing, setEditing] = useState<any>(null);
  const [closeMonth, setCloseMonth] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [withdrawShare, setWithdrawShare] = useState<any>(null);
  const [withdraw, setWithdraw] = useState({
    amount: "",
    currency: "USD",
    date: new Date().toISOString().slice(0, 16),
    notes: "",
  });
  const sharesQuery = useQuery({
    queryKey: ["profit-shares"],
    enabled: isAdmin,
    queryFn: async () => {
      const r = await db.from("profit_shares").select("*").eq("active", true).order("created_at");
      if (r.error) throw r.error;
      return r.data ?? [];
    },
  });
  const closuresQuery = useQuery({
    queryKey: ["profit-month-closures"], enabled: isAdmin,
    queryFn: async () => { const r = await db.from("profit_month_closures").select("*").order("month", { ascending: false }); if (r.error) throw r.error; return r.data ?? []; },
  });
  const membersQuery = useQuery({
    queryKey: ["profit-share-members"],
    enabled: isAdmin && open,
    queryFn: async () => {
      const { data, error } = await db
        .from("profiles")
        .select("id,full_name,email")
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const members = membersQuery.data ?? [];
  const shares = sharesQuery.data ?? [];
  const withdrawals = finance.data?.withdrawals ?? [];
  const closures = closuresQuery.data ?? [];
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["profit-shares"] });
    qc.invalidateQueries({ queryKey: ["profit-month-closures"] });
    qc.invalidateQueries({ queryKey: ["finance-summary"] });
  };
  const scopedData = (pid: string | null) => {
    const data: any = finance.data ?? {};
    return { ...data, productId: pid, itemIds: new Set((data.items ?? [])
      .filter((item: any) => !pid || item.product_id === pid).map((item: any) => item.id)) };
  };
  const monthlyProfit = (pid: string | null, month: string) => {
    const year = Number(month.slice(0, 4));
    const number = Number(month.slice(5, 7));
    const from = new Date(year, number - 1, 1);
    const through = new Date(Math.min(Date.now(), new Date(year, number, 0, 23, 59, 59, 999).getTime()));
    if (from > through) return 0;
    const data = scopedData(pid);
    const totals = calculateFinance(data, from, convert, through);
    const inMonth = (value: any) => {
      if (!value) return false;
      const date = new Date(String(value).length === 10 ? value + "T00:00:00" : value);
      return date >= from && date <= through;
    };
    const purchaseAccounts = new Set((data.purchases ?? []).map((p: any) => p.account_payable_id).filter(Boolean));
    const office = pid ? 0 : [
      ...(data.payable ?? []).filter((entry: any) => !entry.order_id && !purchaseAccounts.has(entry.id)),
      ...(data.payroll ?? []).filter((entry: any) => !["comissao", "bonificacao"].includes(entry.entry_type)),
    ].filter((entry: any) => entry.status === "pago" && inMonth(entry.paid_at ?? entry.created_at))
      .reduce((sum: number, entry: any) => sum + convertFinancialAmount(entry, "USD", convert), 0);
    return totals.realProfit - office;
  };
  const months = (() => {
    const data: any = finance.data ?? {};
    const dates = [...(data.orders ?? []), ...(data.payments ?? []), ...(data.payable ?? []), ...(data.payroll ?? [])]
      .map((entry: any) => entry.paid_at ?? entry.order_date ?? entry.created_at)
      .filter(Boolean).map((date: string) => String(date).slice(0, 7)).sort();
    const first = dates[0] ?? new Date().toISOString().slice(0, 7);
    const last = new Date().toISOString().slice(0, 7);
    const result: string[] = [];
    let year = Number(first.slice(0, 4));
    let month = Number(first.slice(5, 7));
    while (year * 12 + month <= Number(last.slice(0, 4)) * 12 + Number(last.slice(5, 7)) && result.length < 240) {
      result.push(`${year}-${String(month).padStart(2, "0")}`);
      if (++month > 12) { month = 1; year++; }
    }
    return result;
  })();
  const shareValues = (share: any) => {
    const data = scopedData(share.product_id);
    const totals = calculateFinance(data, null, convert);
    const earned = months.reduce((sum, month) => {
      const locked = closures.find((row: any) => row.share_id === share.id && row.month === month + "-01");
      const closed = closures.some((row: any) => row.month === month + "-01");
      return sum + (locked ? Number(locked.allocation_usd) : closed ? 0 :
        monthlyProfit(share.product_id, month) * Number(share.percent) / 100);
    }, 0);
    const taken = withdrawals.filter((w: any) => w.share_id === share.id && w.status !== "cancelado")
      .reduce((sum: number, w: any) => sum + Number(w.amount_usd), 0);
    return {
      presumed: totals.grossProfit * Number(share.percent) / 100,
      real: earned, taken, available: earned - taken,
      receivablePresumed: totals.salesTotal * Number(share.percent) / 100,
      receivableReal: totals.salesPaid * Number(share.percent) / 100,
      payablePresumed: (totals.salesTotal - totals.grossProfit) * Number(share.percent) / 100,
      payableReal: (totals.salesPaid - totals.realProfit) * Number(share.percent) / 100,
    };
  };
  const closePeriod = useMutation({
    mutationFn: async () => {
      if (!/^\\d{4}-(0[1-9]|1[0-2])$/.test(closeMonth)) throw Error("Selecione um mês válido.");
      if (closeMonth > new Date().toISOString().slice(0, 7)) throw Error("Não é possível fechar um mês futuro.");
      if (!shares.length) throw Error("Cadastre os sócios antes do fechamento.");
      if (closures.some((row: any) => row.month === closeMonth + "-01")) throw Error("Este mês já foi fechado.");
      const rows = shares.map((share: any) => {
        const profit = monthlyProfit(share.product_id, closeMonth);
        return { month: closeMonth + "-01", share_id: share.id, product_id: share.product_id,
          percent: Number(share.percent), profit_usd: profit,
          allocation_usd: Math.round(profit * Number(share.percent) * 100) / 10000 };
      });
      const response = await db.from("profit_month_closures").insert(rows).select("id");
      if (response.error) throw response.error;
    },
    onSuccess: () => { refresh(); toast.success("Divisão do mês congelada. Retiradas não alteram as parcelas dos outros sócios."); },
    onError: (e: any) => toast.error(e.message),
  });
  const save = useMutation({
    mutationFn: async () => {
      const member = form.user_id ? members.find((entry: any) => entry.id === form.user_id) : null;
      if (form.user_id && !member)
        throw Error("Aguarde a lista de membros carregar ou selecione outro membro.");
      const payload = {
        user_id: form.user_id || null,
        name: member ? String(member.full_name || member.email || "").trim() : form.name.trim(),
        percent: Number(form.percent),
        product_id: form.product_id === "geral" ? null : form.product_id,
        notes: form.notes.trim() || null,
      };
      if (
        !payload.name ||
        !Number.isFinite(payload.percent) ||
        payload.percent <= 0 ||
        payload.percent > 100
      )
        throw Error("Preencha o nome e um percentual entre 0 e 100.");
      const others = shares.filter((s: any) => s.id !== editing?.id);
      if (others.some((s: any) => !s.product_id !== !payload.product_id))
        throw Error(
          "Use divisão geral ou por categoria, para não distribuir o mesmo lucro duas vezes.",
        );
      if (
        others
          .filter((s: any) => s.product_id === payload.product_id)
          .reduce((n: number, s: any) => n + Number(s.percent), payload.percent) > 100.001
      )
        throw Error("Os percentuais desta divisão não podem ultrapassar 100%.");
      const r = editing
        ? await db.from("profit_shares").update(payload).eq("id", editing.id).select("id").single()
        : await db.from("profit_shares").insert(payload).select("id").single();
      if (r.error) throw r.error;
    },
    onSuccess: () => {
      setOpen(false);
      refresh();
      toast.success("Divisão salva.");
    },
    onError: (e: any) => toast.error(e.message),
  });
  const record = useMutation({
    mutationFn: async () => {
      const amount = Number(withdraw.amount);
      const amountUsd = convert(amount, withdraw.currency as Currency, "USD");
      if (!ready || !(amount > 0) || !amountUsd || !withdraw.date)
        throw Error("Preencha o valor e a data da retirada.");
      const r = await db
        .from("profit_withdrawals")
        .insert({
          share_id: withdrawShare.id,
          amount,
          currency: withdraw.currency,
          amount_usd: amountUsd,
          withdrawn_at: new Date(withdraw.date).toISOString(),
          notes: withdraw.notes.trim() || null,
        })
        .select("id")
        .single();
      if (r.error) throw r.error;
    },
    onSuccess: () => {
      setWithdrawShare(null);
      refresh();
      toast.success("Retirada registrada. Nenhuma transferência é feita pelo sistema.");
    },
    onError: (e: any) => toast.error(e.message),
  });
  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const r = await db
        .from("profit_withdrawals")
        .update({ status: "cancelado" })
        .eq("id", id)
        .select("id")
        .single();
      if (r.error) throw r.error;
    },
    onSuccess: () => {
      refresh();
      toast.success("Retirada cancelada; histórico preservado.");
    },
    onError: (e: any) => toast.error(e.message),
  });
  if (!isAdmin) return <p>Participação dos sócios disponível para os administradores.</p>;
  if (finance.loading || sharesQuery.isLoading || closuresQuery.isLoading || !ready)
    return <p>Carregando participação dos sócios…</p>;
  if (finance.error || sharesQuery.error || closuresQuery.error)
    return <p role="alert">Não foi possível carregar a participação dos sócios.</p>;
  if (finance.data?.withdrawalsAvailable === false)
    return (
      <p role="alert">
        O histórico de retiradas está pronto para ativação pelo administrador. Nenhuma retirada será
        registrada enquanto a estrutura do banco não estiver disponível.
      </p>
    );
  const visible = shares.filter(
    (s: any) => !s.product_id || productId === "todos" || s.product_id === productId,
  );
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap justify-between gap-2">
          <div>
            <p className="font-medium">Participação dos sócios e retiradas</p>
            <p className="text-sm text-muted-foreground">
              O lucro distribuível usa pagamentos dos pedidos menos seus custos proporcionais e despesas pagas.
              Compras ainda em estoque não entram como prejuízo. Feche cada mês para preservar percentuais.
            </p>
          </div>
          <Button
            onClick={() => {
              setEditing(null);
              setForm(blank);
              setOpen(true);
            }}
          >
            <Plus className="size-4" />
            Cadastrar sócio
          </Button>
        </div>
        <div className="flex flex-wrap items-end gap-3 rounded-md border bg-muted/20 p-3">
          <div><Label htmlFor="profit-close-month">Mês para dividir o lucro</Label><Input id="profit-close-month" type="month" value={closeMonth} max={new Date().toISOString().slice(0, 7)} onChange={(event) => setCloseMonth(event.target.value)} /></div>
          <Button type="button" variant="outline" disabled={closePeriod.isPending || closures.some((row: any) => row.month === closeMonth + "-01")} onClick={() => closePeriod.mutate()}>Fechar divisão do mês</Button>
          <p className="text-xs text-muted-foreground">{closures.some((row: any) => row.month === closeMonth + "-01") ? "Mês fechado: percentuais e parcelas preservados." : "Meses abertos usam a divisão atual até o fechamento."}</p>
        </div>
        {!visible.length && (
          <p>Nenhum sócio cadastrado. Defina os nomes e percentuais reais para iniciar.</p>
        )}
        {visible.map((s: any) => {
          const v = shareValues(s);
          const history = withdrawals
            .filter((w: any) => w.share_id === s.id)
            .sort((a: any, b: any) => b.withdrawn_at.localeCompare(a.withdrawn_at));
          return (
            <div key={s.id} className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {s.name} · {s.percent}%
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {s.product_id
                      ? products.find((p) => p.id === s.product_id)?.name
                      : "Todas as categorias"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditing(s);
                      setForm({
                        user_id: s.user_id ?? "",
                        name: s.name,
                        percent: String(s.percent),
                        product_id: s.product_id ?? "geral",
                        notes: s.notes ?? "",
                      });
                      setOpen(true);
                    }}
                  >
                    <Pencil className="size-4" />
                    Editar
                  </Button>
                  <Button
                    onClick={() => {
                      setWithdrawShare(s);
                      setWithdraw({
                        amount: "",
                        currency: "USD",
                        date: new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
                          .toISOString()
                          .slice(0, 16),
                        notes: "",
                      });
                    }}
                  >
                    Registrar retirada
                  </Button>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ["Lucro presumido", v.presumed],
                  ["Lucro distribuível acumulado", v.real],
                  ["Retiradas realizadas", v.taken],
                  ["Saldo disponível para retirada", v.available],
                  ["Entrada presumida atribuída", v.receivablePresumed],
                  ["Entrada recebida atribuída", v.receivableReal],
                  ["Custo presumido atribuído", v.payablePresumed],
                  ["Custo pago atribuído", v.payableReal],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <p className="text-sm text-muted-foreground">{label}</p>
                    <CurrencyValues
                      value={Number(value)}
                      currency="USD"
                      emphasize
                      className={
                        String(label).includes("Custo") ||
                        String(label).includes("Retirada") ||
                        Number(value) < 0
                          ? "text-red-600"
                          : "text-emerald-600"
                      }
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Saldo disponível = parcelas mensais de lucro menos retiradas deste sócio. Uma retirada
                não altera as parcelas dos demais. Meses fechados preservam o percentual e valor
                atribuídos.
              </p>
              {history.length > 0 && (
                <div className="space-y-2">
                  <p className="font-medium">Histórico de retiradas</p>
                  {history.map((w: any) => (
                    <div
                      key={w.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-t pt-2"
                    >
                      <span>
                        {new Date(w.withdrawn_at).toLocaleString("pt-BR")} ·{" "}
                        {w.status === "cancelado" ? "Cancelada" : "Realizada"}
                        {w.notes ? ` · ${w.notes}` : ""}
                      </span>
                      <CurrencyValues value={w.amount_usd} currency="USD" />
                      {w.status !== "cancelado" && (
                        <Button
                          variant="outline"
                          disabled={cancel.isPending}
                          onClick={() => cancel.mutate(w.id)}
                        >
                          Cancelar registro
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Editar sócio" : "Cadastrar sócio"}</DialogTitle>
            </DialogHeader>
            <Label>Membro do sistema</Label>
            <Select
              value={form.user_id || "manual"}
              disabled={
                membersQuery.isPending ||
                (!!editing && withdrawals.some((w: any) => w.share_id === editing.id))
              }
              onValueChange={(value) => {
                const member = members.find((entry: any) => entry.id === value);
                setForm({
                  ...form,
                  user_id: value === "manual" ? "" : value,
                  name: member ? String(member.full_name || member.email || "") : form.name,
                });
              }}
            >
              <SelectTrigger aria-label="Selecionar membro para sócio">
                <SelectValue placeholder="Selecione um membro" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Informar nome manualmente</SelectItem>
                {members.map((member: any) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.full_name || member.email || "Membro sem nome"}
                    {member.full_name && member.email ? ` · ${member.email}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {membersQuery.isError && (
              <div role="alert" className="text-sm text-destructive">
                Não foi possível carregar os membros.{" "}
                <Button type="button" variant="link" onClick={() => membersQuery.refetch()}>
                  Tentar novamente
                </Button>
              </div>
            )}
            <Label>Nome</Label>
            <Input
              value={form.name}
              disabled={!!form.user_id}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Label>Participação (%)</Label>
            <Input
              type="number"
              value={form.percent}
              disabled={!!editing && withdrawals.some((w: any) => w.share_id === editing.id)}
              onChange={(e) => setForm({ ...form, percent: e.target.value })}
            />
            <Label>Categoria</Label>
            <Select
              value={form.product_id}
              disabled={!!editing && withdrawals.some((w: any) => w.share_id === editing.id)}
              onValueChange={(v) => setForm({ ...form, product_id: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="geral">Todas as categorias</SelectItem>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Label>Observações</Label>
            <Input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              O percentual se aplica aos meses em aberto. Após a primeira retirada,
              percentual e categoria ficam preservados.
            </p>
            <DialogFooter>
              <Button disabled={save.isPending} onClick={() => save.mutate()}>
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={!!withdrawShare} onOpenChange={(v) => !v && setWithdrawShare(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Retirada de {withdrawShare?.name}</DialogTitle>
            </DialogHeader>
            <Label>Data e hora</Label>
            <Input
              type="datetime-local"
              value={withdraw.date}
              onChange={(e) => setWithdraw({ ...withdraw, date: e.target.value })}
            />
            <Label>Moeda</Label>
            <Select
              value={withdraw.currency}
              onValueChange={(v) => setWithdraw({ ...withdraw, currency: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">Dólar</SelectItem>
                <SelectItem value="BRL">Real</SelectItem>
                <SelectItem value="PYG">Guarani</SelectItem>
              </SelectContent>
            </Select>
            <Label>Valor</Label>
            <Input
              type="number"
              step="0.01"
              value={withdraw.amount}
              onChange={(e) => setWithdraw({ ...withdraw, amount: e.target.value })}
            />
            <CurrencyValues
              value={Number(withdraw.amount) || 0}
              currency={withdraw.currency as Currency}
            />
            <Label>Observações</Label>
            <Input
              value={withdraw.notes}
              onChange={(e) => setWithdraw({ ...withdraw, notes: e.target.value })}
            />
            <p className="text-sm text-muted-foreground">
              Registre uma retirada já realizada. O sistema não transfere dinheiro. Uma retirada
              acima do lucro deixa o saldo negativo.
            </p>
            <DialogFooter>
              <Button disabled={record.isPending} onClick={() => record.mutate()}>
                Registrar retirada realizada
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
