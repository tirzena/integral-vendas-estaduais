/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { ResourcePage } from "@/components/common/ResourcePage";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCurrentUser } from "@/hooks/useAuth";
import { usePeople } from "@/hooks/usePeople";
import { useRates } from "@/hooks/useRates";
import { useProductScope } from "@/hooks/useProductScope";
import { useMarketQuotes } from "@/hooks/useMarketQuotes";
import { useRows } from "@/lib/db";
import { CURRENCIES, formatDate, formatMoney, formatNumber } from "@/lib/format";
import { CurrencyValues } from "@/components/common/CurrencyValues";

/** Valor atual de uma aplicação: ao vivo para cripto/ação, com juros para renda fixa. */
function currentValue(row: any, price: number | null) {
  const amount = Number(row.amount ?? 0);
  const type = row.asset_type ?? "manual";
  if ((type === "cripto" || type === "acao") && price && Number(row.quantity ?? 0) > 0) {
    return Number(row.quantity) * price;
  }
  if (type === "cdb" && row.annual_rate && row.invested_at) {
    const days = (Date.now() - new Date(row.invested_at).getTime()) / 86_400_000;
    if (days > 0) return amount * Math.pow(1 + Number(row.annual_rate) / 100, days / 365);
  }
  const realized = Number(row.realized_return ?? 0);
  return amount + realized;
}

export function InvestmentsSection({ filterRow }: { filterRow?: (row: any) => boolean } = {}) {
  const { userId, isAdmin } = useCurrentUser();
  const { nameOf } = usePeople();
  const { money } = useRates();
  const [scope, setScope] = useState<"personal" | "company" | "todos">("personal");
  const { products, productId, current } = useProductScope();
  const productOptions = products.map((p) => ({ value: p.id, label: p.name }));

  const filter: Record<string, any> = {
    ...(scope === "todos" ? {} : { scope }),
    ...(productId === "todos" ? {} : { product_id: productId }),
  };
  const query = useRows<any>("investments", {
    orderBy: { column: "invested_at", ascending: false },
  });
  const rows = useMemo(
    () =>
      (query.data ?? []).filter(
        (r: any) =>
          (scope === "todos" ? true : r.scope === scope) &&
          (productId === "todos" ? true : r.product_id === productId),
      ),
    [query.data, scope, productId],
  );

  const watchlist = useRows<any>("market_watchlist", {
    orderBy: { column: "position", ascending: true },
  });
  const symbols = useMemo(() => rows.map((r: any) => r.symbol).filter(Boolean) as string[], [rows]);
  const { priceOf, updatedAt } = useMarketQuotes(symbols);

  const totals = useMemo(() => {
    let applied = 0;
    let realized = 0;
    let current = 0;
    for (const r of rows) {
      applied += Number(r.amount ?? 0);
      realized += Number(r.realized_return ?? 0);
      current += currentValue(r, priceOf(r.symbol));
    }
    return { applied, realized, current, profit: current - applied };
  }, [rows, priceOf]);

  const scopeOptions = isAdmin
    ? [
        { value: "personal", label: "Investimento pessoal (só eu vejo)" },
        { value: "company", label: "Investimento da empresa" },
      ]
    : [{ value: "personal", label: "Investimento pessoal (só eu vejo)" }];

  const symbolHelp =
    (watchlist.data ?? []).length > 0
      ? `Códigos já acompanhados: ${(watchlist.data ?? [])
          .map((w: any) => w.symbol)
          .slice(0, 8)
          .join(", ")}`
      : "Exemplos: BTC-USD, ETH-USD, PETR4.SA, EURUSD=X";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Mostrar:</span>
        <Select value={scope} onValueChange={(v) => setScope(v as any)}>
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="personal">Pessoais</SelectItem>
            <SelectItem value="company">Da empresa</SelectItem>
            <SelectItem value="todos">Todos</SelectItem>
          </SelectContent>
        </Select>
        {productId !== "todos" && <Badge variant="secondary">Categoria: {current?.name}</Badge>}
        {updatedAt > 0 && (
          <span className="text-xs text-muted-foreground">
            Preços ao vivo às {new Date(updatedAt).toLocaleTimeString("pt-BR")}
          </span>
        )}
      </div>

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total aplicado (em dólar)</p>
            <CurrencyValues
              value={totals.applied}
              currency="USD"
              className="font-display text-xl"
              emphasize
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Valor atual ao vivo (em dólar)</p>
            <CurrencyValues
              value={totals.current}
              currency="USD"
              className="font-display text-xl"
              emphasize
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Ganho ou perda</p>
            <p
              className={`font-display text-xl font-semibold ${
                totals.profit >= 0 ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              <CurrencyValues value={totals.profit} currency="USD" />
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Retorno já realizado:{" "}
              <CurrencyValues value={totals.realized} currency="USD" layout="inline" />
            </p>
          </CardContent>
        </Card>
      </div>

      <ResourcePage
        title="Investimentos"
        description={
          isAdmin
            ? "Investimentos da empresa e pessoais de cada membro. Criptomoedas e ações se atualizam sozinhas; renda fixa rende pela taxa anual informada."
            : "Seus investimentos. Só você e a administração enxergam esta lista."
        }
        table="investments"
        {...(filterRow ? { filterRow } : {})}
        filter={filter}
        searchKeys={["name", "category", "symbol"]}
        orderBy={{ column: "invested_at", ascending: false }}
        emptyTitle="Nenhum investimento cadastrado"
        emptyDescription="Cadastre uma aplicação para acompanhar valor investido e retorno."
        beforeSave={(v) => ({
          ...v,
          owner_id: v["owner_id"] ?? userId,
          product_id: v["product_id"] || (productId === "todos" ? null : productId),
          scope: v["scope"] ?? (scope === "todos" ? "personal" : scope),
          symbol: v["symbol"] ? String(v["symbol"]).trim().toUpperCase() : null,
        })}
        columns={[
          { key: "name", label: "Investimento" },
          {
            key: "asset_type",
            label: "Aplicação",
            render: (r: any) =>
              ({ cripto: "Cripto", acao: "Ação/índice", cdb: "CDB/renda fixa", manual: "Outros" })[
                (r.asset_type ?? "manual") as string
              ] ?? "Outros",
          },
          {
            key: "scope",
            label: "Tipo",
            render: (r: any) => (
              <Badge variant={r.scope === "company" ? "default" : "secondary"}>
                {r.scope === "company" ? "Empresa" : "Pessoal"}
              </Badge>
            ),
          },
          ...(isAdmin
            ? [{ key: "owner_id", label: "De quem", render: (r: any) => nameOf(r.owner_id) }]
            : []),
          {
            key: "amount",
            label: "Aplicado",
            render: (r: any) => <CurrencyValues value={r.amount} currency={r.currency} />,
          },
          {
            key: "live",
            label: "Valor atual",
            render: (r: any) => {
              const value = currentValue(r, priceOf(r.symbol));
              const diff = value - Number(r.amount ?? 0);
              return (
                <div>
                  <CurrencyValues value={value} currency={r.currency} emphasize />
                  <p className={`text-xs ${diff >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {diff >= 0 ? "+" : ""}
                    <CurrencyValues value={diff} currency={r.currency} layout="inline" />
                    {r.symbol && priceOf(r.symbol)
                      ? ` · ${r.symbol} ${formatNumber(priceOf(r.symbol) ?? 0, 2)}`
                      : ""}
                  </p>
                </div>
              );
            },
          },
          { key: "invested_at", label: "Data", render: (r: any) => formatDate(r.invested_at) },
          { key: "status", label: "Situação" },
        ]}
        fields={[
          { name: "name", label: "Nome do investimento", required: true, full: true },
          {
            name: "asset_type",
            label: "Tipo de aplicação",
            type: "select",
            defaultValue: "manual",
            options: [
              { value: "manual", label: "Outros (valor informado por você)" },
              { value: "cripto", label: "Criptomoeda (preço ao vivo)" },
              { value: "acao", label: "Ação ou índice (preço ao vivo)" },
              { value: "cdb", label: "CDB / renda fixa (rende pela taxa)" },
            ],
          },
          {
            name: "symbol",
            label: "Código do ativo",
            placeholder: "BTC-USD",
            help: symbolHelp,
          },
          { name: "quantity", label: "Quantidade comprada", type: "number" },
          { name: "annual_rate", label: "Taxa ao ano (%) para renda fixa", type: "number" },
          {
            name: "product_id",
            label: "Categoria (área) do investimento",
            type: "select",
            options: productOptions,
          },
          {
            name: "category",
            label: "Tipo / categoria",
            placeholder: "Estoque, marketing, renda fixa",
          },
          {
            name: "scope",
            label: "Visibilidade",
            type: "select",
            defaultValue: "personal",
            options: scopeOptions,
          },
          { name: "amount", label: "Valor aplicado", type: "number", required: true },
          {
            name: "currency",
            label: "Moeda",
            type: "select",
            defaultValue: "USD",
            options: CURRENCIES.map((c) => ({ value: c.value, label: c.label })),
          },
          { name: "invested_at", label: "Data da aplicação", type: "date" },
          { name: "expected_return", label: "Retorno esperado", type: "number" },
          { name: "realized_return", label: "Retorno já realizado", type: "number" },
          {
            name: "status",
            label: "Situação",
            type: "select",
            defaultValue: "ativo",
            options: [
              { value: "ativo", label: "Ativo" },
              { value: "encerrado", label: "Encerrado" },
              { value: "planejado", label: "Planejado" },
            ],
          },
          { name: "notes", label: "Observações", type: "textarea" },
        ]}
      />
    </div>
  );
}
