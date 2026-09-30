/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/common/PageHeader";
import { ResourcePage } from "@/components/common/ResourcePage";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProductScope } from "@/hooks/useProductScope";
import { useCurrentUser } from "@/hooks/useAuth";
import { useRanking, PERIOD_OPTIONS, type RankingPeriod } from "@/hooks/useRanking";
import { CURRENCIES, formatMoney, formatNumber } from "@/lib/format";
import { CurrencyValues } from "@/components/common/CurrencyValues";
import { downloadCsv, stamp } from "@/lib/csv";
import { SheetLinkExportButton } from "@/components/common/SheetLink";
import { usePeople } from "@/hooks/usePeople";
import { usePermissions } from "@/hooks/usePermissions";
import { TravelChampionships } from "@/components/ranking/TravelChampionships";
import { Championship } from "@/components/ranking/Championship";

export const Route = createFileRoute("/_authenticated/ranking")({
  head: () => ({
    meta: [
      { title: "Ranking de vendas — OS" },
      {
        name: "description",
        content: "Quem fez mais pedidos, quantos viraram venda e quanto ganhou de bonificação.",
      },
      { property: "og:title", content: "Ranking de vendas — OS" },
      { property: "og:description", content: "Desempenho da equipe comercial e bonificações." },
    ],
  }),
  component: RankingPage,
});

const MEDAL = ["🥇", "🥈", "🥉"];

function RankingPage() {
  const { productId, products } = useProductScope();
  const { isAdmin } = useCurrentUser();
  const { seesCompanySales, userId } = usePermissions();
  // Sem permissão, valores em dinheiro só aparecem na própria linha.
  const canSeeMoney = (row: any) => seesCompanySales || row.userId === userId;
  const [period, setPeriod] = useState<RankingPeriod>("30d");
  const display = "USD" as const;
  const { rows, loading, error } = useRanking(period, productId, display);

  const productOptions = products.map((p) => ({ value: p.id, label: p.name }));

  function rankingRows() {
    return [
      [
        "Posição",
        "Pessoa",
        "Produtos vendidos",
        "Produtos",
        "Pedidos",
        "Vendas confirmadas",
        "Conversão %",
        "Faturamento",
        "Bonificação",
      ],
      ...rows.map((r, i) => [
        i + 1,
        r.name,
        r.products.map((product) => `${product.name}: ${product.units}`).join(" | "),
        r.units,
        r.orders,
        r.sales,
        r.conversion.toFixed(1),
        canSeeMoney(r) ? r.revenue.toFixed(2) : "",
        canSeeMoney(r) ? r.bonus.toFixed(2) : "",
      ]),
    ];
  }

  function exportCsv() {
    downloadCsv(`ranking-${stamp()}.csv`, rankingRows());
  }

  return (
    <div>
      <PageHeader
        title="Ranking"
        description="Quem fez mais pedidos, quantos viraram venda de verdade e quanto já rendeu de bonificação."
        actions={
          <>
            <Select value={period} onValueChange={(v) => setPeriod(v as RankingPeriod)}>
              <SelectTrigger className="w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={exportCsv}>
              <Download className="mr-2 size-4" /> Exportar
            </Button>
            <SheetLinkExportButton build={rankingRows} />
          </>
        }
      />

      <Tabs defaultValue="campeonatos">
        <TabsList>
          <TabsTrigger value="campeonatos">Campeonatos</TabsTrigger>
          <TabsTrigger value="ranking">Ranking</TabsTrigger>
          <TabsTrigger value="campeonato">Comparativo por equipes</TabsTrigger>
          {isAdmin && <TabsTrigger value="regras">Regras de bonificação</TabsTrigger>}
          {isAdmin && <TabsTrigger value="bonificacoes">Bonificações concedidas</TabsTrigger>}
        </TabsList>

        <TabsContent value="campeonatos" className="pt-4">
          <TravelChampionships />
        </TabsContent>
        <TabsContent value="ranking" className="pt-4">
          {error ? (
            <p role="alert" className="text-destructive">
              Não foi possível carregar o Ranking. Tente novamente.
            </p>
          ) : loading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : rows.length === 0 ? (
            <EmptyState
              title="Ainda não há pedidos neste período"
              description="Assim que a equipe registrar pedidos com responsável, o ranking aparece aqui."
            />
          ) : (
            <>
              <div className="mb-4 grid gap-4 sm:grid-cols-3">
                {rows.slice(0, 3).map((r, i) => (
                  <Card key={r.userId}>
                    <CardContent className="flex items-center gap-3 pt-6">
                      <span className="text-2xl">{MEDAL[i]}</span>
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          <Link
                            className="hover:underline"
                            to="/equipe/$id"
                            params={{ id: r.userId }}
                          >
                            {r.name}
                          </Link>
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {r.sales} venda(s) de {r.orders} pedido(s)
                          {canSeeMoney(r) ? (
                            <>
                              {" "}
                              ·{" "}
                              <CurrencyValues
                                value={r.revenue}
                                currency={display}
                                layout="inline"
                              />
                            </>
                          ) : (
                            ""
                          )}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="surface-card overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Pessoa</TableHead>
                      <TableHead>Produtos vendidos</TableHead>
                      <TableHead className="text-right">Produtos</TableHead>
                      <TableHead className="text-right">Pedidos</TableHead>
                      <TableHead className="text-right">Vendas confirmadas</TableHead>
                      <TableHead className="text-right">Conversão</TableHead>
                      <TableHead className="text-right">Faturamento</TableHead>
                      <TableHead className="text-right">Bonificação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r, i) => (
                      <TableRow key={r.userId}>
                        <TableCell>{MEDAL[i] ?? i + 1}</TableCell>
                        <TableCell className="font-medium">
                          <Link
                            className="hover:underline"
                            to="/equipe/$id"
                            params={{ id: r.userId }}
                          >
                            {r.name}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {r.products.length === 0 ? (
                              <span className="text-xs text-muted-foreground">—</span>
                            ) : (
                              r.products.map((product) => (
                                <Badge key={product.id} variant="secondary" className="font-normal">
                                  {product.name}: {formatNumber(product.units, 0)}
                                </Badge>
                              ))
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{formatNumber(r.units, 0)}</TableCell>
                        <TableCell className="text-right">{r.orders}</TableCell>
                        <TableCell className="text-right">{r.sales}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant={r.conversion >= 50 ? "default" : "secondary"}>
                            {formatNumber(r.conversion, 1)}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {canSeeMoney(r) ? (
                            <CurrencyValues value={r.revenue} currency={display} />
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {canSeeMoney(r) ? (
                            <CurrencyValues value={r.bonus} currency={display} />
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Conta como venda confirmada o pedido faturado, enviado ou entregue. As unidades são
                somadas por produto. Pedidos cancelados ficam de fora.
              </p>
            </>
          )}
        </TabsContent>

        <TabsContent value="campeonato" className="pt-4">
          <Championship display={display} canSeeMoney={seesCompanySales} />
        </TabsContent>

        <TabsContent value="regras" className="pt-4">
          <ResourcePage
            title="Regras de bonificação"
            description="Defina a meta e o prêmio. Quem bater a meta entra na lista de bonificações."
            table="bonus_rules"
            canWrite={isAdmin}
            searchKeys={["name"]}
            emptyTitle="Nenhuma regra criada"
            emptyDescription="Crie uma regra, por exemplo: 20 pedidos no mês rende US$ 200."
            columns={[
              { key: "name", label: "Regra" },
              {
                key: "metric",
                label: "Meta",
                render: (r: any) =>
                  `${r.threshold} ${r.metric === "orders" ? "pedidos" : r.metric === "revenue" ? "de faturamento" : "% de conversão"}`,
              },
              {
                key: "reward_value",
                label: "Prêmio",
                render: (r: any) =>
                  r.reward_type === "percent" ? (
                    `${r.reward_value}% sobre o faturamento`
                  ) : (
                    <CurrencyValues value={r.reward_value} currency={r.currency} />
                  ),
              },
              { key: "period", label: "Período" },
              {
                key: "active",
                label: "Ativa",
                render: (r: any) => (
                  <Badge variant={r.active ? "default" : "secondary"}>
                    {r.active ? "Sim" : "Não"}
                  </Badge>
                ),
              },
            ]}
            fields={[
              { name: "name", label: "Nome da regra", required: true, full: true },
              {
                name: "metric",
                label: "Medir por",
                type: "select",
                defaultValue: "orders",
                options: [
                  { value: "orders", label: "Quantidade de pedidos" },
                  { value: "revenue", label: "Faturamento" },
                  { value: "conversion", label: "Taxa de conversão (%)" },
                ],
              },
              { name: "threshold", label: "Meta", type: "number", required: true },
              {
                name: "reward_type",
                label: "Tipo de prêmio",
                type: "select",
                defaultValue: "fixed",
                options: [
                  { value: "fixed", label: "Valor fixo" },
                  { value: "percent", label: "Percentual sobre o faturamento" },
                ],
              },
              { name: "reward_value", label: "Valor do prêmio", type: "number", required: true },
              {
                name: "currency",
                label: "Moeda",
                type: "select",
                defaultValue: "USD",
                options: CURRENCIES.map((c) => ({ value: c.value, label: c.label })),
              },
              {
                name: "period",
                label: "Período de apuração",
                type: "select",
                defaultValue: "month",
                options: [
                  { value: "day", label: "Por dia" },
                  { value: "week", label: "Por semana" },
                  { value: "month", label: "Por mês" },
                ],
              },
              {
                name: "product_id",
                label: "Macro categoria (opcional)",
                type: "select",
                options: productOptions,
              },
              { name: "active", label: "Regra ativa", type: "switch", defaultValue: true },
            ]}
          />
        </TabsContent>

        <TabsContent value="bonificacoes" className="pt-4">
          <BonusAwards canWrite={isAdmin} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function BonusAwards({ canWrite }: { canWrite: boolean }) {
  const { options, nameOf } = usePeople();
  return (
    <ResourcePage
      title="Bonificações concedidas"
      description="O que cada pessoa recebeu de bonificação. Entra automaticamente no ranking e na folha."
      table="bonus_awards"
      canWrite={canWrite}
      searchKeys={["description"]}
      emptyTitle="Nenhuma bonificação lançada"
      emptyDescription="Lance a bonificação de quem bateu a meta do período."
      columns={[
        { key: "user_id", label: "Pessoa", render: (r: any) => nameOf(r.user_id) },
        { key: "description", label: "Motivo" },
        {
          key: "amount",
          label: "Valor",
          render: (r: any) => <CurrencyValues value={r.amount} currency={r.currency} />,
        },
        {
          key: "status",
          label: "Situação",
          render: (r: any) => (
            <Badge variant={r.status === "pago" ? "default" : "secondary"}>{r.status}</Badge>
          ),
        },
      ]}
      fields={[
        { name: "user_id", label: "Pessoa", type: "select", required: true, options },
        { name: "description", label: "Motivo", full: true },
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
          defaultValue: "pendente",
          options: [
            { value: "pendente", label: "Pendente" },
            { value: "pago", label: "Pago" },
          ],
        },
      ]}
    />
  );
}
