import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getLiveRates } from "@/lib/rates.functions";
import { formatExchangeRate, formatNumber } from "@/lib/format";

/**
 * Painel de cotações no estilo do app Bolsa do macOS:
 * lista de ativos à esquerda, gráfico grande do ativo selecionado à direita.
 */

type Row = {
  id: string;
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  changeAbs: number;
  series: number[];
  isExtra: boolean;
  decimals: number;
};

const PAIR_LABEL: Record<string, string> = {
  "USD-BRL": "Dólar americano → Real",
  "BRL-USD": "Real → Dólar americano",
  "USD-PYG": "Dólar americano → Guarani",
  "PYG-USD": "Guarani → Dólar americano",
  "BRL-PYG": "Real → Guarani",
  "PYG-BRL": "Guarani → Real",
};

function decimalsFor(price: number) {
  if (price >= 1000) return 2;
  if (price >= 1) return 4;
  if (price >= 0.01) return 5;
  return 8;
}

function Sparkline({ values, up }: { values: number[]; up: boolean }) {
  if (!values || values.length < 2) return <svg className="h-9 w-24" aria-hidden />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 92;
      const y = 32 - ((v - min) / span) * 28 - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const color = up ? "#30d158" : "#ff453a";
  return (
    <svg viewBox="0 0 92 36" className="h-9 w-24 shrink-0" aria-hidden>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BigChart({
  values,
  up,
  exchange = false,
}: {
  values: number[];
  up: boolean;
  exchange?: boolean;
}) {
  if (!values || values.length < 2) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-zinc-500">
        Sem dados do dia.
      </div>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const W = 600;
  const H = 220;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - 14 - ((v - min) / span) * (H - 34);
    return [x, y] as const;
  });
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `0,${H} ${line} ${W},${H}`;
  const color = up ? "#30d158" : "#ff453a";
  const id = up ? "gUp" : "gDown";
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-64 w-full" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill={`url(#${id})`} />
        <polyline points={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      </svg>
      <span className="absolute right-1 top-0 text-xs tabular-nums text-zinc-400">
        {exchange ? formatExchangeRate(max) : formatNumber(max, decimalsFor(max))}
      </span>
      <span className="absolute bottom-0 right-1 text-xs tabular-nums text-zinc-400">
        {exchange ? formatExchangeRate(min) : formatNumber(min, decimalsFor(min))}
      </span>
    </div>
  );
}

export function StocksBoard() {
  const live = useServerFn(getLiveRates);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: liveData, isLoading: liveLoading } = useQuery({
    queryKey: ["live-rates"],
    queryFn: () => live(),
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });

  const rows: Row[] = useMemo(() => {
    return (liveData?.ok ? liveData.pairs : []).map((p) => {
      const prev = p.previousClose || p.rate;
      return {
        id: `${p.base}-${p.quote}`,
        symbol: `${p.base}-${p.quote}`,
        name: PAIR_LABEL[`${p.base}-${p.quote}`] ?? `${p.base}/${p.quote}`,
        price: p.rate,
        changePct: p.changePct,
        changeAbs: p.rate - prev,
        series: p.series,
        isExtra: false,
        decimals: decimalsFor(p.rate),
      };
    });
  }, [liveData]);

  const selected = rows.find((r) => r.id === selectedId) ?? rows[0];

  if (liveLoading) {
    return (
      <div className="flex h-[560px] items-center justify-center rounded-2xl bg-zinc-950 text-sm text-zinc-400">
        Carregando cotações…
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-zinc-950 text-zinc-100 shadow-xl ring-1 ring-zinc-800">
      {/* barra superior */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div>
          <p className="text-sm font-semibold">Câmbio</p>
          <p className="text-xs text-zinc-500">
            Fonte: {liveData?.ok ? liveData.source : "Yahoo Finanças"}
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-[340px_1fr]">
        {/* lista de ativos */}
        <aside className="max-h-[640px] divide-y divide-zinc-800/70 overflow-y-auto border-b border-zinc-800 md:border-b-0 md:border-r">
          {rows.map((row) => {
            const up = row.changePct >= 0;
            const active = selected?.id === row.id;
            return (
              <button
                key={row.id}
                onClick={() => setSelectedId(row.id)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                  active ? "bg-zinc-800/80" : "hover:bg-zinc-900"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{row.symbol}</p>
                  <p className="truncate text-xs text-zinc-500">{row.name}</p>
                </div>
                <Sparkline values={row.series} up={up} />
                <div className="w-24 text-right">
                  <p className="text-sm font-semibold tabular-nums">
                    {row.price
                      ? row.isExtra
                        ? formatNumber(row.price, row.decimals)
                        : formatExchangeRate(row.price)
                      : "—"}
                  </p>
                  <span
                    className={`inline-block rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
                      up ? "bg-[#30d158] text-black" : "bg-[#ff453a] text-white"
                    }`}
                  >
                    {row.changePct > 0 ? "+" : ""}
                    {formatNumber(row.changePct, 2)}%
                  </span>
                </div>
              </button>
            );
          })}
          <p className="px-4 py-3 text-[11px] text-zinc-600">
            Dólar, real e guarani atualizados pelo Yahoo Finanças com o ajuste configurado
          </p>
        </aside>

        {/* detalhe do ativo */}
        <section className="flex flex-col gap-4 p-6">
          {selected ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">
                    {selected.symbol}{" "}
                    <span className="text-lg font-medium text-zinc-400">{selected.name}</span>
                  </h2>
                  <div className="mt-1 flex items-baseline gap-3">
                    <span className="text-3xl font-bold tabular-nums">
                      {selected.price
                        ? selected.isExtra
                          ? formatNumber(selected.price, selected.decimals)
                          : formatExchangeRate(selected.price)
                        : "—"}
                    </span>
                    <span
                      className={`text-lg font-semibold tabular-nums ${
                        selected.changePct >= 0 ? "text-[#30d158]" : "text-[#ff453a]"
                      }`}
                    >
                      {selected.changeAbs > 0 ? "+" : ""}
                      {formatNumber(selected.changeAbs, selected.decimals)} (
                      {selected.changePct > 0 ? "+" : ""}
                      {formatNumber(selected.changePct, 2)}%)
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {new Date().toLocaleDateString("pt-BR", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })}{" "}
                    · {new Date().toLocaleTimeString("pt-BR")}
                  </p>
                </div>
              </div>

              <BigChart
                values={selected.series}
                up={selected.changePct >= 0}
                exchange={!selected.isExtra}
              />

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(() => {
                  const s = selected.series.length ? selected.series : [selected.price];
                  const min = Math.min(...s);
                  const max = Math.max(...s);
                  const prev = selected.price - selected.changeAbs;
                  const formatValue = (value: number) =>
                    selected.isExtra
                      ? formatNumber(value, selected.decimals)
                      : formatExchangeRate(value);
                  const stats: Array<[string, string]> = [
                    ["Abertura", formatValue(s[0] ?? selected.price)],
                    ["Máxima", formatValue(max)],
                    ["Mínima", formatValue(min)],
                    ["Fechamento anterior", formatValue(prev)],
                  ];
                  return stats.map(([label, value]) => (
                    <div key={label} className="rounded-xl bg-zinc-900 p-3">
                      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
                      <p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
                    </div>
                  ));
                })()}
              </div>

            </>
          ) : (
            <p className="text-sm text-zinc-500">Selecione um ativo na lista.</p>
          )}
        </section>
      </div>
    </div>
  );
}
