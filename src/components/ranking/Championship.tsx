import { Link } from "@tanstack/react-router";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { useProductScope } from "@/hooks/useProductScope";
import { useRanking, CHAMPIONSHIP_OPTIONS, type RankingPeriod } from "@/hooks/useRanking";
import { useRates, type Currency } from "@/hooks/useRates";
import { formatNumber } from "@/lib/format";
import { CurrencyValues } from "@/components/common/CurrencyValues";
import { downloadCsv, stamp } from "@/lib/csv";
import { SheetLinkExportButton } from "@/components/common/SheetLink";

const MEDAL = ["🥇", "🥈", "🥉"];

/** Campeonato por equipes ou por membros, apurado por mês, trimestre, semestre ou ano. */
export function Championship({
  display,
  canSeeMoney,
}: {
  display: Currency;
  canSeeMoney: boolean;
}) {
  const { productId } = useProductScope();
  const rates = useRates();
  const [period, setPeriod] = useState<RankingPeriod>("mes");
  const [mode, setMode] = useState<"equipes" | "membros">("equipes");
  const { rows, loading, error } = useRanking(period, productId, display);

  const { data: teamData } = useQuery({
    queryKey: ["championship-teams"],
    queryFn: async () => {
      const [{ data: teams }, { data: members }] = await Promise.all([
        supabase.from("teams").select("id,name,manager_id").order("name"),
        supabase.from("team_members").select("team_id,user_id"),
      ]);
      return { teams: teams ?? [], members: members ?? [] };
    },
  });

  const teamRows = useMemo(() => {
    const teams = teamData?.teams ?? [];
    const links = teamData?.members ?? [];
    return teams
      .map((t: any) => {
        const userIds = Array.from(new Set([...links.filter((m: any) => m.team_id === t.id).map((m: any) => m.user_id),t.manager_id].filter(Boolean)));
        const mine = rows.filter((r) => userIds.includes(r.userId));
        const sales = mine.reduce((s, r) => s + r.sales, 0);
        const orders = mine.reduce((s, r) => s + r.orders, 0);
        const productMap = new Map<string, { id: string; name: string; units: number }>();
        for (const member of mine) {
          for (const product of member.products) {
            const current = productMap.get(product.id);
            if (current) current.units += product.units;
            else
              productMap.set(product.id, {
                id: product.id,
                name: product.name,
                units: product.units,
              });
          }
        }
        return {
          id: t.id,
          name: t.name,
          people: new Set(userIds).size,
          orders,
          sales,
          units: mine.reduce((s, r) => s + r.units, 0),
          products: [...productMap.values()].sort((a, b) => b.units - a.units),
          revenue: mine.reduce((s, r) => s + r.revenue, 0),
          conversion: orders ? (sales / orders) * 100 : 0,
          top: [...mine].sort((a, b) => b.units - a.units || b.sales - a.sales)[0]?.name ?? "—",
          topId: [...mine].sort((a, b) => b.units - a.units || b.sales - a.sales)[0]?.userId,
        };
      })
      .sort((a, b) => b.units - a.units || b.sales - a.sales || b.revenue - a.revenue);
  }, [teamData, rows]);

  const periodLabel = CHAMPIONSHIP_OPTIONS.find((o) => o.value === period)?.label ?? "Campeonato";

  function championshipRows(): (string | number)[][] {
    if (mode === "equipes") {
      return [
        [
          "Posição",
          "Equipe",
          "Membros",
          "Pedidos",
          "Vendas",
          "Produtos",
          "Produtos vendidos por quantidade",
          "Conversão %",
          "Faturamento BRL",
          "Faturamento USD",
          "Faturamento PYG",
        ],
        ...teamRows.map((r, i) => [
          i + 1,
          r.name,
          r.people,
          r.orders,
          r.sales,
          r.units,
          r.products.map((product) => `${product.name}: ${product.units}`).join(" | "),
          r.conversion.toFixed(1),
          ...(canSeeMoney
            ? (["BRL", "USD", "PYG"] as Currency[]).map((target) =>
                rates.money(r.revenue, display, target),
              )
            : ["", "", ""]),
        ]),
      ];
    } else {
      return [
        [
          "Posição",
          "Pessoa",
          "Pedidos",
          "Vendas",
          "Produtos",
          "Produtos vendidos por quantidade",
          "Conversão %",
          "Faturamento BRL",
          "Faturamento USD",
          "Faturamento PYG",
        ],
        ...rows.map((r, i) => [
          i + 1,
          r.name,
          r.orders,
          r.sales,
          r.units,
          r.products.map((product) => `${product.name}: ${product.units}`).join(" | "),
          r.conversion.toFixed(1),
          ...(canSeeMoney
            ? (["BRL", "USD", "PYG"] as Currency[]).map((target) =>
                rates.money(r.revenue, display, target),
              )
            : ["", "", ""]),
        ]),
      ];
    }
  }

  function exportCsv() {
    downloadCsv(
      `campeonato-${mode === "equipes" ? "equipes" : "membros"}-${stamp()}.csv`,
      championshipRows(),
    );
  }

  const podium =
    mode === "equipes"
      ? teamRows
          .filter((r) => r.sales > 0 || r.revenue > 0)
          .slice(0, 3)
          .map((r) => ({ key: r.id, name: r.name, sales: r.sales, extra: `${r.people} membro(s)` }))
      : rows
          .filter((r) => r.sales > 0 || r.revenue > 0)
          .slice(0, 3)
          .map((r) => ({
            key: r.userId,
            name: r.name,
            sales: r.sales,
            extra: `${r.orders} pedido(s)`,
          }));

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="text-destructive">Não foi possível carregar o Campeonato. Tente novamente.</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={period} onValueChange={(v) => setPeriod(v as RankingPeriod)}>
          <SelectTrigger className="w-[210px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CHAMPIONSHIP_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={mode} onValueChange={(v) => setMode(v as "equipes" | "membros")}>
          <SelectTrigger className="w-[190px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="equipes">Disputa por equipes</SelectItem>
            <SelectItem value="membros">Disputa por membros</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={exportCsv}>
          <Download className="mr-2 size-4" /> Exportar
        </Button>
        <SheetLinkExportButton build={championshipRows} />
        <Badge variant="secondary" className="gap-1 font-normal">
          <Trophy className="size-3.5" /> {periodLabel}
        </Badge>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (mode === "equipes" ? teamRows.length : rows.length) === 0 ? (
        <EmptyState
          title={mode === "equipes" ? "Nenhuma equipe cadastrada" : "Sem vendas neste período"}
          description={
            mode === "equipes"
              ? "Crie equipes em Membros › Equipes e vincule as pessoas para começar a disputa."
              : "Assim que houver pedidos no período, a disputa aparece aqui."
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {podium.map((p, i) => (
              <Card key={p.key}>
                <CardContent className="flex items-center gap-3 pt-6">
                  <span className="text-2xl">{MEDAL[i]}</span>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {p.sales} venda(s) · {p.extra}
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
                  <TableHead>{mode === "equipes" ? "Equipe" : "Pessoa"}</TableHead>
                  {mode === "equipes" && <TableHead>Destaque</TableHead>}
                  {mode === "equipes" && <TableHead className="text-right">Membros</TableHead>}
                  <TableHead className="text-right">Pedidos</TableHead>
                  <TableHead className="text-right">Vendas</TableHead>
                  <TableHead className="text-right">Produtos</TableHead>
                  <TableHead>Produtos vendidos</TableHead>
                  <TableHead className="text-right">Conversão</TableHead>
                  <TableHead className="text-right">Faturamento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(mode === "equipes" ? teamRows : rows).map((r: any, i: number) => (
                  <TableRow key={r.id ?? r.userId}>
                    <TableCell>
                      {r.sales > 0 || r.revenue > 0 ? (MEDAL[i] ?? i + 1) : "—"}
                    </TableCell>
                    <TableCell className="font-medium"><Link className="hover:underline" to="/equipe/$id" params={{id:mode === "equipes" ? r.id : r.userId}}>{r.name}</Link></TableCell>
                    {mode === "equipes" && <TableCell>{r.topId ? <Link className="hover:underline" to="/equipe/$id" params={{id:r.topId}}>{r.top}</Link> : r.top}</TableCell>}
                    {mode === "equipes" && <TableCell className="text-right">{r.people}</TableCell>}
                    <TableCell className="text-right">{r.orders}</TableCell>
                    <TableCell className="text-right">{r.sales}</TableCell>
                    <TableCell className="text-right">{formatNumber(r.units, 0)}</TableCell>
                    <TableCell>
                      <div className="min-w-44 space-y-1 text-xs">
                        {(r.products ?? []).length
                          ? r.products.map((product: any) => (
                              <p key={product.id}>
                                {product.name} — <strong>{formatNumber(product.units, 0)}</strong>
                              </p>
                            ))
                          : "—"}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={r.conversion >= 50 ? "default" : "secondary"}>
                        {formatNumber(r.conversion, 1)}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {canSeeMoney ? <CurrencyValues value={r.revenue} currency={display} /> : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
