import { useProductCatalogConfigs, useProductImages } from "@/lib/storage";
import { informationSourceUrl } from "@/lib/product-information";
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  GraduationCap,
  Monitor,
  Printer,
  Search,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useAuth";
import { useProductScope } from "@/hooks/useProductScope";
import { PageHeader, EmptyState } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  filterStudyProducts,
  readStudyProgress,
  STUDY_GLOSSARY,
  studySource,
  studyText,
  studyImagePath,
  type StudyProduct,
} from "@/lib/study-guide";

export const Route = createFileRoute("/_authenticated/guia-de-estudo")({
  head: () => ({ meta: [{ title: "Guia de estudo — Sistema Integral" }] }),
  component: StudyGuide,
});

const fields =
  "id,name,brand,product_id,image_url,variation,size,volume,weight,public_description,intended_use,usage_instructions,information_source_url";
const selectClass = "h-10 min-w-0 rounded-md border bg-background px-3 text-sm";

export function StudyGuide() {
  const { userId } = useCurrentUser();
  const { products, productId } = useProductScope();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("todos");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [progressFilter, setProgressFilter] = useState("all");
  const [tab, setTab] = useState("library");
  const [term, setTerm] = useState("");
  const [selected, setSelected] = useState<StudyProduct | null>(null);
  const [presentation, setPresentation] = useState(false);
  const [progress, setProgress] = useState<{ key: string; ids: string[] }>({ key: "", ids: [] });
  const progressKey = userId ? `integral:study-guide:${userId}` : "";

  useEffect(() => {
    if (!progressKey) return;
    try {
      setProgress({ key: progressKey, ids: readStudyProgress(localStorage.getItem(progressKey)) });
    } catch {
      setProgress({ key: progressKey, ids: [] });
    }
  }, [progressKey]);
  const studied = useMemo(
    () => new Set(progress.key === progressKey ? progress.ids : []),
    [progress, progressKey],
  );
  const toggleStudied = (id: string) => {
    if (!progressKey) return;
    const ids = studied.has(id) ? [...studied].filter((value) => value !== id) : [...studied, id];
    setProgress({ key: progressKey, ids });
    try {
      localStorage.setItem(progressKey, JSON.stringify(ids));
    } catch {
      /* Remains available for this session. */
    }
  };
  const query = useQuery({
    queryKey: ["inventory-study-guide", userId],
    enabled: !!userId,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const items: StudyProduct[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await supabase
          .from("inventory_items")
          .select(fields)
          .eq("is_active", true)
          .order("name")
          .order("id")
          .range(offset, offset + 499);
        if (error) throw error;
        items.push(...(data ?? []));
        if (!data || data.length < 500) return items;
      }
    },
  });
  const configs = useProductCatalogConfigs();
  const imagePathOf = (item: StudyProduct) => studyImagePath(item, configs.data?.[item.id]);
  const imagePaths = (query.data ?? []).map(imagePathOf);
  const images = useProductImages(imagePaths.filter(path => !informationSourceUrl(path)));
  const imageOf = (item: StudyProduct) => {
    const path = imagePathOf(item);
    return informationSourceUrl(path) ?? (path ? images.data?.[path] : null);
  };
  useEffect(() => {
    setSelected(current => current ? query.data?.find(item => item.id === current.id) ?? null : null);
  }, [query.data]);
  useEffect(() => {
    // Reuse inventory invalidation for immediate product changes; refresh gallery
    // metadata too, including changes made in another browser.
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void query.refetch();
      void configs.refetch();
      if (images.isStale) void images.refetch();
    };
    const interval = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(interval); window.removeEventListener("focus", refresh); };
  }, [query.refetch, configs.refetch, images.refetch, images.isStale]);
  const items = useMemo(
    () =>
      (query.data ?? []).filter((item) => productId === "todos" || item.product_id === productId),
    [query.data, productId],
  );
  const visible = useMemo(
    () =>
      filterStudyProducts(items, {
        search,
        category,
        source: sourceFilter,
        progress: progressFilter,
        studied,
      }),
    [items, search, category, sourceFilter, progressFilter, studied],
  );
  useEffect(() => {
    setCategory("todos");
    setSelected(null);
  }, [productId]);
  const studiedCount = items.filter((item) => studied.has(item.id)).length;
  const sourceCount = items.filter((item) => studySource(item.information_source_url)).length;
  const selectedSource = selected ? studySource(selected.information_source_url) : null;
  const index = selected ? visible.findIndex((item) => item.id === selected.id) : -1;
  const sources = [
    ...new Map(
      items.flatMap((item) => {
        const source = studySource(item.information_source_url);
        return source ? [[source.url, source] as const] : [];
      }),
    ).values(),
  ];
  const resetFilters = () => {
    setSearch("");
    setCategory("todos");
    setSourceFilter("all");
    setProgressFilter("all");
  };

  return (
    <div className={`space-y-6 ${presentation ? "study-presentation text-lg" : ""}`}>
      <style>{`.study-presentation p {font-size:1.05rem;line-height:1.8} @media print {body * {visibility:hidden} .study-print-target,.study-print-target * {visibility:visible} .study-print-target {position:absolute!important;left:0!important;top:0!important;transform:none!important;max-height:none!important;overflow:visible!important;width:100%!important;max-width:none!important;background:white!important;color:black!important} .guide-controls {display:none!important} .study-card {break-inside:avoid}}`}</style>
      <div className="guide-controls">
        <PageHeader
          title="Guia de estudo"
          description="Biblioteca de produtos do Sistema Integral. Aprenda por produto, compare as fontes e acompanhe sua leitura."
          actions={
            <>
              <Button
                variant="outline"
                aria-pressed={presentation}
                onClick={() => setPresentation(!presentation)}
              >
                <Monitor className="mr-2 size-4" />
                {presentation ? "Sair da apresentação" : "Apresentação"}
              </Button>
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="mr-2 size-4" />
                Imprimir / PDF
              </Button>
            </>
          }
        />
      </div>
      <div className={!selected ? "study-print-target space-y-6" : "space-y-6"}>
        <section className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/15 via-card to-card p-6 md:p-9">
          <div className="max-w-3xl">
            <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              <GraduationCap className="size-5" />
              Sistema Integral · Formação
            </p>
            <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
              Conheça cada produto.
              <br />
              Entenda o contexto da informação.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Uma ficha para cada apresentação do catálogo: o que é, finalidade descrita,
              orientações documentadas e fontes para aprofundar a leitura.
            </p>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              [items.length, "produtos na biblioteca"],
              [sourceCount, "com fonte cadastrada"],
              [studiedCount, "marcados como estudados"],
            ].map(([value, label]) => (
              <div key={label} className="rounded-xl border bg-background/60 p-4">
                <strong className="font-display text-2xl">{value}</strong>
                <p className="mt-1 text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
          <div
            className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label="Progresso de estudo"
            aria-valuemin={0}
            aria-valuemax={items.length || 1}
            aria-valuenow={studiedCount}
          >
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${items.length ? (studiedCount / items.length) * 100 : 0}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Seu progresso é salvo neste navegador e separado por usuário.
          </p>
        </section>
        <nav aria-label="Seções do guia" className="guide-controls flex flex-wrap gap-2">
          {[
            ["library", "Biblioteca"],
            ["glossary", "Glossário"],
            ["sources", "Referências"],
          ].map(([value, label]) => (
            <Button
              key={value}
              variant={tab === value ? "default" : "outline"}
              onClick={() => setTab(value ?? "library")}
              aria-pressed={tab === value}
            >
              {label}
            </Button>
          ))}
        </nav>
        <p className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
          Uma referência sobre a molécula não valida automaticamente a marca ou apresentação. As
          fichas distinguem o que está documentado do que ainda precisa ser confirmado; não definem
          protocolos de aplicação.
        </p>

        {tab === "library" && (
          <section className="space-y-4" aria-label="Biblioteca de produtos">
            <div className="guide-controls grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="relative">
                <span className="sr-only">Buscar produto</span>
                <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Buscar produto, marca ou finalidade"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <select
                aria-label="Filtrar categoria"
                className={selectClass}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="todos">Todas as categorias do filtro atual</option>
                {products
                  .filter((p) => productId === "todos" || p.id === productId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
              <select
                aria-label="Filtrar documentação"
                className={selectClass}
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
              >
                <option value="all">Toda a documentação</option>
                <option value="with">Com fonte cadastrada</option>
                <option value="pending">Documentação pendente</option>
              </select>
              <select
                aria-label="Filtrar progresso"
                className={selectClass}
                value={progressFilter}
                onChange={(e) => setProgressFilter(e.target.value)}
              >
                <option value="all">Todo o progresso</option>
                <option value="pending">Ainda não estudei</option>
                <option value="done">Já estudei</option>
              </select>
            </div>
            <div className="flex items-center justify-between text-sm">
              <p className="text-muted-foreground">
                {visible.length} de {items.length} produtos
              </p>
              <Button className="guide-controls" variant="ghost" onClick={resetFilters}>
                Limpar filtros
              </Button>
            </div>
            {query.isLoading && <p role="status">Carregando biblioteca…</p>}
            {query.isError && (
              <div role="alert" className="rounded-xl border p-5">
                <p>Não foi possível carregar o guia.</p>
                <Button variant="outline" className="mt-3" onClick={() => void query.refetch()}>
                  Tentar novamente
                </Button>
              </div>
            )}
            {!query.isLoading && !query.isError && !visible.length && (
              <EmptyState
                title="Nenhum produto encontrado"
                description="Confira os filtros e as categorias disponíveis para seu perfil."
                action={<Button onClick={resetFilters}>Limpar filtros</Button>}
              />
            )}
            <div
              className={`grid gap-4 ${presentation ? "md:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-3"}`}
            >
              {visible.map((item) => {
                const source = studySource(item.information_source_url);
                return (
                  <article
                    key={item.id}
                    className="study-card flex flex-col overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md"
                  >
                    <div className="flex h-40 items-center justify-center border-b bg-muted/20 p-4">
                      {imageOf(item) ? (
                        <img
                          src={imageOf(item) ?? undefined}
                          alt={item.name}
                          className="h-full w-full object-contain"
                          loading="lazy"
                        />
                      ) : (
                        <BookOpen className="size-12 text-primary/30" />
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-3 p-5">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary">{source?.kind ?? "Documentação pendente"}</Badge>
                        {studied.has(item.id) && (
                          <Badge variant="outline">
                            <CheckCircle2 className="mr-1 size-3" />
                            Estudado
                          </Badge>
                        )}
                      </div>
                      <div>
                        <p className="mb-1 text-xs text-muted-foreground">
                          {item.brand ||
                            products.find((p) => p.id === item.product_id)?.name ||
                            "Produto do catálogo"}
                        </p>
                        <h3 className="font-display text-lg font-semibold">{item.name}</h3>
                      </div>
                      <p className="line-clamp-3 flex-1 text-sm leading-relaxed text-muted-foreground">
                        {item.public_description || "Descrição pública ainda não cadastrada."}
                      </p>
                      <Button
                        className="guide-controls mt-auto justify-between"
                        variant="outline"
                        onClick={() => setSelected(item)}
                      >
                        Conhecer o produto
                        <ChevronRight className="size-4" />
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {tab === "glossary" && (
          <section className="space-y-4">
            <h2 className="font-display text-2xl font-semibold">
              Palavras para acompanhar a leitura
            </h2>
            <Input
              aria-label="Buscar termo no glossário"
              className="guide-controls max-w-md"
              placeholder="Buscar termo"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Leitura de apoio:{" "}
              <a
                href="https://www.fda.gov/patients/drug-development-process/step-2-preclinical-research"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                pesquisa pré-clínica
              </a>{" "}
              e{" "}
              <a
                href="https://www.fda.gov/patients/drug-development-process/step-3-clinical-research"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                pesquisa clínica
              </a>{" "}
              (FDA).
            </p>
            <dl className="grid gap-3 md:grid-cols-2">
              {STUDY_GLOSSARY.filter((entry) =>
                studyText(entry.join(" ")).includes(studyText(term)),
              ).map(([title, text]) => (
                <div key={title} className="study-card rounded-xl border p-5">
                  <dt className="font-semibold">{title}</dt>
                  <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
        {tab === "sources" && (
          <section className="space-y-4">
            <h2 className="font-display text-2xl font-semibold">Fontes dos produtos</h2>
            <p className="text-sm text-muted-foreground">
              Referências cadastradas nas fichas deste catálogo. O tipo da fonte não representa uma
              classificação de aprovação ou de eficácia.
            </p>
            <ul className="space-y-2">
              {sources.map((source) => (
                <li key={source.url} className="rounded-xl border p-4">
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-primary underline"
                  >
                    <ExternalLink className="size-4 shrink-0" />
                    <span className="break-all">{source.host}</span>
                  </a>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {source.kind} ·{" "}
                    {items
                      .filter(
                        (item) => studySource(item.information_source_url)?.url === source.url,
                      )
                      .map((item) => item.name.trim())
                      .join(", ")}
                  </p>
                </li>
              ))}
            </ul>
            {!sources.length && (
              <p className="text-sm">
                Ainda não há fontes cadastradas para os produtos deste filtro.
              </p>
            )}
          </section>
        )}
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent
          className={`study-print-target max-h-[90vh] overflow-y-auto ${presentation ? "study-presentation sm:max-w-5xl text-lg" : "sm:max-w-3xl"}`}
        >
          {selected && (
            <>
              <DialogHeader>
                <p className="text-xs uppercase tracking-widest text-primary">
                  Sistema Integral · Ficha de estudo
                </p>
                <DialogTitle className="font-display text-2xl">{selected.name}</DialogTitle>
                <DialogDescription>
                  {[
                    selected.brand,
                    selected.variation,
                    selected.size,
                    selected.volume,
                    selected.weight,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Apresentação cadastrada no catálogo"}
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{selectedSource?.kind ?? "Documentação pendente"}</Badge>
                {studied.has(selected.id) && <Badge variant="outline">Estudado</Badge>}
              </div>
              {imageOf(selected) && (
                <img
                  src={imageOf(selected) ?? undefined}
                  alt={selected.name}
                  className="mx-auto h-40 w-full object-contain"
                />
              )}
              <div className="space-y-5">
                {[
                  [
                    "01",
                    "O que é?",
                    selected.public_description || "Descrição pública ainda não cadastrada.",
                  ],
                  [
                    "02",
                    "Finalidade e contexto",
                    selected.intended_use || "Finalidade específica ainda não documentada.",
                  ],
                  [
                    "03",
                    "Orientações documentadas",
                    selected.usage_instructions ||
                      "Não há orientação documentada para esta apresentação.",
                  ],
                  [
                    "04",
                    "Como interpretar a informação",
                    "Confira se a referência trata da mesma composição, concentração, via, população e finalidade. Um estudo em laboratório, uma bula de outra marca e uma autorização em outro país respondem a perguntas diferentes.",
                  ],
                  [
                    "05",
                    "O que confirmar nesta apresentação",
                    "Identifique fabricante, composição completa, concentração, lote e documento oficial. Se a ficha indicar confirmação pendente, esses dados ainda precisam ser fornecidos. Não transfira doses, indicações ou resultados de outra apresentação.",
                  ],
                ].map(([number, title, text]) => (
                  <section key={number} className="study-card rounded-xl border p-4">
                    <h3 className="mb-2 flex items-center gap-3 font-semibold">
                      <span className="text-sm text-primary">{number}</span>
                      {title}
                    </h3>
                    <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                      {text}
                    </p>
                  </section>
                ))}
                <section className="study-card rounded-xl border p-4">
                  <h3 className="mb-2 font-semibold">06 · Referência para aprofundar</h3>
                  {selectedSource ? (
                    <>
                      <a
                        href={selectedSource.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 break-all text-sm text-primary underline"
                      >
                        <ExternalLink className="size-4 shrink-0" />
                        {selectedSource.host}
                      </a>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Leia o documento original e confira sua data, abrangência e limitações.
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Aguardando documentação específica do fabricante. A ficha pode ser
                      complementada pelo administrador no catálogo.
                    </p>
                  )}
                </section>
              </div>
              <div className="guide-controls flex flex-wrap justify-between gap-2 border-t pt-4">
                <Button
                  variant="outline"
                  disabled={index <= 0}
                  onClick={() => setSelected(visible[index - 1] ?? null)}
                >
                  <ChevronLeft className="mr-1 size-4" />
                  Anterior
                </Button>
                <Button
                  aria-pressed={studied.has(selected.id)}
                  onClick={() => toggleStudied(selected.id)}
                >
                  <CheckCircle2 className="mr-2 size-4" />
                  {studied.has(selected.id) ? "Desmarcar estudo" : "Marcar como estudado"}
                </Button>
                <Button variant="outline" onClick={() => window.print()}>
                  <Printer className="mr-2 size-4" />
                  PDF da ficha
                </Button>
                <Button
                  variant="outline"
                  disabled={index < 0 || index >= visible.length - 1}
                  onClick={() => setSelected(visible[index + 1] ?? null)}
                >
                  Próximo
                  <ChevronRight className="ml-1 size-4" />
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
