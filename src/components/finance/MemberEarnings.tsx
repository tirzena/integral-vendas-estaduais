/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFinanceTotals } from "@/hooks/useFinanceTotals";
import { usePeople } from "@/hooks/usePeople";
import { useRates, type Currency } from "@/hooks/useRates";
import { memberEarnings } from "@/lib/member-earnings";
import { formatMoney, formatDate, CURRENCIES } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReportButton } from "@/components/common/ReportButton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
export function MemberEarnings({ currency = "USD" }: { currency?: Currency }) {
  const finance = useFinanceTotals("tudo", "todos");
  const productId = "todos";
  const { people, nameOf } = usePeople();
  const rates = useRates();
  const qc = useQueryClient();
  const [member, setMember] = useState("todos");
  const [taking, setTaking] = useState<any>(null);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [withdrawCurrency, setWithdrawCurrency] = useState<Currency>(currency);
  const all = memberEarnings(finance.data ?? {}, rates.convert, productId);
  for (const p of people)
    if (!all.some((r) => r.userId === p.id))
      all.push({
        userId: p.id,
        sales: 0,
        received: 0,
        commission: 0,
        released: 0,
        bonus: 0,
        withdrawn: 0,
        available: 0,
        deficit: 0,
        details: [],
      });
  const rows = all
    .filter((r) => member === "todos" || r.userId === member)
    .sort((a, b) => nameOf(a.userId).localeCompare(nameOf(b.userId)));
  const money = (n: number) =>
    rates.ready ? formatMoney(rates.convert(n, "USD", currency) ?? 0, currency) : "—";
  const withdrawals = [
    ...(finance.data?.payroll ?? []).filter(
      (p: any) =>
        p.status === "pago" &&
        ["commission", "comissao", "bonus", "bonificacao"].includes(p.entry_type),
    ),
    ...(finance.data?.awards ?? [])
      .filter((b: any) => b.status === "pago")
      .map((b: any) => ({
        ...b,
        id: `bonus-${b.id}`,
        paid_at: b.paid_at ?? b.updated_at ?? b.created_at,
        description: b.description || "Bonificação paga",
      })),
  ].sort((a: any, b: any) => String(b.paid_at ?? "").localeCompare(String(a.paid_at ?? "")));
  const build = (selected: any[]) => {
    if (finance.loading || finance.error || !rates.ready)
      throw new Error("Aguarde os dados e as cotações carregarem.");
    return {
      headers: [
        "Membro",
        "Vendas",
        "Recebido",
        "Comissão prevista",
        "Comissão liberada",
        "Bonificação liberada",
        "Retirado",
        "Saldo disponível",
      ],
      rows: selected.map((r) => [
        nameOf(r.userId),
        money(r.sales),
        money(r.received),
        money(r.commission),
        money(r.released),
        money(r.bonus),
        money(r.withdrawn),
        money(r.available),
      ]),
      sections: [
        {
          title: "Pedidos por membro",
          headers: [
            "Membro",
            "Pedido",
            "Data",
            "Vendas",
            "Recebido",
            "Comissão prevista",
            "Comissão liberada",
          ],
          rows: selected.flatMap((r) =>
            r.details.map((d: any) => [
              nameOf(r.userId),
              d.number,
              formatDate(d.date),
              money(d.sales),
              money(d.received),
              money(d.commission),
              money(d.released),
            ]),
          ),
        },
        {
          title: "Retiradas",
          headers: ["Membro", "Data", "Descrição", "Valor"],
          rows: withdrawals
            .filter((p: any) => selected.some((r: any) => r.userId === p.user_id))
            .map((p: any) => [
              nameOf(p.user_id),
              formatDate(p.paid_at),
              p.description,
              formatMoney(p.amount, p.currency),
            ]),
        },
      ],
    };
  };
  const save = useMutation({
    mutationFn: async () => {
      const n = Number(amount);
      if (!rates.ready || !(n > 0) || !date) throw new Error("Informe valor positivo e data.");
      const { error } = await (supabase as any).rpc("finance_withdraw_member_earnings", {
        p_user_id: taking.userId,
        p_product_id: productId === "todos" ? null : productId,
        p_amount: n,
        p_currency: withdrawCurrency,
        p_paid_at: date,
        p_notes: notes,
        p_request_id: taking.requestId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries();
      setTaking(null);
      toast.success("Retirada registrada.");
    },
    onError: (e: any) => toast.error(e.message),
  });
  if (finance.loading) return <p>Carregando comissões…</p>;
  if (finance.error) return <p role="alert">Não foi possível carregar as comissões.</p>;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Saldo acumulado desde o início, em todas as categorias. Comissão liberada proporcionalmente
        ao pagamento de cada pedido; bonificações liberadas integralmente ao serem concedidas.
        Retiradas reduzem o saldo disponível.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Label htmlFor="earnings-member">Membro</Label>
        <select
          id="earnings-member"
          className="rounded-md border bg-background p-2"
          value={member}
          onChange={(e) => setMember(e.target.value)}
        >
          <option value="todos">Todos os membros</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <ReportButton
          title="Comissões e bonificações por membro"
          filename="comissoes-geral"
          description="Saldo acumulado em todas as categorias. Comissões proporcionais aos pagamentos; bonificações integrais; retiradas descontadas do saldo."
          label="Relatório geral"
          build={() => build(all)}
        />
      </div>
      <Tabs defaultValue="saldos">
        <TabsList>
          <TabsTrigger value="saldos">Comissões e bonificações</TabsTrigger>
          <TabsTrigger value="retiradas">Retiradas</TabsTrigger>
        </TabsList>
        <TabsContent value="saldos" className="space-y-4">
          {rows.map((r) => (
            <div key={r.userId} className="surface-card space-y-4 p-5">
              <div className="flex flex-wrap justify-between gap-2">
                <h3 className="font-bold">{nameOf(r.userId)}</h3>
                <ReportButton
                  title={`Comissões — ${nameOf(r.userId)}`}
                  filename="comissoes-membro"
                  description="Saldo acumulado desde o início; valores na moeda selecionada."
                  label="Relatório individual"
                  build={() => build([r])}
                />
              </div>
              <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {[
                  ["Vendas", r.sales],
                  ["Recebido dos clientes", r.received],
                  ["Comissão prevista", r.commission],
                  ["Comissão liberada", r.released],
                  ["Bonificação liberada", r.bonus],
                  ["Total retirado", r.withdrawn],
                  ["Saldo disponível", r.available],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <dt className="text-sm text-muted-foreground">{label}</dt>
                    <dd className="font-semibold">{money(Number(value))}</dd>
                  </div>
                ))}
              </dl>
              {r.deficit > 0 && (
                <p role="alert" className="text-destructive">
                  Retiradas anteriores excedem o valor liberado em {money(r.deficit)}. Confira os
                  lançamentos.
                </p>
              )}
              <Button
                disabled={!rates.ready || r.available <= 0}
                onClick={() => {
                  setTaking({ ...r, requestId: crypto.randomUUID() });
                  setAmount("");
                  setNotes("");
                  setWithdrawCurrency(currency);
                }}
              >
                Registrar retirada
              </Button>
            </div>
          ))}
        </TabsContent>
        <TabsContent value="retiradas">
          <div className="surface-card p-5">
            {withdrawals
              .filter((p: any) => member === "todos" || p.user_id === member)
              .map((p: any) => (
                <p key={p.id} className="border-b py-3">
                  {nameOf(p.user_id)} · {formatDate(p.paid_at)} ·{" "}
                  {formatMoney(p.amount, p.currency)} · {p.description}
                </p>
              ))}
            <p className="mt-4 text-sm text-muted-foreground">
              As retiradas registradas ficam no histórico da folha e nos relatórios.
            </p>
          </div>
        </TabsContent>
      </Tabs>
      <Dialog
        open={!!taking}
        onOpenChange={(o) => {
          if (!o && !save.isPending) setTaking(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Retirada — {nameOf(taking?.userId)}</DialogTitle>
          </DialogHeader>
          <p>Saldo disponível: {money(taking?.available ?? 0)}</p>
          <Label htmlFor="withdraw-currency">Moeda</Label>
          <select
            id="withdraw-currency"
            value={withdrawCurrency}
            onChange={(e) => setWithdrawCurrency(e.target.value as Currency)}
          >
            {CURRENCIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <Label htmlFor="withdraw-value">Valor da retirada</Label>
          <Input
            id="withdraw-value"
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Label htmlFor="withdraw-date">Data</Label>
          <Input
            id="withdraw-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <Label htmlFor="withdraw-notes">Observações</Label>
          <Input id="withdraw-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            Registrar retirada
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
