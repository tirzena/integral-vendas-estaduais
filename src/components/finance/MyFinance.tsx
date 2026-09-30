/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRates, type Currency } from "@/hooks/useRates";
import { formatDate, formatMoney } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { periodStart, SOLD_STATUSES, type RankingPeriod } from "@/hooks/useRanking";
import { financeDateMatches, type FinanceDateRange } from "@/lib/finance-date-range";
import { convertFinancialAmount } from "@/lib/financial-exchange";
import { CurrencyValues } from "@/components/common/CurrencyValues";

type Props = { userId: string | null; period: RankingPeriod; dateRange?: FinanceDateRange };

function Empty({ text }: { text: string }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{text}</p>;
}

function Table({
  rows,
  headers,
  render,
  empty,
}: {
  rows: any[];
  headers: string[];
  render: (r: any) => React.ReactNode[];
  empty: string;
}) {
  if (!rows.length) return <Empty text={empty} />;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left">
          <tr>
            {headers.map((h) => (
              <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              {render(r).map((cell, i) => (
                <td key={i} className="whitespace-nowrap px-3 py-2">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Área financeira pessoal: só o que é do próprio membro. */
export function MyFinance({ userId, period, dateRange }: Props) {
  const { convert } = useRates();

  const query = useQuery({
    enabled: !!userId,
    queryKey: ["my-finance", userId],
    queryFn: async () => {
      const uid = userId as string;
      const [payroll, bonuses, comps, orders] = await Promise.all([
        supabase
          .from("payroll_entries")
          .select("*")
          .eq("user_id", uid)
          .order("created_at", { ascending: false }),
        supabase
          .from("bonus_awards")
          .select("*")
          .eq("user_id", uid)
          .order("created_at", { ascending: false }),
        supabase.from("member_compensations").select("*").eq("user_id", uid),
        supabase
          .from("orders")
          .select("id,number,total,currency,status,created_at,customer_id,customers(name)")
          .eq("seller_id", uid)
          .order("created_at", { ascending: false }),
      ]);
      const orderIds = (orders.data ?? []).map((o: any) => o.id);
      const receivable = orderIds.length
        ? await supabase
            .from("accounts_receivable")
            .select("*")
            .in("order_id", orderIds)
            .order("due_date", { ascending: true })
        : { data: [] as any[] };
      return {
        payroll: payroll.data ?? [],
        bonuses: bonuses.data ?? [],
        comps: comps.data ?? [],
        orders: orders.data ?? [],
        receivable: receivable.data ?? [],
      };
    },
  });

  const data = query.data;

  const view = useMemo(() => {
    const from = periodStart(period);
    const inPeriod = (d?: string | null) => dateRange
      ? financeDateMatches(d, dateRange)
      : !from || (d ? new Date(d) >= from : false);
    const usd = (row: any) => convertFinancialAmount(row, "USD", convert);

    const payroll = (data?.payroll ?? []).filter((r: any) =>
      inPeriod(r.paid_at ?? r.period_end ?? r.created_at),
    );
    const bonuses = (data?.bonuses ?? []).filter((r: any) =>
      inPeriod(r.period_end ?? r.created_at),
    );
    const orders = (data?.orders ?? []).filter((r: any) => inPeriod(r.created_at));
    const receivable = (data?.receivable ?? []).filter((r: any) =>
      inPeriod(r.paid_at ?? r.due_date ?? r.created_at),
    );

    const sum = (rows: any[], pick: (r: any) => boolean = () => true) =>
      rows.filter(pick).reduce((acc, r) => acc + usd(r), 0);

    const sales = orders
      .filter((o: any) => o.status !== "cancelado")
      .reduce(
        (acc: number, o: any) =>
          acc + (convert(Number(o.total ?? 0), (o.currency ?? "USD") as Currency, "USD") ?? 0),
        0,
      );
    const soldOrders = orders.filter((o: any) => SOLD_STATUSES.includes(o.status));

    return {
      payroll,
      bonuses,
      orders,
      receivable,
      comps: data?.comps ?? [],
      sales,
      soldCount: soldOrders.length,
      commission: sum(payroll, (r) => r.entry_type === "comissao"),
      received: sum(payroll, (r) => r.status === "pago") + sum(bonuses, (r) => r.status === "pago"),
      pending: sum(payroll, (r) => r.status !== "pago") + sum(bonuses, (r) => r.status !== "pago"),
      bonusTotal: sum(bonuses),
      openCharges: sum(receivable, (r) => r.status !== "pago"),
    };
  }, [data, period, dateRange?.from?.getTime(), dateRange?.through.getTime(), convert]);

  if (query.isLoading) return <Empty text="Carregando seus valores…" />;

  const cards = [
    { label: "Minhas vendas", value: view.sales, hint: `${view.soldCount} pedido(s) concluído(s)` },
    { label: "Comissões", value: view.commission, hint: "Lançadas na folha" },
    { label: "Bonificações", value: view.bonusTotal, hint: "Prêmios do período" },
    { label: "Já recebi", value: view.received, hint: "Pagamentos quitados" },
    { label: "A receber", value: view.pending, hint: "Ainda em aberto" },
    {
      label: "Cobranças dos meus pedidos",
      value: view.openCharges,
      hint: "Clientes que ainda não pagaram",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">{c.label}</p>
              <CurrencyValues value={c.value} currency="USD" className="text-xl" emphasize />
              <p className="text-xs text-muted-foreground">{c.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="pagamentos">
        <TabsList>
          <TabsTrigger value="pagamentos">Pagamentos e comissões</TabsTrigger>
          <TabsTrigger value="bonificacoes">Bonificações</TabsTrigger>
          <TabsTrigger value="vendas">Minhas vendas</TabsTrigger>
          <TabsTrigger value="cobrancas">Cobranças</TabsTrigger>
          <TabsTrigger value="acordos">Meus acordos</TabsTrigger>
        </TabsList>

        <TabsContent value="pagamentos" className="pt-4">
          <Table
            rows={view.payroll}
            headers={["Tipo", "Descrição", "Valor", "Período", "Pagamento", "Situação"]}
            empty="Nenhum pagamento lançado no período."
            render={(r) => [
              r.entry_type ?? "—",
              r.description ?? "—",
              <CurrencyValues value={r.amount} currency={r.currency} />,
              `${formatDate(r.period_start)} — ${formatDate(r.period_end)}`,
              formatDate(r.paid_at),
              <Badge variant={r.status === "pago" ? "default" : "secondary"}>
                {r.status === "pago" ? "Pago" : "Em aberto"}
              </Badge>,
            ]}
          />
        </TabsContent>

        <TabsContent value="bonificacoes" className="pt-4">
          <Table
            rows={view.bonuses}
            headers={["Descrição", "Valor", "Período", "Situação"]}
            empty="Nenhuma bonificação no período."
            render={(r) => [
              r.description ?? "—",
              <CurrencyValues value={r.amount} currency={r.currency} />,
              `${formatDate(r.period_start)} — ${formatDate(r.period_end)}`,
              <Badge variant={r.status === "pago" ? "default" : "secondary"}>
                {r.status === "pago" ? "Pago" : "Em aberto"}
              </Badge>,
            ]}
          />
        </TabsContent>

        <TabsContent value="vendas" className="pt-4">
          <Table
            rows={view.orders}
            headers={["Pedido", "Cliente", "Valor", "Situação", "Data"]}
            empty="Nenhuma venda registrada no período."
            render={(r) => [
              `#${r.number ?? "—"}`,
              r.customers?.name ?? "—",
              <CurrencyValues value={r.total} currency={r.currency} />,
              <Badge variant="secondary">{r.status ?? "—"}</Badge>,
              formatDate(r.created_at),
            ]}
          />
        </TabsContent>

        <TabsContent value="cobrancas" className="pt-4">
          <Table
            rows={view.receivable}
            headers={["Descrição", "Valor", "Vencimento", "Pagamento", "Situação"]}
            empty="Nenhuma cobrança ligada aos seus pedidos."
            render={(r) => [
              r.description ?? "—",
              <CurrencyValues value={r.amount} currency={r.currency} />,
              formatDate(r.due_date),
              formatDate(r.paid_at),
              <Badge variant={r.status === "pago" ? "default" : "secondary"}>
                {r.status === "pago" ? "Pago" : "Em aberto"}
              </Badge>,
            ]}
          />
        </TabsContent>

        <TabsContent value="acordos" className="pt-4">
          <Table
            rows={view.comps}
            headers={["Acordo", "Tipo", "Valor", "Periodicidade", "Ativo"]}
            empty="Nenhum acordo de remuneração cadastrado para você."
            render={(r) => [
              r.label ?? "—",
              r.comp_type ?? "—",
              r.comp_type === "percentual" ? (
                `${Number(r.amount ?? 0)}%`
              ) : (
                <CurrencyValues value={r.amount} currency={r.currency} />
              ),
              r.period ?? "—",
              <Badge variant={r.active ? "default" : "outline"}>{r.active ? "Sim" : "Não"}</Badge>,
            ]}
          />
        </TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground">
        Pagamentos quitados usam a cotação registrada na data. Valores em aberto acompanham a
        cotação atual.
      </p>
    </div>
  );
}
