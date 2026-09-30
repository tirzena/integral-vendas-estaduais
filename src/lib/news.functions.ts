import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type NewsItem = {
  title: string;
  link: string;
  source: string;
  publishedAt: string | null;
};

/** Decodifica entidades básicas de XML/HTML vindas do feed. */
function decode(text: string) {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}

function tag(block: string, name: string) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m?.[1] ? decode(m[1]) : "";
}

/** Monta os termos de busca conforme o tipo de ativo. */
function queryFor(symbol: string, name: string) {
  const s = symbol.toUpperCase();
  const extra = s.endsWith("=X") || s.includes("-")
    ? "câmbio OR cotação OR mercado"
    : "mercado OR ações OR resultados";
  const clean = name && name !== symbol ? name : s.replace(/[-^=X]/g, " ");
  return `${clean} ${extra}`;
}

async function fetchFeed(url: string): Promise<NewsItem[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/rss+xml, application/xml" },
  });
  if (!res.ok) return [];
  const xml = await res.text();
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  return blocks.map((block) => {
    const rawTitle = tag(block, "title");
    const source = tag(block, "source");
    const title = source && rawTitle.endsWith(`- ${source}`)
      ? rawTitle.slice(0, -(source.length + 2)).trim()
      : rawTitle;
    const pub = tag(block, "pubDate");
    return {
      title,
      link: tag(block, "link"),
      source: source || "Notícias",
      publishedAt: pub ? new Date(pub).toISOString() : null,
    };
  });
}

/**
 * Reúne manchetes de vários sites de notícias (via agregador do Google Notícias)
 * relacionadas ao ativo/moeda selecionado.
 */
export const getMarketNews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { symbol: string; name?: string }) => ({
    symbol: String(input.symbol ?? "").slice(0, 40),
    name: String(input.name ?? "").slice(0, 80),
  }))
  .handler(async ({ data }): Promise<NewsItem[]> => {
    const q = encodeURIComponent(queryFor(data.symbol, data.name ?? ""));
    const feeds = [
      `https://news.google.com/rss/search?q=${q}&hl=pt-BR&gl=BR&ceid=BR:pt-419`,
      `https://news.google.com/rss/search?q=${q}+when:7d&hl=en-US&gl=US&ceid=US:en`,
    ];
    const results = await Promise.allSettled(feeds.map(fetchFeed));
    const all = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    const seen = new Set<string>();
    return all
      .filter((n) => {
        const key = n.title.toLowerCase();
        if (!n.title || !n.link || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
      .slice(0, 18);
  });
