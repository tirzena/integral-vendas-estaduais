import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Currency = "USD" | "BRL" | "PYG";

export type LivePair = {
  base: Currency;
  quote: Currency;
  rate: number;
  previousClose: number;
  changePct: number;
  time: number;
  /** Série intradiária normalizada para desenhar o mini gráfico. */
  series: number[];
  source: string;
  sourceUpdatedAt: string;
};

type Quote = {
  price: number;
  prev: number;
  time: number;
  series: number[];
  source: string;
  sourceUpdatedAt: string;
};

type ChacoExchangeItem = {
  isoCode: string;
  purchasePrice: number;
  salePrice: number;
  purchaseArbitrage?: number;
  saleArbitrage?: number;
  updatedAt?: string;
};

type ChacoExchangeResponse = {
  updateTs?: string;
  items?: ChacoExchangeItem[];
};

const CHACO_EXCHANGE_URL = "https://www.cambioschaco.com.py/api/branch_office/1/exchange/";
const CHACO_WIDGET_URL = "https://www.cambioschaco.com.py/widgets/cotizacion/?lang=pt";
const CHACO_SOURCE = "Câmbios Chaco";
const YAHOO_SOURCE = "Yahoo Finanças";
const DEFAULT_BRL_MARKUP = 0.12;

async function fetchYahoo(symbol: string): Promise<Quote> {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=5m&range=1d`,
    { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } },
  );
  if (!res.ok) throw new Error(`Yahoo Finanças HTTP ${res.status}`);
  const json = (await res.json()) as any;
  const result = json?.chart?.result?.[0];
  const meta = result?.meta ?? {};
  const price = Number(meta.regularMarketPrice);
  if (!price || !Number.isFinite(price)) throw new Error("Cotação indisponível no Yahoo Finanças");
  const prev = Number(meta.previousClose ?? meta.chartPreviousClose ?? price) || price;
  const raw = (result?.indicators?.quote?.[0]?.close ?? []) as (number | null)[];
  const series = raw.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const time = Number(meta.regularMarketTime ?? Math.floor(Date.now() / 1000));
  return {
    price,
    prev,
    time,
    series: series.length ? series : [price],
    source: YAHOO_SOURCE,
    sourceUpdatedAt: new Date(time * 1000).toISOString(),
  };
}

function addBrlMarkup(quote: Quote, markup: number): Quote {
  const add = Number.isFinite(markup) ? Math.max(0, markup) : DEFAULT_BRL_MARKUP;
  return {
    ...quote,
    price: quote.price + add,
    prev: quote.prev + add,
    series: quote.series.map((value) => value + add),
    source: `${YAHOO_SOURCE} + ajuste de R$ ${add.toFixed(2).replace(".", ",")}`,
  };
}

function buildYahooPairs(usdBrl: Quote, usdPyg: Quote): LivePair[] {
  const brlPyg = divide(usdPyg, usdBrl);
  return [
    mk("USD", "BRL", usdBrl),
    mk("BRL", "USD", invert(usdBrl)),
    mk("USD", "PYG", usdPyg),
    mk("PYG", "USD", invert(usdPyg)),
    mk("BRL", "PYG", brlPyg),
    mk("PYG", "BRL", invert(brlPyg)),
  ];
}

function invert(q: Quote): Quote {
  return {
    price: 1 / q.price,
    prev: 1 / q.prev,
    time: q.time,
    series: q.series.map((v) => 1 / v),
    source: q.source,
    sourceUpdatedAt: q.sourceUpdatedAt,
  };
}

function divide(a: Quote, b: Quote): Quote {
  const n = Math.min(a.series.length, b.series.length);
  const series: number[] = [];
  for (let i = 0; i < n; i++) {
    const av = a.series[a.series.length - n + i]!;
    const bv = b.series[b.series.length - n + i]!;
    if (bv) series.push(av / bv);
  }
  return {
    price: a.price / b.price,
    prev: a.prev / b.prev,
    time: Math.max(a.time, b.time),
    series: series.length ? series : [a.price / b.price],
    source: a.source === b.source ? a.source : `${a.source} / ${b.source}`,
    sourceUpdatedAt: a.time >= b.time ? a.sourceUpdatedAt : b.sourceUpdatedAt,
  };
}

function mk(base: Currency, quote: Currency, q: Quote): LivePair {
  return {
    base,
    quote,
    rate: q.price,
    previousClose: q.prev,
    changePct: q.prev ? ((q.price - q.prev) / q.prev) * 100 : 0,
    time: q.time,
    series: q.series.slice(-60),
    source: q.source,
    sourceUpdatedAt: q.sourceUpdatedAt,
  };
}

function chacoQuote(purchase: number, sale: number, updatedAt: string): Quote {
  if (!(purchase > 0) || !(sale > 0)) throw new Error("Cotação de compra ou venda inválida");
  const time = Math.floor(new Date(updatedAt).getTime() / 1000);
  if (!Number.isFinite(time)) throw new Error("Horário de atualização inválido");
  const price = (purchase + sale) / 2;
  return {
    price,
    prev: price,
    time,
    series: [price],
    source: CHACO_SOURCE,
    sourceUpdatedAt: new Date(time * 1000).toISOString(),
  };
}

function buildChacoPairs(usdPyg: Quote, brlPyg: Quote, usdBrl?: Quote): LivePair[] {
  const cross = usdBrl ?? divide(usdPyg, brlPyg);
  return [
    mk("USD", "BRL", cross),
    mk("BRL", "USD", invert(cross)),
    mk("USD", "PYG", usdPyg),
    mk("PYG", "USD", invert(usdPyg)),
    mk("BRL", "PYG", brlPyg),
    mk("PYG", "BRL", invert(brlPyg)),
  ];
}

function parseChacoNumber(value: string) {
  return Number(value.replace(/\./g, "").replace(",", "."));
}

async function fetchChacoWidget() {
  const res = await fetch(CHACO_WIDGET_URL, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" },
  });
  if (!res.ok) throw new Error(`Widget Câmbios Chaco HTTP ${res.status}`);
  const html = await res.text();
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => match[1] ?? "");
  const usdRow = rows.find((row) => /moneda\s+dolarUs/i.test(row));
  const brlRow = rows.find((row) => /moneda\s+real/i.test(row));
  const prices = (row?: string) =>
    row
      ? [...row.matchAll(/<td\b[^>]*class=["']text-right["'][^>]*>\s*([\d.,]+)/gi)].map((match) =>
          parseChacoNumber(match[1] ?? ""),
        )
      : [];
  const [usdPurchase, usdSale] = prices(usdRow);
  const [brlPurchase, brlSale] = prices(brlRow);
  const dateMatch = html.match(
    /class=["']time["'][^>]*>[\s\S]*?(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/i,
  );
  if (!dateMatch) throw new Error("Horário do widget da Câmbios Chaco não encontrado");
  const [, day, month, year, hour, minute] = dateMatch;
  const updatedAt = `${year}-${month}-${day}T${hour}:${minute}:00-03:00`;
  return buildChacoPairs(
    chacoQuote(usdPurchase!, usdSale!, updatedAt),
    chacoQuote(brlPurchase!, brlSale!, updatedAt),
  );
}

async function loadPairs(markup = DEFAULT_BRL_MARKUP) {
  const [usdBrl, usdPyg] = await Promise.all([
    fetchYahoo("USDBRL=X"),
    fetchYahoo("USDPYG=X"),
  ]);
  return buildYahooPairs(addBrlMarkup(usdBrl, markup), usdPyg);
}

async function exchangeMarkup(supabaseClient: any) {
  const { data } = await supabaseClient
    .from("company_settings")
    .select("exchange_markup_brl")
    .limit(1)
    .maybeSingle();
  const value = Number(data?.exchange_markup_brl ?? DEFAULT_BRL_MARKUP);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_BRL_MARKUP;
}

async function persistRateSnapshot(supabaseClient: any, userId: string, pairs: LivePair[], markup: number) {
  const { data: latest } = await supabaseClient
    .from("exchange_rates")
    .select("created_at,source")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest?.created_at && Date.now() - new Date(latest.created_at).getTime() < 5 * 60_000 &&
      String(latest.source ?? "").startsWith(YAHOO_SOURCE)) return;
  await supabaseClient.from("exchange_rates").insert(
    pairs.map((pair) => ({
      base_currency: pair.base,
      quote_currency: pair.quote,
      rate: Number(pair.rate.toFixed(10)),
      safety_margin: pair.base === "USD" && pair.quote === "BRL" ? markup : 0,
      source: pair.source,
      created_by: userId,
      is_demo: false,
    })),
  );
}

/** Cotações de mercado ao vivo (sem gravar nada). */
export const getLiveRates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const markup = await exchangeMarkup(context.supabase as any);
      const pairs = await loadPairs(markup);
      await persistRateSnapshot(context.supabase as any, context.userId, pairs, markup);
      return {
        ok: true as const,
        pairs,
        source: pairs[0]?.source ?? YAHOO_SOURCE,
        markup,
        sourceUpdatedAt: pairs[0]?.sourceUpdatedAt ?? new Date().toISOString(),
        fetchedAt: new Date().toISOString(),
      };
    } catch (err) {
      console.error("[cambio] falha ao buscar cotações ao vivo", err);
      return { ok: false as const, error: "Não foi possível consultar o mercado agora." };
    }
  });

/** Grava um registro histórico das cotações atuais em exchange_rates. */
export const syncExchangeRates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    let pairs: LivePair[];
    let markup = DEFAULT_BRL_MARKUP;
    try {
      markup = await exchangeMarkup(context.supabase as any);
      pairs = await loadPairs(markup);
    } catch (err) {
      console.error("[cambio] falha ao buscar cotações", err);
      return { ok: false as const, error: "Não foi possível consultar as cotações agora." };
    }

    const { error } = await context.supabase.from("exchange_rates").insert(
      pairs.map((p) => ({
        base_currency: p.base,
        quote_currency: p.quote,
        rate: Number(p.rate.toFixed(6)),
        safety_margin: p.base === "USD" && p.quote === "BRL" ? markup : 0,
        source: p.source,
        created_by: context.userId,
        is_demo: false,
      })),
    );

    if (error) {
      console.error("[cambio] falha ao salvar cotações", error);
      return { ok: false as const, error: "As cotações chegaram, mas não foi possível salvar." };
    }

    return { ok: true as const, updatedAt: new Date().toISOString(), pairs };
  });

export type MarketQuote = {
  symbol: string;
  price: number;
  previousClose: number;
  changePct: number;
  currency: string;
  time: number;
  series: number[];
};

async function fetchQuote(symbol: string): Promise<MarketQuote | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=5m&range=1d`,
      { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as any;
    const result = json?.chart?.result?.[0];
    const meta = result?.meta ?? {};
    const price = Number(meta.regularMarketPrice);
    if (!price || !Number.isFinite(price)) return null;
    const prev = Number(meta.previousClose ?? meta.chartPreviousClose ?? price) || price;
    const raw = (result?.indicators?.quote?.[0]?.close ?? []) as (number | null)[];
    const series = raw.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    return {
      symbol,
      price,
      previousClose: prev,
      changePct: prev ? ((price - prev) / prev) * 100 : 0,
      currency: String(meta.currency ?? "USD"),
      time: Number(meta.regularMarketTime ?? Math.floor(Date.now() / 1000)),
      series: (series.length ? series : [price]).slice(-60),
    };
  } catch {
    return null;
  }
}

/** Cotações ao vivo de quaisquer ativos (moedas, criptos, ações, índices). */
export const getMarketQuotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { symbols: string[] }) => ({
    symbols: (data?.symbols ?? []).filter((s) => typeof s === "string" && s.trim()).slice(0, 25),
  }))
  .handler(async ({ data }) => {
    const results = await Promise.all(data.symbols.map((s) => fetchQuote(s.trim().toUpperCase())));
    const quotes: Record<string, MarketQuote> = {};
    for (const q of results) if (q) quotes[q.symbol] = q;
    return { ok: true as const, quotes, fetchedAt: new Date().toISOString() };
  });
