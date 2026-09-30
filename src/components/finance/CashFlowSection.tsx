/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useProductScope } from "@/hooks/useProductScope";
import { useRates } from "@/hooks/useRates";
import { formatMoney } from "@/lib/format";
import type { Currency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { periodStart, type RankingPeriod } from "@/hooks/useRanking";
import type { FinanceDateRange } from "@/lib/finance-date-range";
import { useState, useContext } from "react";
import { useFinanceTotals } from "@/hooks/useFinanceTotals";
import { CurrencyValues, DisplayCurrencyContext } from "@/components/common/CurrencyValues";

const DISPLAY: { value: Currency; label: string }[] = [
  { value: "BRL", label: "Ver em real (R$)" },
  { value: "USD", label: "Ver em dólar (US$)" },
  { value: "PYG", label: "Ver em guarani (₲)" },
];

/** Fluxo de caixa geral: entradas e saídas de todas as origens no período. */
export function CashFlowSection({ period, dateRange, productIdOverride }: { period: RankingPeriod; dateRange?: FinanceDateRange; productIdOverride?: string }) {
  const { productId } = useProductScope();
  const rates = useRates();
  const { convert } = rates;
  const selected = useContext(DisplayCurrencyContext);
  const [localDisplay, setDisplay] = useState<Currency>("BRL");
  const display = selected ?? localDisplay;
  const [chart, setChart] = useState<"linha" | "barra">("linha");

  const finance = useFinanceTotals(period, productIdOverride ?? productId, dateRange);
  const { totals, events } = finance;
  const data = useMemo(() => {
    const cv = (value: number) => convert(value, "USD", display) ?? 0;
    const daily = new Map<string, { in: number; out: number }>();
    for (const e of events) {
      const d = new Date(e.date.length === 10 ? e.date + "T00:00:00" : e.date);
      const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const row = daily.get(day) ?? { in: 0, out: 0 };
      row[e.kind] += cv(e.amount);
      daily.set(day, row);
    }
    const sum = (source: string, kind: string) =>
      cv(
        events
          .filter((e) => e.source === source && e.kind === kind)
          .reduce((n, e) => n + e.amount, 0),
      );
    return {
      cashIn: cv(totals.cashIn),
      cashOut: cv(totals.cashOut),
      result: cv(totals.netProfit),
      salesCash: cv(totals.salesPaid),
      receivedAccounts: sum("Outros recebimentos", "in"),
      reinforcements: sum("Caixa", "in"),
      withdrawals: sum("Caixa", "out"),
      paidAccounts: sum("Pagamentos", "out") + sum("Bonificações", "out"),
      suppliersPaid: cv(totals.purchasesPaid),
      partnerWithdrawals: cv(totals.withdrawals),
      afterWithdrawals: cv(totals.cashAvailable),
      receivableOpen: cv(totals.receivableOpen),
      payableOpen: cv(totals.payableOpen),
      series: [...daily]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, row]) => ({
          dia: day.slice(8, 10) + "/" + day.slice(5, 7),
          entradas: row.in,
          saidas: row.out,
        })),
    };
  }, [totals, events, convert, display]);

  const money = (v: number) => <CurrencyValues value={v} currency={display} />;
  const tooltipMoney = (v: number) => rates.money(v, display, display);

  if (finance.loading || !finance.ratesReady) return <p>Carregando fluxo de caixa…</p>;
  if (finance.error) return <p role="alert">Não foi possível carregar o fluxo de caixa.</p>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!selected && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Moeda:</span>
            <Select value={display} onValueChange={(v) => setDisplay(v as Currency)}>
              <SelectTrigger className="w-[190px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DISPLAY.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <Tabs value={chart} onValueChange={(v) => setChart(v as any)}>
          <TabsList>
            <TabsTrigger value="linha">Linha</TabsTrigger>
            <TabsTrigger value="barra">Barra</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Total label="Total de entradas" value={money(data.cashIn)} tone="up" />
        <Total label="Total de saídas" value={money(data.cashOut)} tone="down" />
        <Total label="Resultado do período" value={money(data.result)} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Entradas e saídas diárias no período</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px]">
          {data.series.length === 0 ? (
            <p className="pt-10 text-center text-sm text-muted-foreground">
              Nenhuma movimentação no período selecionado.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              {chart === "linha" ? (
                <LineChart data={data.series}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="dia" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip formatter={(v: any) => tooltipMoney(Number(v))} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="entradas"
                    name="Total de entradas"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="saidas"
                    name="Total de saídas"
                    stroke="hsl(var(--destructive))"
                    strokeWidth={2}
                  />
                </LineChart>
              ) : (
                <BarChart data={data.series}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="dia" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip formatter={(v: any) => tooltipMoney(Number(v))} />
                  <Legend />
                  <Bar dataKey="entradas" name="Total de entradas" fill="hsl(var(--primary))" />
                  <Bar dataKey="saidas" name="Total de saídas" fill="hsl(var(--destructive))" />
                </BarChart>
              )}
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-emerald-600">Entradas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <Row label="Vendas em caixa" value={money(data.salesCash)} />
            <Row label="Outras entradas de caixa" value={money(data.reinforcements)} />
            <Row label="Contas a receber (recebidas)" value={money(data.receivedAccounts)} />
            <Row label="Total de entradas" value={money(data.cashIn)} strong tone="up" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-destructive">Saídas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <Row label="Saídas de caixa / sangrias" value={money(data.withdrawals)} />
            <Row label="Contas pagas" value={money(data.paidAccounts)} />
            <Row label="Pago aos fornecedores" value={money(data.suppliersPaid)} />
            <Row label="Total de saídas" value={money(data.cashOut)} strong tone="down" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Resultado do período</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <Row label="A receber em aberto" value={money(data.receivableOpen)} />
          <Row label="A pagar em aberto" value={money(data.payableOpen)} />
          <Row label="Total geral (entradas − saídas)" value={money(data.result)} strong />
          <Row label="Retiradas dos sócios" value={money(data.partnerWithdrawals)} />
          <Row label="Resultado após retiradas" value={money(data.afterWithdrawals)} strong />
          <Row
            label="Projeção com contas em aberto"
            value={money(data.result + data.receivableOpen - data.payableOpen)}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function Total({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "up" | "down";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={`text-xl font-semibold ${tone === "up" ? "text-emerald-600" : tone === "down" ? "text-destructive" : ""}`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
  tone?: "up" | "down";
}) {
  return (
    <div
      className={`flex items-center justify-between rounded-md px-2 py-1.5 ${strong ? "bg-muted font-semibold" : ""}`}
    >
      <span>{label}</span>
      <span
        className={
          tone === "up" ? "text-emerald-600" : tone === "down" ? "text-destructive" : undefined
        }
      >
        {value}
      </span>
    </div>
  );
}
