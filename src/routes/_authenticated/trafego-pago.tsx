/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { RouteGuard } from "@/components/common/RouteGuard";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, PlugZap, RefreshCw, SlidersHorizontal, Unplug } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/common/PageHeader";
import { ConnectAccountsDialog } from "@/components/meta/ConnectAccountsDialog";
import { DisconnectDialog } from "@/components/meta/DisconnectDialog";
import { MetricsDialog } from "@/components/meta/MetricsDialog";
import { startMetaOAuth, syncMetaNow } from "@/lib/meta.functions";
import { useProductScope } from "@/hooks/useProductScope";
import { useCurrentUser } from "@/hooks/useAuth";
import { PERIOD_OPTIONS, periodStart, type RankingPeriod } from "@/hooks/useRanking";
import { formatDate } from "@/lib/format";
import { CurrencyValues } from "@/components/common/CurrencyValues";
import { useRates, type Currency } from "@/hooks/useRates";
import {
  DEFAULT_CARDS,
  DEFAULT_CHART,
  SERIES_COLORS,
  catalogFor,
  formatMetric,
  isAvailable,
  totalsFor,
  type MetricDef,
} from "@/lib/ad-metrics";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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

export const Route = createFileRoute("/_authenticated/trafego-pago")({
  head: () => ({
    meta: [
      { title: "Tráfego pago — OS" },
      {
        name: "description",
        content: "Resultados reais dos anúncios da Meta por conta de anúncios e categoria.",
      },
      { property: "og:title", content: "Tráfego pago — OS" },
      {
        property: "og:description",
        content: "Acompanhe investimento, cliques, leads e vendas dos anúncios da Meta.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GuardedTrafegoPago,
});

function TrafegoPago() {
  const rates = useRates();
  const { productId } = useProductScope();
  const { isAdmin, userId } = useCurrentUser();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<RankingPeriod>("30d");
  const [accountId, setAccountId] = useState<string>("todas");
  const [currency, setCurrency] = useState<string>("todas");
  const [connectOpen, setConnectOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [metricsOpen, setMetricsOpen] = useState(false);

  const start = useServerFn(startMetaOAuth);
  const sync = useServerFn(syncMetaNow);

  // Contas de anúncios realmente ativas (a RLS limita ao que o usuário pode ver).
  const metaAccounts = useQuery({
    queryKey: ["meta-ad-accounts"],
    queryFn: async () => {
      const [{ data: accounts }, { data: links }] = await Promise.all([
        supabase
          .from("meta_ad_accounts")
          .select(
            "id,ad_account_id,name,business_id,business_name,currency,timezone_name,is_active,last_synced_at",
          )
          .eq("is_active", true),
        supabase.from("meta_ad_account_products").select("meta_ad_account_id,product_id"),
      ]);
      return (accounts ?? []).map((a) => ({
        ...a,
        product_ids: (links ?? [])
          .filter((l) => l.meta_ad_account_id === a.id)
          .map((l) => l.product_id),
      }));
    },
  });

  // Retorno do fluxo de autorização: abre direto a escolha das contas novas.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("meta");
    if (!result) return;
    const messages: Record<string, [string, boolean]> = {
      conectado: ["Conta Meta autorizada. Escolha as contas de anúncios.", true],
      recusado: ["Autorização recusada na Meta.", false],
      estado_invalido: ["Pedido de autorização inválido ou expirado. Comece de novo.", false],
      nao_configurado: ["A conexão com a Meta ainda não está configurada no servidor.", false],
      erro: ["Não foi possível concluir a conexão com a Meta.", false],
    };
    const found = messages[result];
    if (found) (found[1] ? toast.success : toast.error)(found[0]);
    window.history.replaceState({}, "", window.location.pathname);
    queryClient.invalidateQueries({ queryKey: ["meta-status"] });
    queryClient.invalidateQueries({ queryKey: ["meta-ad-accounts"] });
    queryClient.invalidateQueries({ queryKey: ["ad-metrics-meta"] });
    if (result === "conectado") setConnectOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectMutation = useMutation({
    mutationFn: async () => start({ data: { returnPath: "/trafego-pago" } }),
    onSuccess: (r) => {
      window.location.href = r.url;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const syncMutation = useMutation({
    mutationFn: async () => sync({ data: { days: 30 } }),
    onSuccess: (r) => {
      if (r.errors.length) toast.warning(`Sincronizado com avisos: ${r.errors[0]}`);
      else toast.success(`Sincronização concluída: ${r.rows} dias de resultados.`);
      queryClient.invalidateQueries({ queryKey: ["meta-ad-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["ad-metrics-meta"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const visibleAccounts = useMemo(() => {
    const list = metaAccounts.data ?? [];
    if (productId === "todos") return list;
    return list.filter((a) => a.product_ids.includes(productId));
  }, [metaAccounts.data, productId]);

  const hasActiveAccount = visibleAccounts.length > 0;

  const currencies = useMemo(
    () => [...new Set(visibleAccounts.map((a) => (a.currency ?? "USD").toUpperCase()))].sort(),
    [visibleAccounts],
  );
  const activeCurrency = currency !== "todas" ? currency : (currencies[0] ?? "USD");
  const mixedCurrencies = currencies.length > 1;

  useEffect(() => {
    if (mixedCurrencies && currency === "todas" && currencies[0]) setCurrency(currencies[0]);
  }, [mixedCurrencies, currency, currencies]);

  // Somente resultados reais da Meta: nada de lançamentos manuais ou demonstração.
  const metrics = useQuery({
    queryKey: ["ad-metrics-meta"],
    enabled: hasActiveAccount,
    queryFn: async () => {
      const { data } = await (supabase.from("ad_metrics") as any)
        .select(
          "id,meta_ad_account_id,metric_date,level,object_id,metrics,spend,currency,account_currency,impressions,reach,frequency,clicks,ctr,cpc,cpm,leads,results,result_type,cost_per_result,conversions,revenue,source",
        )
        .eq("source", "meta")
        .not("meta_ad_account_id", "is", null)
        .order("metric_date", { ascending: true })
        .limit(5000);
      return (data ?? []) as any[];
    },
  });

  const scopeKey = productId === "todos" ? "todos" : productId;

  const prefs = useQuery({
    queryKey: ["ad-metric-prefs", scopeKey, userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await (supabase.from("ad_metric_prefs") as any)
        .select("cards,chart")
        .eq("scope_key", scopeKey)
        .maybeSingle();
      return (data ?? null) as { cards: string[]; chart: string[] } | null;
    },
  });

  const cards = prefs.data?.cards?.length ? prefs.data.cards : DEFAULT_CARDS;
  const chartKeys = prefs.data?.chart?.length ? prefs.data.chart : DEFAULT_CHART;

  const savePrefs = useMutation({
    mutationFn: async (next: { cards: string[]; chart: string[] }) => {
      const { error } = await (supabase.from("ad_metric_prefs") as any).upsert(
        { user_id: userId, scope_key: scopeKey, cards: next.cards, chart: next.chart },
        { onConflict: "user_id,scope_key" },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Métricas atualizadas.");
      queryClient.invalidateQueries({ queryKey: ["ad-metric-prefs"] });
      setMetricsOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const accountLabel = (id: string | null) => {
    const acc = (metaAccounts.data ?? []).find((a) => a.id === id);
    if (!acc) return "Conta de anúncios";
    return `${acc.name ?? `Conta ${acc.ad_account_id}`}${acc.business_name ? ` · ${acc.business_name}` : ""}`;
  };

  const rows = useMemo(() => {
    const startAt = periodStart(period);
    const allowed = new Map(visibleAccounts.map((a) => [a.id, a]));
    const seen = new Set<string>();
    const out: any[] = [];
    for (const m of metrics.data ?? []) {
      const acc = m.meta_ad_account_id ? allowed.get(m.meta_ad_account_id) : undefined;
      if (!acc) continue;
      if (accountId !== "todas" && m.meta_ad_account_id !== accountId) continue;
      const accCurrency = (acc.currency ?? "USD").toUpperCase();
      if (accCurrency !== activeCurrency) continue;
      if (startAt && new Date(m.metric_date) < startAt) continue;
      // uma linha por conta/data/nível/objeto, mesmo com a conta em várias categorias
      const key = `${m.meta_ad_account_id}|${m.metric_date}|${m.level ?? ""}|${m.object_id ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(m);
    }
    return out;
  }, [metrics.data, period, accountId, visibleAccounts, activeCurrency]);

  const definitions: MetricDef[] = useMemo(() => catalogFor(rows), [rows]);
  const totals = useMemo(() => totalsFor(rows, definitions), [rows, definitions]);
  const availableKeys = useMemo(() => {
    const set = new Set<string>();
    for (const d of definitions) if (isAvailable(d.key, definitions, totals.bases)) set.add(d.key);
    return set;
  }, [definitions, totals]);

  const chartData = useMemo(() => {
    const byDate = new Map<string, any[]>();
    for (const m of rows) {
      const list = byDate.get(m.metric_date) ?? [];
      list.push(m);
      byDate.set(m.metric_date, list);
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, list]) => {
        const t = totalsFor(list, definitions);
        const point: Record<string, any> = { dia: formatDate(date) };
        for (const key of chartKeys) point[key] = t.value(key);
        return point;
      });
  }, [rows, definitions, chartKeys]);

  const byAccount = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const m of rows) {
      const list = map.get(m.meta_ad_account_id) ?? [];
      list.push(m);
      map.set(m.meta_ad_account_id, list);
    }
    return [...map.entries()]
      .map(([id, list]) => {
        const t = totalsFor(list, definitions);
        return {
          id,
          name: accountLabel(id),
          values: cards.slice(0, 5).map((k) => t.value(k)),
        };
      })
      .sort((a, b) => (b.values[0] ?? 0) - (a.values[0] ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, definitions, cards, metaAccounts.data]);

  const loading = metaAccounts.isLoading;

  const header = (
    <PageHeader
      title="Tráfego pago"
      description="Resultados reais dos anúncios da Meta por conta de anúncios e categoria."
      actions={
        hasActiveAccount && isAdmin ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => connectMutation.mutate()}
              disabled={connectMutation.isPending}
            >
              {connectMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <PlugZap className="size-4" />
              )}
              Conectar
            </Button>
            <Button variant="outline" onClick={() => setDisconnectOpen(true)}>
              <Unplug className="size-4" />
              Desconectar
            </Button>
          </div>
        ) : undefined
      }
    />
  );

  if (loading) {
    return (
      <div>
        {header}
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  // Sem nenhuma conta ativa visível: apenas a chamada para conectar.
  if (!hasActiveAccount) {
    return (
      <div>
        {header}
        <Card>
          <CardContent className="flex flex-col items-start gap-4 p-8">
            <p className="text-sm">
              Conecte sua conta de anúncios da Meta para visualizar os resultados reais
            </p>
            {isAdmin ? (
              <Button onClick={() => connectMutation.mutate()} disabled={connectMutation.isPending}>
                {connectMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <PlugZap className="size-4" />
                )}
                Conectar
              </Button>
            ) : (
              <p className="text-muted-foreground text-sm">
                A conexão é feita pelos administradores.
              </p>
            )}
          </CardContent>
        </Card>
        <ConnectAccountsDialog open={connectOpen} onOpenChange={setConnectOpen} />
      </div>
    );
  }

  const filters = (
    <div className="mb-4 flex flex-wrap gap-2">
      <Select value={period} onValueChange={(v) => setPeriod(v as RankingPeriod)}>
        <SelectTrigger className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PERIOD_OPTIONS.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={accountId} onValueChange={setAccountId}>
        <SelectTrigger className="w-64">
          <SelectValue placeholder="Conta de anúncios" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todas">Todas as contas de anúncios</SelectItem>
          {visibleAccounts.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.name ?? `Conta ${a.ad_account_id}`}
              {a.business_name ? ` · ${a.business_name}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {mixedCurrencies && (
        <Select value={activeCurrency} onValueChange={setCurrency}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {currencies.map((c) => (
              <SelectItem key={c} value={c}>
                Moeda {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Button variant="outline" onClick={() => setMetricsOpen(true)}>
        <SlidersHorizontal className="size-4" />
        Personalizar métricas
      </Button>
      {isAdmin && (
        <Button
          variant="ghost"
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
        >
          {syncMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Sincronizar
        </Button>
      )}
    </div>
  );

  const dialogs = (
    <>
      <ConnectAccountsDialog open={connectOpen} onOpenChange={setConnectOpen} />
      <DisconnectDialog open={disconnectOpen} onOpenChange={setDisconnectOpen} />
      <MetricsDialog
        open={metricsOpen}
        onOpenChange={setMetricsOpen}
        definitions={definitions}
        availableKeys={availableKeys}
        cards={cards}
        chart={chartKeys}
        onSave={(next) => savePrefs.mutate(next)}
      />
    </>
  );

  // Conta ativa, mas ainda sem resultados sincronizados.
  if (!metrics.isLoading && (metrics.data ?? []).length === 0) {
    return (
      <div>
        {header}
        {filters}
        <Card>
          <CardContent className="flex flex-col items-start gap-4 p-8">
            <p className="text-sm">Conta conectada, mas ainda não há dados sincronizados</p>
            {isAdmin && (
              <Button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
                {syncMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                Sincronizar agora
              </Button>
            )}
          </CardContent>
        </Card>
        {dialogs}
      </div>
    );
  }

  const defOf = (key: string) => definitions.find((d) => d.key === key);

  return (
    <div>
      {header}
      {filters}

      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((key) => {
            const def = defOf(key);
            if (!def) return null;
            return (
              <MetricCard
                key={key}
                label={def.label}
                value={
                  def.kind === "currency" ? (
                    <CurrencyValues
                      value={totals.value(key)}
                      currency={activeCurrency as Currency}
                    />
                  ) : (
                    formatMetric(totals.value(key), def.kind, activeCurrency)
                  )
                }
              />
            );
          })}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Evolução por dia</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            {chartData.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nenhum resultado no período selecionado.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={70} />
                  <Tooltip
                    contentStyle={{ fontSize: 12 }}
                    formatter={(v: any, name: any) => {
                      const def = definitions.find((d) => d.label === name);
                      const value = v == null ? null : Number(v);
                      return [
                        def?.kind === "currency"
                          ? rates
                              .allCurrencies(value, activeCurrency as Currency)
                              .map((item) => item.text)
                              .join(" · ")
                          : formatMetric(value, def?.kind ?? "number", activeCurrency),
                        name,
                      ];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {chartKeys.map((key, i) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      name={defOf(key)?.label ?? key}
                      stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                      dot={false}
                      strokeWidth={2}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Desempenho por conta de anúncios</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Conta</TableHead>
                  {cards.slice(0, 5).map((k) => (
                    <TableHead key={k} className="text-right">
                      {defOf(k)?.label ?? k}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {byAccount.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={cards.slice(0, 5).length + 1}>
                      <span className="text-muted-foreground text-sm">
                        Nenhum resultado no período selecionado.
                      </span>
                    </TableCell>
                  </TableRow>
                ) : (
                  byAccount.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      {a.values.map((v: number | null, i: number) => (
                        <TableCell key={i} className="text-right">
                          {defOf(cards[i]!)?.kind === "currency" ? (
                            <CurrencyValues value={v} currency={activeCurrency as Currency} />
                          ) : (
                            formatMetric(v, defOf(cards[i]!)?.kind ?? "number", activeCurrency)
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {dialogs}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="mt-1 text-xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function GuardedTrafegoPago() {
  return (
    <RouteGuard capability="marketing">
      <TrafegoPago />
    </RouteGuard>
  );
}
