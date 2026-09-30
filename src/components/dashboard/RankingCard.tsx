/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRanking, PERIOD_OPTIONS, type RankingPeriod } from "@/hooks/useRanking";
import { formatNumber } from "@/lib/format";
import { CurrencyValues } from "@/components/common/CurrencyValues";
import { usePermissions } from "@/hooks/usePermissions";

export function RankingCard({ productId }: { productId: string | "todos" }) {
  const [period, setPeriod] = useState<RankingPeriod>("30d");
  const { rows, loading, error } = useRanking(period, productId, "USD");
  const { seesCompanySales, userId } = usePermissions();
  const podium = rows.slice(0, 3);
  const ownPosition = rows.findIndex((row) => row.userId === userId);
  const ownRow = ownPosition >= 3 ? rows[ownPosition] : null;
  const remaining = rows.slice(3).filter((row) => row.userId !== userId);
  const medals = ["🥇", "🥈", "🥉"];

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <Trophy className="size-4 text-primary" /> Ranking de vendas
        </CardTitle>
        <div className="flex flex-wrap gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as RankingPeriod)}>
            <SelectTrigger className="h-8 w-[140px]">
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
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p role="alert" className="text-sm text-destructive">Não foi possível carregar o ranking.</p>}
        {loading && <p className="text-sm text-muted-foreground">Carregando ranking…</p>}
        {!loading && !error && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum vendedor cadastrado.</p>
        )}
        <div className="grid gap-2 sm:grid-cols-3">
          {podium.map((r, i) => (
            <div key={r.userId} aria-current={r.userId === userId ? "true" : undefined}
              className={`flex min-w-0 items-start gap-2 rounded-lg border p-3 ${r.userId === userId ? "border-primary bg-primary/5" : ""}`}>
              <span className="text-2xl" aria-label={`${i + 1}º lugar`}>{medals[i]}</span>
              <div className="min-w-0 text-xs">
                <p className="truncate text-sm font-semibold">{r.name} {r.userId === userId && <Badge variant="secondary">Você</Badge>}</p>
                <p className="text-muted-foreground">{formatNumber(r.units)} unidades · {formatNumber(r.sales)} vendas de {formatNumber(r.orders)} pedidos</p>
                {seesCompanySales || r.userId === userId ? (
                  <CurrencyValues value={r.revenue} currency="USD" layout="inline" />
                ) : <p>{formatNumber(r.sales)} vendas</p>}
              </div>
            </div>
          ))}
        </div>
        {ownRow && (
          <div className="rounded-lg border border-primary bg-primary/10 p-3 text-sm" aria-current="true">
            <strong>Minha posição · {ownPosition + 1}º lugar</strong>
            <p>{ownRow.name} · {formatNumber(ownRow.units)} unidades · {formatNumber(ownRow.sales)} vendas de {formatNumber(ownRow.orders)} pedidos</p>
            <div className="text-xs"><CurrencyValues value={ownRow.revenue} currency="USD" layout="inline" /></div>
          </div>
        )}
        {remaining.length > 0 && (
          <div className="max-h-80 overflow-y-auto rounded-lg border" aria-label="Todos os vendedores no ranking">
            {remaining.map((r) => (
              <div key={r.userId} aria-current={r.userId === userId ? "true" : undefined}
                className={`flex flex-wrap items-center gap-3 border-b p-3 text-sm last:border-0 ${r.userId === userId ? "bg-primary/10 ring-1 ring-inset ring-primary" : ""}`}>
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{rows.findIndex((row) => row.userId === r.userId) + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.name} {r.userId === userId && <Badge variant="secondary">Você</Badge>}</p>
                  <p className="text-xs text-muted-foreground">{formatNumber(r.units)} unidades · {formatNumber(r.sales)} vendas de {formatNumber(r.orders)} pedidos</p>
                </div>
                {(seesCompanySales || r.userId === userId) && (
                  <div className="text-right text-xs"><CurrencyValues value={r.revenue} currency="USD" layout="inline" /></div>
                )}
              </div>
            ))}
          </div>
        )}
        <Button variant="outline" className="w-full" asChild>
          <Link to="/ranking">Ver ranking completo</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
