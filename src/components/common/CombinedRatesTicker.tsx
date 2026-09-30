import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Radio, Plus, X, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getLiveRates, type MarketQuote } from "@/lib/rates.functions";
import { useMarketQuotes } from "@/hooks/useMarketQuotes";
import { useRows, useSaveRow, useDeleteRow } from "@/lib/db";
import { formatExchangeRate, formatNumber } from "@/lib/format";
import { useCurrentUser } from "@/hooks/useAuth";

const PAIR_LABEL: Record<string, string> = {
  "USD-BRL": "Dólar → Real",
  "BRL-USD": "Real → Dólar",
  "USD-PYG": "Dólar → Guarani",
  "PYG-USD": "Guarani → Dólar",
  "BRL-PYG": "Real → Guarani",
  "PYG-BRL": "Guarani → Real",
};

function decimalsForQuote(price: number) {
  if (price >= 1000) return 2;
  if (price >= 1) return 4;
  if (price >= 0.01) return 5;
  return 8;
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (!values || values.length < 2) return <svg className="h-8 w-24" aria-hidden />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 96;
      const y = 30 - ((v - min) / span) * 26 - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 96 32" className="h-8 w-24 shrink-0" aria-hidden>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const PRESETS = [
  { symbol: "BTC-USD", label: "Bitcoin", kind: "cripto" },
  { symbol: "ETH-USD", label: "Ethereum", kind: "cripto" },
  { symbol: "EURUSD=X", label: "Euro", kind: "moeda" },
  { symbol: "GBPUSD=X", label: "Libra", kind: "moeda" },
  { symbol: "JPYUSD=X", label: "Iene", kind: "moeda" },
  { symbol: "^BVSP", label: "Ibovespa", kind: "acao" },
  { symbol: "PETR4.SA", label: "Petrobras", kind: "acao" },
  { symbol: "AAPL", label: "Apple", kind: "acao" },
  { symbol: "GOOGL", label: "Alphabet", kind: "acao" },
  { symbol: "TSLA", label: "Tesla", kind: "acao" },
  { symbol: "^IXIC", label: "Nasdaq", kind: "acao" },
  { symbol: "^GSPC", label: "S&P 500", kind: "acao" },
];

export function CombinedRatesTicker() {
  const { userId, isAdmin } = useCurrentUser();
  const live = useServerFn(getLiveRates);
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const [filter, setFilter] = useState("");

  const {
    data: liveData,
    isLoading: liveLoading,
    dataUpdatedAt: liveUpdatedAt,
  } = useQuery({
    queryKey: ["live-rates"],
    queryFn: () => live(),
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });

  const watchlistQuery = useRows<any>("market_watchlist", {
    orderBy: { column: "position", ascending: true },
  });
  const items = watchlistQuery.data ?? [];
  const symbols = useMemo(() => items.map((i: any) => i.symbol), [items]);
  const {
    quotes,
    loading: quotesLoading,
    updatedAt: quotesUpdatedAt,
  } = useMarketQuotes(symbols, 5_000);

  const save = useSaveRow("market_watchlist");
  const remove = useDeleteRow("market_watchlist");

  const updatedAt = liveUpdatedAt || quotesUpdatedAt;

  const filteredPresets = PRESETS.filter(
    (p) =>
      !symbols.includes(p.symbol.toUpperCase()) &&
      (p.label.toLowerCase().includes(filter.toLowerCase()) ||
        p.symbol.toLowerCase().includes(filter.toLowerCase())),
  );

  function addPreset(symbol: string, label: string, kind: string) {
    save.mutate({
      symbol: symbol.trim().toUpperCase(),
      label,
      kind,
      decimals: 2,
      position: items.length,
      created_by: userId,
    });
  }

  function addCustom(e: React.FormEvent) {
    e.preventDefault();
    const symbol = custom.trim().toUpperCase();
    if (!symbol) return;
    if (symbols.includes(symbol)) {
      toast.error("Este ativo já está sendo acompanhado.");
      return;
    }
    addPreset(symbol, symbol, "outro");
    setCustom("");
  }

  function removeItem(id: string) {
    remove.mutate(id);
  }

  if (liveLoading || watchlistQuery.isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!liveData?.ok) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        {liveData?.error ??
          "Não foi possível consultar o mercado agora. Tentando de novo em instantes."}
      </Card>
    );
  }

  const fixedRows = liveData.pairs.map((p) => {
    const up = p.changePct > 0.0001;
    const down = p.changePct < -0.0001;
    const tone = up ? "text-emerald-600" : down ? "text-red-600" : "text-blue-600";
    const stroke = up ? "#16a34a" : down ? "#dc2626" : "#2563eb";
    return {
      id: `${p.base}-${p.quote}`,
      title: `${p.base}-${p.quote}`,
      subtitle: PAIR_LABEL[`${p.base}-${p.quote}`],
      value: formatExchangeRate(p.rate),
      change: `${p.changePct > 0 ? "+" : ""}${formatNumber(p.changePct, 2)}%`,
      up,
      down,
      tone,
      stroke,
      series: p.series,
      isExtra: false,
    };
  });

  const extraRows = items.map((item: any) => {
    const q = quotes[String(item.symbol).toUpperCase()] as MarketQuote | undefined;
    const change = q?.changePct ?? 0;
    const up = change > 0.0001;
    const down = change < -0.0001;
    const tone = up ? "text-emerald-600" : down ? "text-red-600" : "text-blue-600";
    const stroke = up ? "#16a34a" : down ? "#dc2626" : "#2563eb";
    const price = q?.price ?? 0;
    return {
      id: item.id,
      title: item.symbol,
      subtitle: item.label,
      value: q ? formatNumber(price, item.decimals ?? decimalsForQuote(price)) : "—",
      change: q ? `${change > 0 ? "+" : ""}${formatNumber(change, 2)}%` : "",
      up,
      down,
      tone,
      stroke,
      series: q?.series ?? [],
      isExtra: true,
    };
  });

  const rows = [...fixedRows, ...extraRows];

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Radio className="size-4 animate-pulse text-primary" />
          Cotações — {liveData.source}
        </p>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground tabular-nums">
            {updatedAt ? new Date(updatedAt).toLocaleTimeString("pt-BR") : ""}
          </span>
          {isAdmin && (
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1">
                  <Plus className="size-4" /> Escolher cotação
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-3" align="end">
                <p className="mb-2 text-sm font-medium">Escolher cotações extras</p>
                <div className="relative mb-2">
                  <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar..."
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
                  {filteredPresets.map((p) => (
                    <button
                      key={p.symbol}
                      onClick={() => addPreset(p.symbol, p.label, p.kind)}
                      className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                    >
                      <span>
                        {p.label}{" "}
                        <span className="text-xs text-muted-foreground">({p.symbol})</span>
                      </span>
                      <Plus className="size-4 text-muted-foreground" />
                    </button>
                  ))}
                  {filteredPresets.length === 0 && !filter && (
                    <p className="px-2 py-1 text-xs text-muted-foreground">
                      Todas as sugestões já foram adicionadas.
                    </p>
                  )}
                </div>
                <form onSubmit={addCustom} className="mt-3 flex gap-2">
                  <Input
                    placeholder="Código personalizado"
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                    className="flex-1"
                  />
                  <Button type="submit" size="sm" disabled={!custom.trim()}>
                    Adicionar
                  </Button>
                </form>
                {items.length > 0 && (
                  <div className="mt-3 border-t pt-2">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Acompanhando</p>
                    <div className="flex flex-wrap gap-1">
                      {items.map((item: any) => (
                        <Badge key={item.id} variant="secondary" className="gap-1 pr-1">
                          {item.symbol}
                          <button
                            onClick={() => removeItem(item.id)}
                            className="rounded-full p-0.5 hover:bg-muted"
                            aria-label={`Remover ${item.symbol}`}
                          >
                            <X className="size-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>
      <div className="divide-y sm:grid sm:grid-cols-2 sm:divide-y-0 sm:[&>*:nth-child(odd)]:sm:border-r">
        {rows.map((row) => (
          <div
            key={row.id}
            className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0 sm:border-b"
          >
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1 text-sm font-semibold">
                <span className={row.tone}>{row.up ? "▲" : row.down ? "▼" : "■"}</span>
                {row.title}
              </p>
              <p className="truncate text-xs text-muted-foreground">{row.subtitle}</p>
            </div>
            <Sparkline values={row.series} color={row.stroke} />
            <div className="w-28 text-right">
              <p className="text-sm font-semibold tabular-nums">{row.value}</p>
              <p className={`text-xs font-medium tabular-nums ${row.tone}`}>{row.change}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
