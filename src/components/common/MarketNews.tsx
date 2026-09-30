import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Newspaper, RefreshCw } from "lucide-react";
import { getMarketNews, type NewsItem } from "@/lib/news.functions";

/** Tempo relativo simples em português. */
function since(iso: string | null) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return `há ${Math.max(1, Math.floor(diff / 60_000))} min`;
  if (h < 24) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} d`;
}

/** Manchetes de vários sites que podem influenciar o ativo selecionado. */
export function MarketNews({ symbol, name }: { symbol: string; name: string }) {
  const fetchNews = useServerFn(getMarketNews);
  const { data, isLoading, isFetching, refetch, isError } = useQuery({
    queryKey: ["market-news", symbol],
    queryFn: () => fetchNews({ data: { symbol, name } }) as Promise<NewsItem[]>,
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  });

  return (
    <div className="rounded-xl bg-zinc-900 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
          <Newspaper className="size-4" /> Notícias que podem influenciar {name || symbol}
        </h3>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1 rounded-md bg-zinc-800 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-700"
        >
          <RefreshCw className={`size-3 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-zinc-500">Buscando manchetes…</p>
      ) : isError ? (
        <p className="text-sm text-zinc-500">Não foi possível carregar as notícias agora.</p>
      ) : (data ?? []).length === 0 ? (
        <p className="text-sm text-zinc-500">Nenhuma notícia recente encontrada para este ativo.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {(data ?? []).map((n) => (
            <li key={n.link}>
              <a
                href={n.link}
                target="_blank"
                rel="noreferrer noopener"
                className="block rounded-lg bg-zinc-950/60 p-3 transition hover:bg-zinc-800"
              >
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                  {n.source} {n.publishedAt ? `· ${since(n.publishedAt)}` : ""}
                </p>
                <p className="mt-1 line-clamp-3 text-sm text-zinc-100">{n.title}</p>
                <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-zinc-500">
                  Abrir <ExternalLink className="size-3" />
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
