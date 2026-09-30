import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Radio } from "lucide-react";
import { getLiveRates } from "@/lib/rates.functions";
import { formatExchangeRate, formatNumber } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const PAIR_LABEL: Record<string, string> = {
  "USD-BRL": "Dólar → Real",
  "BRL-USD": "Real → Dólar",
  "USD-PYG": "Dólar → Guarani",
  "PYG-USD": "Guarani → Dólar",
  "BRL-PYG": "Real → Guarani",
  "PYG-BRL": "Guarani → Real",
};

const SYMBOL: Record<string, string> = { USD: "USD", BRL: "BRL", PYG: "PYG" };

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <svg className="h-8 w-24" aria-hidden />;
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

export function LiveRatesTicker({ compact = false }: { compact?: boolean }) {
  const live = useServerFn(getLiveRates);

  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["live-rates"],
    queryFn: () => live(),
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });

  if (isLoading) {
    return <Skeleton className={compact ? "h-64 w-full" : "h-64 w-full"} />;
  }

  if (!data?.ok) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        {data?.error ??
          "Não foi possível consultar o mercado agora. Tentando de novo em instantes."}
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Radio className="size-4 animate-pulse text-primary" />
          Cotações — {data.source}
        </p>
        <span className="text-xs text-muted-foreground tabular-nums">
          {new Date(data.sourceUpdatedAt ?? dataUpdatedAt).toLocaleTimeString("pt-BR")}
        </span>
      </div>
      <div className="divide-y sm:grid sm:grid-cols-2 sm:divide-y-0 sm:[&>*:nth-child(odd)]:sm:border-r">
        {data.pairs.map((p) => {
          const up = p.changePct > 0.0001;
          const down = p.changePct < -0.0001;
          const tone = up ? "text-emerald-600" : down ? "text-red-600" : "text-blue-600";
          const stroke = up ? "#16a34a" : down ? "#dc2626" : "#2563eb";
          return (
            <div
              key={`${p.base}-${p.quote}`}
              className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0 sm:border-b"
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 text-sm font-semibold">
                  <span className={tone}>{up ? "▲" : down ? "▼" : "■"}</span>
                  {SYMBOL[p.base]}-{SYMBOL[p.quote]}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {PAIR_LABEL[`${p.base}-${p.quote}`]}
                </p>
              </div>
              <Sparkline values={p.series} color={stroke} />
              <div className="w-28 text-right">
                <p className="text-sm font-semibold tabular-nums">{formatExchangeRate(p.rate)}</p>
                <p className={`text-xs font-medium tabular-nums ${tone}`}>
                  {p.changePct > 0 ? "+" : ""}
                  {formatNumber(p.changePct, 2)}%
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
