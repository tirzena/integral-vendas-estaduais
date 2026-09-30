import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Package, TrendingUp, Wallet, Receipt, Landmark } from "lucide-react";
import { getSupplierSummary } from "@/lib/supplier-stock.functions";
import { useRates, type Currency } from "@/hooks/useRates";
import { formatMoney, formatNumber } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
export function SupplierSummary({ supplierId }: { supplierId: string }) {
  const [currency, setCurrency] = useState<Currency>("USD");
  const { convert } = useRates();
  const q = useQuery({
    queryKey: ["supplier-summary", supplierId],
    queryFn: () => getSupplierSummary({ data: { supplierId } }),
  });
  if (q.isPending) return <p>Calculando resumo…</p>;
  if (q.isError) return <p role="alert">{q.error.message}</p>;
  const d = q.data;
  const sum = (type: string) => {
    let value = 0;
    for (const e of d.entries.filter((e) => e.type === type)) {
      const converted = convert(e.value, e.currency as Currency, currency);
      if (converted === null) return null;
      value += converted;
    }
    return value;
  };
  const investment = sum("investment"),
    sales = sum("sales"),
    received = sum("received"),
    cost = sum("soldCost"),
    paid = sum("supplierPaid");
  const diff = (a: number | null, b: number | null) => (a === null || b === null ? null : a - b);
  const money = (v: number | null) =>
    v === null ? "Cotação indisponível" : formatMoney(v, currency);
  const result = diff(sales, cost),
    cash = diff(received, paid);
  const recovery =
    investment && received !== null ? Math.min(100, (received / investment) * 100) : 0;
  const cards = [
    {
      label: "Investimento inicial nos lotes",
      value: investment,
      detail: `${formatNumber(d.bought)} unidades adquiridas`,
      icon: Landmark,
      tone: "text-red-600",
    },
    {
      label: "Vendas de produtos",
      value: sales,
      detail: `${d.orderCount} pedidos · ${formatNumber(d.sold)} unidades`,
      icon: TrendingUp,
      tone: "text-emerald-600",
    },
    {
      label: "Recebido dos clientes",
      value: received,
      detail: "Recebimentos integrais e parciais proporcionais aos produtos",
      icon: Wallet,
      tone: "text-emerald-600",
    },
    {
      label: "Custo dos produtos vendidos",
      value: cost,
      detail: `${formatNumber(d.sold)} unidades · estoque restante separado`,
      icon: Package,
      tone: "text-red-600",
    },
    {
      label: "Resultado das vendas",
      value: result,
      detail: "Vendas de produtos menos custo das unidades vendidas",
      icon: TrendingUp,
      tone: (result ?? 0) >= 0 ? "text-emerald-600" : "text-red-600",
    },
    {
      label: "Compras registradas no OS",
      value: sum("purchases"),
      detail: `${d.purchaseCount} compras ativas · consolidações sem duplicar custo`,
      icon: Receipt,
      tone: "text-red-600",
    },
    {
      label: "Pago ao fornecedor",
      value: paid,
      detail: "Repasses registrados, incluindo pagamentos parciais",
      icon: Receipt,
      tone: "text-red-600",
    },
    {
      label: "Saldo a pagar ao fornecedor",
      value: sum("supplierDebt"),
      detail: "Compras menos repasses registrados",
      icon: Receipt,
      tone: "text-red-600",
    },
    {
      label: "Resultado de caixa",
      value: cash,
      detail: "Recebido dos clientes menos repasses ao fornecedor; antes de despesas e retiradas",
      icon: Wallet,
      tone: (cash ?? 0) >= 0 ? "text-emerald-600" : "text-red-600",
    },
  ];
  return (
    <section className="mb-6 space-y-4" aria-label="Resumo do fornecedor">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Investimento, vendas e estoque</h2>
        <label className="flex items-center gap-2 text-sm">
          Moeda do resumo
          <select
            aria-label="Moeda do resumo"
            className="rounded-lg border bg-background p-2"
            value={currency}
            onChange={(e) => setCurrency(e.target.value as Currency)}
          >
            <option value="USD">Dólar (US$)</option>
            <option value="BRL">Real (R$)</option>
            <option value="PYG">Guarani (Gs.)</option>
          </select>
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="space-y-2 pt-5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <c.icon className={`size-5 ${c.tone}`} />
                {c.label}
              </div>
              <p className={`text-xl font-semibold ${c.tone}`}>{money(c.value)}</p>
              <p className="text-xs text-muted-foreground">{c.detail}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="space-y-3 pt-5">
          <p className="font-semibold">
            Estoque dos lotes: {formatNumber(d.remaining)} unidades restantes
          </p>
          <p className="text-sm text-muted-foreground">
            Inclui saldo no fornecedor e saldo dos lotes recebidos pelo OS. Estoques anteriores fora
            dos lotes ficam separados.
          </p>
          <div className="flex justify-between text-sm">
            <span>Unidades vendidas</span>
            <strong>
              {formatNumber(d.sold)} / {formatNumber(d.bought)}
            </strong>
          </div>
          <Progress value={d.bought ? Math.min(100, (d.sold / d.bought) * 100) : 0} />
          <div className="flex justify-between text-sm">
            <span>Investimento recuperado por recebimentos</span>
            <strong>{formatNumber(recovery, 1)}%</strong>
          </div>
          <Progress value={recovery} />
          <p className="text-xs text-muted-foreground">
            Recuperação compara recebimentos ao investimento total; não representa lucro. Lotes
            identificados como TEST são simulações.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
