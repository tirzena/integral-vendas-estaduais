import { useEffect, useMemo, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Calculator,
  ExternalLink,
  Images,
  MessageCircle,
  Minus,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import {
  CATALOG_MINIMUM_UNITS,
  getPublicCatalog,
  quoteCatalogFreight,
  submitCatalogOrder,
  type CatalogFreightQuote,
  type PublicCatalog,
  type PublicCatalogItem,
} from "@/lib/catalog.functions";
import { formatMoney } from "@/lib/format";
import { CurrencyValues } from "@/components/common/CurrencyValues";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { MediaEmbed } from "@/components/scripts/MediaEmbed";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/catalogo/$slug")({
  loader: async ({ params }) => {
    const catalog = await getPublicCatalog({ data: { slug: params.slug } });
    if (!catalog) throw notFound();
    return catalog;
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Catálogo indisponível — OS" }, { name: "robots", content: "noindex" }],
      };
    }
    const title = `${loaderData.title} — OS`;
    const description =
      loaderData.description ?? "Confira os produtos disponíveis neste catálogo digital.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  errorComponent: () => (
    <CenterMessage title="Não foi possível abrir" text="Tente novamente em alguns instantes." />
  ),
  notFoundComponent: () => (
    <CenterMessage title="Catálogo não encontrado" text="Este link pode ter sido desativado." />
  ),
  component: PublicCatalogPage,
});

function CenterMessage({ title, text }: { title: string; text: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-8 text-center">
      <div>
        <h1 className="font-display text-2xl font-semibold">{title}</h1>
        <p className="text-muted-foreground mt-2 text-sm">{text}</p>
      </div>
    </main>
  );
}

type CartLine = { id: string; quantity: number };

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const DECIMAL_UNITS = ["kg", "g", "l", "ml", "m", "m2", "m²", "cm"];
const allowsDecimal = (unit: string | null) =>
  !!unit && DECIMAL_UNITS.includes(unit.trim().toLowerCase());

const BRAZIL_STATES = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
];

function makeKey() {
  const c = globalThis.crypto;
  return c && "randomUUID" in c
    ? c.randomUUID()
    : `k${Date.now()}${Math.random().toString(36).slice(2, 12)}`;
}

function ProductMediaCarousel({ item }: { item: PublicCatalogItem }) {
  if (!item.media.length) return null;
  return (
    <Carousel opts={{ loop: item.media.length > 1 }} className="w-full">
      <CarouselContent>
        {item.media.map((media) => (
          <CarouselItem key={media.id}>
            <div className="flex min-h-64 items-center justify-center overflow-hidden rounded-lg border bg-muted/20">
              {media.kind === "image" ? (
                <img
                  src={media.url}
                  alt={media.label || item.name}
                  className="max-h-96 w-full object-contain"
                />
              ) : media.kind === "video" ? (
                <video controls src={media.url} className="max-h-96 w-full bg-black object-contain">
                  <track kind="captions" />
                </video>
              ) : (
                <div className="w-full p-3">
                  <MediaEmbed url={media.url} label={media.label || item.name} />
                </div>
              )}
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      {item.media.length > 1 && (
        <>
          <CarouselPrevious className="left-2" />
          <CarouselNext className="right-2" />
        </>
      )}
    </Carousel>
  );
}

function PublicCatalogPage() {
  const catalog = Route.useLoaderData();
  const convert = (
    value: number | null | undefined,
    from: "BRL" | "USD" | "PYG",
    to: "BRL" | "USD" | "PYG",
  ) => {
    const factor = catalog.exchangeRates[`${from}-${to}`];
    return factor ? Number(value ?? 0) * factor : null;
  };
  const rates = {
    allCurrencies: (value: number, from: "BRL" | "USD" | "PYG") =>
      (["BRL", "USD", "PYG"] as const).map((currency) => ({
        currency,
        text: formatMoney(convert(value, from, currency) ?? 0, currency),
      })),
  };
  const cartKey = `os-cart:${catalog.slug}`;

  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("todos");
  const [brand, setBrand] = useState("todas");
  const [onlyOffers, setOnlyOffers] = useState(false);
  const [detail, setDetail] = useState<PublicCatalogItem | null>(null);
  const [sellerItem, setSellerItem] = useState<PublicCatalogItem | null>(null);
  const [preferredSellerId, setPreferredSellerId] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [freightState, setFreightState] = useState("");
  const [freightCity, setFreightCity] = useState("");
  const [freightQuote, setFreightQuote] = useState<CatalogFreightQuote | null>(null);
  const [freightLoading, setFreightLoading] = useState(false);
  const [freightError, setFreightError] = useState<string | null>(null);
  const [headerCompact, setHeaderCompact] = useState(false);
  const productsScrollRef = useRef<HTMLDivElement>(null);
  const headerWheelRef = useRef<HTMLDivElement>(null);
  const quoteFreight = useServerFn(quoteCatalogFreight);

  useEffect(() => {
    const scroller = productsScrollRef.current;
    const header = headerWheelRef.current;
    if (!scroller) return;
    const onScroll = () => setHeaderCompact(scroller.scrollTop > 24);
    const forwardWheel = (event: WheelEvent) => {
      if (event.deltaY === 0) return;
      scroller.scrollBy({ top: event.deltaY, behavior: "auto" });
      if (event.deltaY > 0) setHeaderCompact(true);
      if (event.deltaY < 0 && scroller.scrollTop <= 24) setHeaderCompact(false);
      event.preventDefault();
    };
    const forwardTouch = () => setHeaderCompact(true);
    onScroll();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    header?.addEventListener("wheel", forwardWheel, { passive: false });
    header?.addEventListener("touchmove", forwardTouch, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      header?.removeEventListener("wheel", forwardWheel);
      header?.removeEventListener("touchmove", forwardTouch);
    };
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(cartKey);
      if (raw) {
        const stored = JSON.parse(raw) as CartLine[];
        setCart(
          stored.flatMap((line) => {
            const item = catalog.items.find((entry) => entry.id === line.id);
            if (!item) return [];
            return [{ ...line, quantity: Math.max(item.minQuantity, line.quantity) }];
          }),
        );
      }
    } catch {
      /* carrinho vazio */
    }
  }, [cartKey, catalog.items]);

  useEffect(() => {
    try {
      localStorage.setItem(cartKey, JSON.stringify(cart));
    } catch {
      /* sem persistência disponível */
    }
  }, [cart, cartKey]);

  const groups = useMemo(() => [...new Set(catalog.items.map((i) => i.group))], [catalog.items]);

  const filtered = useMemo(() => {
    const term = normalize(search).trim();
    return catalog.items.filter((i) => {
      if (group !== "todos" && i.group !== group) return false;
      if (brand !== "todas" && i.brand !== brand) return false;
      if (onlyOffers && !i.offer) return false;
      if (!term) return true;
      return normalize(`${i.name} ${i.brand ?? ""} ${i.sku ?? ""} ${i.spec}`).includes(term);
    });
  }, [catalog.items, search, group, brand, onlyOffers]);

  const itemById = (id: string) => catalog.items.find((i) => i.id === id);
  const lines = cart
    .map((l) => ({ line: l, item: itemById(l.id) }))
    .filter((x): x is { line: CartLine; item: PublicCatalogItem } => !!x.item);
  const cartCount = lines.reduce((s, l) => s + l.line.quantity, 0);
  const subtotal = lines.reduce((s, l) => s + (l.item.price ?? 0) * l.line.quantity, 0);
  const minimumMet = lines.length > 0 && lines.every(({ line, item }) => line.quantity >= item.minQuantity);

  useEffect(() => {
    setFreightQuote(null);
    setFreightError(null);
  }, [cart]);

  async function calculateFreight() {
    if (!minimumMet) {
      setFreightError("Confira a quantidade mínima de cada produto do pedido.");
      return;
    }
    if (!freightState) {
      setFreightError("Escolha o estado de entrega.");
      return;
    }
    setFreightLoading(true);
    setFreightError(null);
    try {
      const result = await quoteFreight({
        data: {
          slug: catalog.slug,
          state: freightState,
          city: freightCity.trim() || null,
          items: lines.map((entry) => ({
            item_id: entry.item.id,
            quantity: entry.line.quantity,
          })),
        },
      });
      setFreightQuote(result);
    } catch (error) {
      setFreightError(
        error instanceof Error ? error.message : "Não foi possível calcular o frete.",
      );
    } finally {
      setFreightLoading(false);
    }
  }

  const setQty = (id: string, quantity: number) =>
    setCart((prev) => {
      const item = itemById(id);
      if (!item) return prev;
      if (quantity <= 0) return prev.filter((l) => l.id !== id);
      const minimum = Math.max(1, item.minQuantity);
      const next = Math.max(minimum, quantity);
      return prev.map((l) => (l.id === id ? { ...l, quantity: next } : l));
    });

  const startOrder = (item: PublicCatalogItem) => {
    setCart((prev) => {
      const found = prev.find((l) => l.id === item.id);
      const next = Math.max(found?.quantity ?? 0, item.minQuantity);
      const capped = item.stock > 0 ? Math.min(next, item.stock) : next;
      return found
        ? prev.map((l) => (l.id === item.id ? { ...l, quantity: capped } : l))
        : [...prev, { id: item.id, quantity: capped }];
    });
    setCartOpen(true);
  };

  const price = (item: PublicCatalogItem) =>
    catalog.showPrices && item.price !== null
      ? formatMoney(item.price, item.currency)
      : catalog.consultLabel;

  const priceInAllCurrencies = (item: PublicCatalogItem) => {
    if (!catalog.showPrices || item.price === null) return null;
    const converted = rates.allCurrencies(item.price, item.currency);
    return (
      <div className="space-y-0.5">
        {converted.map((value) => (
          <p
            key={value.currency}
            className={
              value.currency === item.currency
                ? "font-display text-lg font-semibold"
                : "text-xs text-muted-foreground"
            }
          >
            {value.text}
          </p>
        ))}
      </div>
    );
  };

  const whats = (catalog.whatsapp ?? catalog.contactPhone)?.replace(/\D/g, "");
  const style = {
    ...(catalog.primaryColor ? { ["--primary" as string]: catalog.primaryColor } : {}),
    ...(catalog.accentColor ? { ["--accent" as string]: catalog.accentColor } : {}),
  } as React.CSSProperties;

  return (
    <main className="bg-background flex h-dvh flex-col overflow-hidden" style={style}>
      <div ref={headerWheelRef} className="z-40 shrink-0 bg-background shadow-xl shadow-black/20">
      <header className="relative border-b bg-card">
        {catalog.banner ? (
          <div className="relative w-full">
            <img
              src={catalog.banner}
              alt={`Banner do catálogo ${catalog.title}`}
              className={`block w-full object-cover object-center transition-[height] duration-300 ${headerCompact ? "h-[130px] sm:h-[155px]" : "h-[clamp(320px,42vh,520px)]"}`}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/10 to-black/20" aria-hidden="true" />
            <div className="absolute inset-0 z-10 mx-auto flex max-w-6xl items-end px-5 pb-5 sm:items-center sm:pb-0">
              <div className="flex w-full flex-wrap items-center gap-4">
                {catalog.logo && (
                  <img
                    src={catalog.logo}
                    alt={`Logo de ${catalog.title}`}
                    className="hidden size-14 rounded-lg bg-black/20 object-contain sm:block"
                  />
                )}
                <div className="min-w-0 flex-1 text-white drop-shadow-md">
                  <p className="text-xs tracking-[0.3em] uppercase text-white/80">OS</p>
                  <h1 className={`font-display mt-1 font-black tracking-tight transition-all duration-300 ${headerCompact ? "text-2xl sm:text-3xl" : "text-3xl sm:text-5xl lg:text-6xl"}`}>
                    {catalog.title}
                  </h1>
                  {catalog.description && (
                    <p className="mt-2 hidden max-w-2xl text-sm text-white/85 md:block">{catalog.description}</p>
                  )}
                </div>
       </div>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex min-h-[180px] max-w-6xl flex-wrap items-center gap-4 px-5 py-8">
            <div className="min-w-0 flex-1">
              <p className="text-muted-foreground text-xs tracking-[0.3em] uppercase">OS</p>
              <h1 className="font-display mt-1 text-3xl font-semibold sm:text-4xl">{catalog.title}</h1>
            </div>
          </div>
        )}
      </header>

      <div className={`mx-auto max-w-6xl px-5 transition-all duration-300 ${headerCompact ? "py-2" : "py-5"}`}>
        <div className="grid gap-2 lg:grid-cols-[minmax(260px,2fr)_minmax(190px,1fr)]">
          <div className="relative">
            <Search className="text-muted-foreground absolute top-2.5 left-2 size-4" />
            <Input
              className="pl-8"
              placeholder="Buscar produto, marca ou código"
              aria-label="Buscar no catálogo"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={group} onValueChange={setGroup}>
            <SelectTrigger aria-label="Categoria">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas as categorias</SelectItem>
              {groups.map((g) => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:flex sm:flex-nowrap sm:items-center">
          <Select value={brand} onValueChange={setBrand}>
            <SelectTrigger className="col-span-2 w-full sm:col-span-1 sm:w-[240px] sm:shrink-0" aria-label="Marca">
              <SelectValue placeholder="Marca" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as marcas</SelectItem>
              {catalog.brands.map((b) => (
                <SelectItem key={b} value={b}>{b}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button className="shrink-0" variant={onlyOffers ? "default" : "outline"} onClick={() => setOnlyOffers((v) => !v)}>
            Ofertas
          </Button>
          {catalog.ordersEnabled && (
            <Button className="shrink-0" variant="outline" onClick={() => setCartOpen(true)}>
              <ShoppingCart className="mr-2 size-4" />
              Carrinho {cartCount > 0 && `(${cartCount})`}
            </Button>
          )}
          <Button variant="outline" className="catalog-site-button catalog-site-tirzena h-11 shrink-0 px-6 font-semibold" asChild>
            <a href="https://www.tirzena.com" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 size-4" /> Site Tirzena
            </a>
          </Button>
          <Button variant="outline" className="catalog-site-button catalog-site-retrazin h-11 shrink-0 px-6 font-semibold" asChild>
            <a href="https://www.retrazin.com" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 size-4" /> Site Retrazin
            </a>
          </Button>
        </div>

        </div>
      </div>

      <div ref={productsScrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-6xl px-5 pb-8 pt-4">

        {filtered.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nenhum produto encontrado com esses filtros.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {filtered.map((item) => (
              <article key={item.id} className="surface-card flex flex-col overflow-hidden p-0">
                <button
                  type="button"
                  className="bg-muted aspect-square w-full overflow-hidden text-left"
                  onClick={() => setDetail(item)}
                  aria-label={`Ver detalhes de ${item.name}`}
                >
                  {item.image ? (
                    <img
                      src={item.image}
                      alt={item.name}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="text-muted-foreground flex h-full items-center justify-center text-xs">
                      sem foto
                    </div>
                  )}
                </button>
                <div className="flex flex-1 flex-col gap-1 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{item.name}</p>
                    {item.offer && <Badge>oferta</Badge>}
                  </div>
                  {item.spec && <p className="text-muted-foreground text-xs">{item.spec}</p>}
                  {item.description && (
                    <p className="text-muted-foreground line-clamp-2 text-xs">{item.description}</p>
                  )}
                  {item.media.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setDetail(item)}
                      className="mt-1 inline-flex items-center gap-1 text-left text-xs font-medium text-primary"
                    >
                      <Images className="size-3.5" /> Ver {item.media.length} fotos e vídeos
                    </button>
                  )}
                  {catalog.showPrices && (
                    <p className="mt-2 text-xs font-medium text-muted-foreground">
                      Preço de atacado · pedido mínimo de {item.minQuantity} {item.minQuantity === 1 ? "unidade" : "unidades"}
                    </p>
                  )}
                  <div className="mt-auto flex items-center justify-between pt-3">
                    {priceInAllCurrencies(item) ?? (
                      <span className="font-display text-lg font-semibold">{price(item)}</span>
                    )}
                    {catalog.showAvailability && (
                      <Badge
                        variant="outline"
                        className={item.available
                          ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
                          : "border-red-500/40 bg-red-500/15 text-red-400"}
                      >
                        {item.available ? "disponível" : "indisponível"}
                      </Badge>
                    )}
                  </div>
                  {item.infoGroupUrl && (
                    <Button className="mt-2" variant="outline" asChild>
                      <a href={item.infoGroupUrl} target="_blank" rel="noreferrer">
                        <MessageCircle className="mr-2 size-4" /> Grupo de informações
                      </a>
                    </Button>
                  )}
                  {!!item.sellers.length && (
                    <Button className="mt-2" variant="outline" onClick={() => setSellerItem(item)}>
                      Fazer pedido
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}

        {catalog.about && (
          <section className="mt-12 rounded-lg border p-5">
            <h2 className="mb-2 text-lg font-semibold">Sobre</h2>
            <p className="text-muted-foreground text-sm whitespace-pre-line">{catalog.about}</p>
          </section>
        )}
      </div>

        </div>
      </div>

      <footer className="text-muted-foreground border-t px-5 py-8 text-center text-xs">
        <div className="mb-2 space-x-3">
          {catalog.contactPhone && <span>{catalog.contactPhone}</span>}
          {catalog.contactEmail && <span>{catalog.contactEmail}</span>}
          {catalog.contactAddress && <span>{catalog.contactAddress}</span>}
        </div>
        OS® — o mundo inteiro na palma da sua mão.
      </footer>

      {/* detalhe do produto */}
      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="sm:max-w-lg">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>{detail.name}</DialogTitle>
                <DialogDescription>{detail.group}</DialogDescription>
              </DialogHeader>
              <ProductMediaCarousel item={detail} />
              {detail.spec && <p className="text-muted-foreground text-sm">{detail.spec}</p>}
              {detail.description && <p className="text-sm">{detail.description}</p>}
              {catalog.showPrices && (
                <p className="text-xs font-medium text-muted-foreground">
                  Preço de atacado · pedido mínimo de {detail.minQuantity} {detail.minQuantity === 1 ? "unidade" : "unidades"}
                </p>
              )}
              {priceInAllCurrencies(detail) ?? (
                <p className="font-display text-2xl font-semibold">{price(detail)}</p>
              )}
              {catalog.installmentsEnabled && catalog.showPrices && detail.price ? (
                <p className="text-muted-foreground text-xs">
                  até {catalog.installmentsMax}x de{" "}
                  <CurrencyValues
                    convert={convert}
                    value={detail.price / catalog.installmentsMax}
                    currency={detail.currency}
                    layout="inline"
                  />
                </p>
              ) : null}
              <DialogFooter className="flex-wrap sm:justify-between">
                <div className="flex flex-wrap gap-2">
                  {detail.infoGroupUrl && (
                    <Button variant="outline" asChild>
                      <a href={detail.infoGroupUrl} target="_blank" rel="noreferrer">
                        <MessageCircle className="mr-2 size-4" /> Grupo de informações
                      </a>
                    </Button>
                  )}
                  {!!detail.sellers.length && (
                    <Button variant="outline" onClick={() => setSellerItem(detail)}>
                      Escolher vendedor
                    </Button>
                  )}
                </div>
                {catalog.ordersEnabled ? (
                  <Button
                    disabled={!detail.available}
                    onClick={() => {
                      startOrder(detail);
                      setDetail(null);
                    }}
                  >
                    Fazer pedido
                  </Button>
                ) : (
                  whats && (
                    <Button asChild>
                      <a
                        href={`https://wa.me/${whats}?text=${encodeURIComponent(`Olá! Quero saber sobre: ${detail.name}`)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {catalog.consultLabel}
                      </a>
                    </Button>
                  )
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!sellerItem} onOpenChange={(open) => !open && setSellerItem(null)}>
        <DialogContent className="flex h-[min(720px,88dvh)] w-[calc(100vw-24px)] max-w-[520px] flex-col overflow-hidden p-0">
          <DialogHeader className="shrink-0 px-4 pt-4 sm:px-6 sm:pt-6">
            <DialogTitle>Escolha o vendedor</DialogTitle>
            <DialogDescription>
              Selecione com quem deseja falar sobre {sellerItem?.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-scroll overscroll-contain px-4 pb-5 [scrollbar-gutter:stable] sm:px-6">
            {sellerItem?.sellers.map((seller) => {
              const phone = seller.phone?.replace(/\D/g, "") ?? "";
              const message = `Olá, ${seller.name}! Quero comprar o produto ${sellerItem.name} que vi no catálogo ${catalog.title}.`;
              return (
                <div key={seller.id} className="flex min-w-0 items-center gap-2 rounded-lg border p-2.5 sm:p-3">
                  <Button
                    type="button"
                    variant={preferredSellerId === seller.id ? "secondary" : "ghost"}
                    className="h-auto min-w-0 flex-1 justify-start whitespace-normal p-2"
                    onClick={() => {
                      setPreferredSellerId(seller.id);
                      if (sellerItem) startOrder(sellerItem);
                      setSellerItem(null);
                    }}
                  >
                    <span className="text-left">
                      <span className="block font-medium">{seller.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {seller.region}
                      </span>
                      <span className="mt-1 block text-[11px] text-muted-foreground/75">
                        Selecionar para esta solicitação
                      </span>
                    </span>
                  </Button>
                  {phone && (
                    <Button type="button" size="icon" variant="outline" asChild>
                      <a
                        href={`https://wa.me/${phone}?text=${encodeURIComponent(message)}`}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Falar com ${seller.name} no WhatsApp`}
                      >
                        <ExternalLink className="size-4" />
                      </a>
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* carrinho */}
      <Dialog open={cartOpen} onOpenChange={setCartOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Seu carrinho</DialogTitle>
            <DialogDescription>Revise os itens antes de enviar o pedido.</DialogDescription>
          </DialogHeader>
          {lines.length === 0 ? (
            <p className="text-muted-foreground text-sm">Seu carrinho está vazio.</p>
          ) : (
            <div className="space-y-3">
              {lines.map(({ line, item }) => (
                <div key={item.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {catalog.showPrices && item.price !== null ? (
                        <CurrencyValues
                          convert={convert}
                          value={item.price}
                          currency={item.currency}
                          layout="inline"
                        />
                      ) : (
                        catalog.consultLabel
                      )}
                      {item.unit ? ` · ${item.unit}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label="Diminuir"
                      disabled={line.quantity <= item.minQuantity}
                      onClick={() => setQty(item.id, line.quantity - 1)}
                    >
                      <Minus className="size-3" />
                    </Button>
                    <Input
                      className="w-20 text-center"
                      inputMode="decimal"
                      value={line.quantity}
                      min={item.minQuantity}
                      onChange={(e) => {
                        const raw = Number(e.target.value.replace(",", "."));
                        if (!Number.isFinite(raw)) return;
                        const q = allowsDecimal(item.unit) ? raw : Math.round(raw);
                        setQty(item.id, item.stock > 0 ? Math.min(q, item.stock) : q);
                      }}
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label="Aumentar"
                      onClick={() =>
                        setQty(
                          item.id,
                          item.stock > 0
                            ? Math.min(line.quantity + 1, item.stock)
                            : line.quantity + 1,
                        )
                      }
                    >
                      <Plus className="size-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Remover"
                      onClick={() => setQty(item.id, 0)}
                    >
                      <Trash2 className="text-destructive size-3" />
                    </Button>
                  </div>
                </div>
              ))}
              {catalog.showPrices && (
                <p className="text-right text-sm">
                  Subtotal:{" "}
                  <strong className="font-display text-lg">
                    <CurrencyValues
                      convert={convert}
                      value={subtotal}
                      currency={catalog.currency}
                    />
                  </strong>
                </p>
              )}
              {catalog.deliveryEnabled && (
                <div className="rounded-lg border bg-muted/20 p-3">
                  <div className="flex items-center gap-2 font-medium">
                    <Calculator className="size-4" /> Calcule seu frete
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    O valor usa a regra de frete cadastrada em cada produto.
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <Input
                      value={freightCity}
                      placeholder="Cidade de entrega"
                      aria-label="Cidade de entrega"
                      onChange={(e) => {
                        setFreightCity(e.target.value);
                        setFreightQuote(null);
                      }}
                    />
                    <Select
                      value={freightState}
                      onValueChange={(value) => {
                        setFreightState(value);
                        setFreightQuote(null);
                      }}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Destino da entrega" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PY">Paraguai</SelectItem>
                        {BRAZIL_STATES.map((state) => (
                          <SelectItem key={state} value={state}>
                            {state}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={freightLoading || !minimumMet}
                      onClick={() => void calculateFreight()}
                    >
                      {freightLoading ? "Calculando..." : "Calcular"}
                    </Button>
                  </div>
                  {freightQuote && (
                    <div className="mt-3 rounded-md bg-background p-3 text-sm">
                      <div className="flex justify-between gap-3">
                        <span>Frete ({freightQuote.percentage}%)</span>
                        <strong>
                          <CurrencyValues
                            convert={convert}
                            value={freightQuote.amount}
                            currency={freightQuote.currency}
                          />
                        </strong>
                      </div>
                      {catalog.showPrices && (
                        <div className="mt-1 flex justify-between gap-3">
                          <span>Total estimado</span>
                          <strong>
                            <CurrencyValues
                              convert={convert}
                              value={subtotal + freightQuote.amount}
                              currency={catalog.currency}
                            />
                          </strong>
                        </div>
                      )}
                    </div>
                  )}
                  {freightError && <p className="mt-2 text-xs text-destructive">{freightError}</p>}
                </div>
              )}
              {!minimumMet && (
                <p className="text-sm font-medium text-amber-700">
                  Pedido mínimo: {CATALOG_MINIMUM_UNITS} unidades. Faltam{" "}
                  {Math.max(0, CATALOG_MINIMUM_UNITS - cartCount)}.
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCartOpen(false)}>
              Continuar comprando
            </Button>
            <Button
              disabled={lines.length === 0 || !minimumMet}
              onClick={() => {
                setCartOpen(false);
                setCheckout(true);
              }}
            >
              Enviar solicitação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CheckoutDialog
        open={checkout}
        onOpenChange={setCheckout}
        catalog={catalog}
        lines={lines}
        subtotal={subtotal}
        initialState={freightState}
        initialFreight={freightQuote}
        preferredSellerId={preferredSellerId}
        onDone={() => setCart([])}
      />
    </main>
  );
}

type Step = "cliente" | "entrega" | "pagamento" | "revisao";
const STEPS: { key: Step; label: string }[] = [
  { key: "cliente", label: "Cliente" },
  { key: "entrega", label: "Entrega" },
  { key: "pagamento", label: "Pagamento" },
  { key: "revisao", label: "Revisão" },
];

function CheckoutDialog({
  open,
  onOpenChange,
  catalog,
  lines,
  subtotal,
  initialState,
  initialFreight,
  preferredSellerId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  catalog: PublicCatalog;
  lines: { line: CartLine; item: PublicCatalogItem }[];
  subtotal: number;
  initialState: string;
  initialFreight: CatalogFreightQuote | null;
  preferredSellerId: string | null;
  onDone: () => void;
}) {
  const submit = useServerFn(submitCatalogOrder);
  const quoteFreight = useServerFn(quoteCatalogFreight);
  const [step, setStep] = useState<Step>("cliente");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ number: number; total: number } | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(makeKey);
  const [shippingQuote, setShippingQuote] = useState<CatalogFreightQuote | null>(initialFreight);
  const [quoting, setQuoting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    document: "",
    city: "",
    state: initialState,
    address: "",
    mode: catalog.deliveryEnabled && !catalog.pickupEnabled ? "entrega" : "retirada",
    region: "",
    payment_method: catalog.paymentMethods[0] ?? "",
    installments: "1",
    notes: "",
    sellerId: preferredSellerId ?? "",
  });

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    if (!open) return;
    if (initialState) setForm((current) => ({ ...current, state: initialState }));
    if (preferredSellerId) setForm((current) => ({ ...current, sellerId: preferredSellerId }));
    setShippingQuote(initialFreight);
  }, [open, initialState, initialFreight, preferredSellerId]);

  const sellers = useMemo(() => {
    const byId = new Map<string, PublicCatalogItem["sellers"][number]>();
    for (const { item } of lines) for (const seller of item.sellers) byId.set(seller.id, seller);
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [lines]);

  async function calculateCheckoutFreight() {
    if (!form.state) return setError("Escolha o estado de entrega.");
    setQuoting(true);
    setError(null);
    try {
      const result = await quoteFreight({
        data: {
          slug: catalog.slug,
          state: form.state,
          items: lines.map((entry) => ({
            item_id: entry.item.id,
            quantity: entry.line.quantity,
          })),
        },
      });
      setShippingQuote(result);
    } catch (quoteError) {
      setError(
        quoteError instanceof Error ? quoteError.message : "Não foi possível calcular o frete.",
      );
    } finally {
      setQuoting(false);
    }
  }

  const shipping = useMemo(() => {
    if (form.mode !== "entrega") return 0;
    return shippingQuote?.amount ?? 0;
  }, [form.mode, shippingQuote]);

  const total = subtotal + shipping;

  function next() {
    setError(null);
    if (step === "cliente") {
      if (form.name.trim().length < 2) return setError("Informe seu nome.");
      if (catalog.requireIdentification && !form.phone.trim() && !form.email.trim())
        return setError("Informe telefone ou e-mail.");
      if (!form.phone.trim() && !form.email.trim())
        return setError("Informe telefone ou e-mail para contato.");
      return setStep("entrega");
    }
    if (step === "entrega") {
      if (form.mode === "entrega" && !form.address.trim())
        return setError("Informe o endereço de entrega.");
      if (form.mode === "entrega" && !form.state) return setError("Escolha o estado de entrega.");
      if (form.mode === "entrega" && !shippingQuote)
        return setError("Calcule o frete antes de continuar.");
      return setStep("pagamento");
    }
    if (step === "pagamento") return setStep("revisao");
  }

  async function confirm() {
    setSaving(true);
    setError(null);
    try {
      const result = await submit({
        data: {
          slug: catalog.slug,
          idempotencyKey,
          sellerId:
            form.sellerId && form.sellerId !== "qualquer" && form.sellerId !== "sem-vendedor"
              ? form.sellerId
              : null,
          customer: {
            name: form.name.trim(),
            phone: form.phone.trim() || null,
            email: form.email.trim() || "",
            document: form.document.trim() || null,
            city: form.city.trim() || null,
            state: form.state.trim() || null,
            country: form.state === "PY" ? "Paraguai" : "Brasil",
            address: form.address.trim() || null,
          },
          delivery: {
            mode: form.mode as "retirada" | "entrega",
            state: form.state || null,
            region: form.region || null,
            address: form.address.trim() || null,
            payment_method: form.payment_method || null,
            installments: Number(form.installments) || 1,
          },
          notes: form.notes.trim() || null,
          items: lines.map((l) => ({ item_id: l.item.id, quantity: l.line.quantity })),
        },
      });
      setDone({ number: result.number, total: result.total });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível enviar o pedido.");
    } finally {
      setSaving(false);
    }
  }

  const selectedSeller = sellers.find((seller) => seller.id === form.sellerId);
  function downloadOrderPdf() {
    if (!done) return;
    const doc = new jsPDF();
    doc.setFillColor(4, 16, 22);
    doc.rect(0, 0, 210, 42, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("OS", 16, 17);
    doc.setFontSize(14);
    doc.text("PEDIDO " + String(done.number), 16, 29);
    doc.setDrawColor(20, 190, 135);
    doc.setLineWidth(1.5);
    doc.line(16, 36, 105, 36);
    doc.setDrawColor(230, 20, 95);
    doc.line(105, 36, 194, 36);
    doc.setTextColor(25, 32, 36);
    doc.setFontSize(11);
    doc.text("Cliente", 16, 54);
    doc.setFont("helvetica", "normal");
    doc.text(form.name || "-", 16, 62);
    doc.text("Telefone: " + (form.phone || "-"), 16, 69);
    doc.text("Cidade/UF: " + ([form.city, form.state].filter(Boolean).join(" / ") || "-"), 16, 76);
    doc.text("Vendedor: " + (form.sellerId === "qualquer" ? "Qualquer vendedor" : form.sellerId === "sem-vendedor" || !form.sellerId ? "Sem vendedor" : selectedSeller?.name || "-"), 16, 83);
    doc.setFont("helvetica", "bold");
    doc.text("Itens", 16, 96);
    let y = 105;
    doc.setFont("helvetica", "normal");
    for (const { line, item } of lines) {
      const unit = item.price ?? 0;
      doc.text(item.name, 16, y);
      doc.text(String(line.quantity) + " x " + formatMoney(unit, catalog.currency), 105, y);
      doc.text(formatMoney(unit * line.quantity, catalog.currency), 194, y, { align: "right" });
      y += 8;
      if (y > 250) { doc.addPage(); y = 20; }
    }
    doc.setDrawColor(210, 215, 218);
    doc.line(16, y + 2, 194, y + 2);
    doc.setFont("helvetica", "bold");
    doc.text("Subtotal", 16, y + 12);
    doc.text(formatMoney(subtotal, catalog.currency), 194, y + 12, { align: "right" });
    doc.text("Frete", 16, y + 20);
    doc.text(formatMoney(shipping, catalog.currency), 194, y + 20, { align: "right" });
    doc.setFontSize(15);
    doc.text("TOTAL", 16, y + 31);
    doc.text(formatMoney(done.total, catalog.currency), 194, y + 31, { align: "right" });
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 110, 116);
    doc.text("Documento gerado pelo Sistema Integral", 16, 285);
    doc.save(`pedido-${done.number}.pdf`);
  }
  const whats = (selectedSeller?.phone ?? catalog.whatsapp ?? catalog.contactPhone)?.replace(
    /\D/g,
    "",
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v && done) {
          setDone(null);
          setStep("cliente");
          setIdempotencyKey(makeKey());
        }
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {done ? (
          <>
            <DialogHeader>
              <DialogTitle>Solicitação nº {done.number} recebida</DialogTitle>
              <DialogDescription>
                {catalog.successMessage ??
                  "Recebemos seu pedido. Nossa equipe entrará em contato para confirmar."}
              </DialogDescription>
            </DialogHeader>
            {catalog.showPrices && (
              <p className="text-sm">
                Total estimado:{" "}
                <strong>
                  <CurrencyValues
                    convert={convert}
                    value={done.total}
                    currency={catalog.currency}
                    layout="inline"
                  />
                </strong>
              </p>
            )}
            <p className="text-muted-foreground text-sm">
              {form.mode === "retirada"
                ? `Retirada${catalog.pickupAddress ? ` em ${catalog.pickupAddress}` : ""}.`
                : "Entrega combinada após a confirmação."}
            </p>
            <DialogFooter className="flex-wrap">
              <Button variant="outline" onClick={downloadOrderPdf}>Baixar pedido em PDF</Button>
              {whats && (
                <Button variant="outline" asChild>
                  <a
                    href={`https://wa.me/${whats}?text=${encodeURIComponent(`Olá! Enviei a solicitação nº ${done.number} pelo catálogo.`)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Falar no WhatsApp
                  </a>
                </Button>
              )}
              <Button onClick={() => onOpenChange(false)}>Fechar</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Enviar solicitação</DialogTitle>
              <DialogDescription>
                {STEPS.map((s, i) => `${i + 1}. ${s.label}`).join("  →  ")}
              </DialogDescription>
            </DialogHeader>

            {step === "cliente" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label>Nome completo</Label>
                  <Input value={form.name} onChange={(e) => set({ name: e.target.value })} />
                </div>
                <div>
                  <Label>Telefone / WhatsApp</Label>
                  <Input value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
                </div>
                <div>
                  <Label>E-mail</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => set({ email: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Documento (opcional)</Label>
                  <Input
                    value={form.document}
                    onChange={(e) => set({ document: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Cidade</Label>
                  <Input value={form.city} onChange={(e) => set({ city: e.target.value })} />
                </div>
                {sellers.length > 0 && (
                  <div className="sm:col-span-2">
                    <Label>Vendedor responsável</Label>
                    <Select value={form.sellerId} onValueChange={(sellerId) => set({ sellerId })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Escolha com quem deseja comprar" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="qualquer">Qualquer vendedor</SelectItem>
                        <SelectItem value="sem-vendedor">Sem vendedor</SelectItem>
                        {sellers.map((seller) => (
                          <SelectItem key={seller.id} value={seller.id}>
                            {seller.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            {step === "entrega" && (
              <div className="grid gap-3">
                <div>
                  <Label>Como quer receber?</Label>
                  <Select value={form.mode} onValueChange={(v) => set({ mode: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {catalog.pickupEnabled && <SelectItem value="retirada">Retirar</SelectItem>}
                      {catalog.deliveryEnabled && <SelectItem value="entrega">Entrega</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
                {form.mode === "retirada" && catalog.pickupAddress && (
                  <p className="text-muted-foreground text-sm">
                    Retirada em {catalog.pickupAddress}.
                  </p>
                )}
                {form.mode === "entrega" && (
                  <>
                    <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                      <div>
                        <Label>Destino da entrega</Label>
                        <Select
                          value={form.state}
                          onValueChange={(value) => {
                            set({ state: value });
                            setShippingQuote(null);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Escolha o destino" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="PY">Paraguai</SelectItem>
                            {BRAZIL_STATES.map((state) => (
                              <SelectItem key={state} value={state}>
                                {state}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={quoting || !form.state}
                        onClick={() => void calculateCheckoutFreight()}
                      >
                        <Calculator className="mr-2 size-4" />
                        {quoting ? "Calculando..." : "Calcular frete"}
                      </Button>
                    </div>
                    <div>
                      <Label>Endereço completo</Label>
                      <Textarea
                        rows={2}
                        value={form.address}
                        onChange={(e) => set({ address: e.target.value })}
                      />
                    </div>
                    {shippingQuote ? (
                      <p className="rounded-md bg-muted p-3 text-sm">
                        Frete de {shippingQuote.percentage}%:{" "}
                        <strong>
                          <CurrencyValues
                            convert={convert}
                            value={shipping}
                            currency={shippingQuote.currency}
                            layout="inline"
                          />
                        </strong>
                        {catalog.shippingDays ? ` · prazo ${catalog.shippingDays} dia(s)` : ""}
                      </p>
                    ) : (
                      <p className="text-muted-foreground text-sm">
                        Escolha o estado para calcular o frete.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {step === "pagamento" && (
              <div className="grid gap-3">
                {catalog.paymentMethods.length > 0 ? (
                  <div>
                    <Label>Forma de pagamento</Label>
                    <Select
                      value={form.payment_method}
                      onValueChange={(v) => set({ payment_method: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Escolha" />
                      </SelectTrigger>
                      <SelectContent>
                        {catalog.paymentMethods.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    O pagamento é combinado com a equipe após a confirmação.
                  </p>
                )}
                {catalog.installmentsEnabled && catalog.showPrices && (
                  <div>
                    <Label>Parcelas (simulação)</Label>
                    <Select
                      value={form.installments}
                      onValueChange={(v) => set({ installments: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: catalog.installmentsMax }, (_, i) => i + 1).map(
                          (n) => (
                            <SelectItem key={n} value={String(n)}>
                              {n}x de{" "}
                              {rates
                                .allCurrencies(total / n, catalog.currency)
                                .map((item) => item.text)
                                .join(" · ")}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <Label>Observações</Label>
                  <Textarea
                    rows={2}
                    value={form.notes}
                    onChange={(e) => set({ notes: e.target.value })}
                  />
                </div>
              </div>
            )}

            {step === "revisao" && (
              <div className="space-y-3 text-sm">
                <div className="rounded-lg border p-3">
                  <p className="font-medium">{form.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {[form.phone, form.email, form.city].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {form.sellerId && (
                  <p className="text-muted-foreground">
                    Vendedor: <strong className="text-foreground">{selectedSeller?.name}</strong>
                  </p>
                )}
                <div className="rounded-lg border p-3">
                  {lines.map(({ line, item }) => (
                    <div key={item.id} className="flex justify-between gap-3">
                      <span className="truncate">
                        {line.quantity}× {item.name}
                      </span>
                      {catalog.showPrices && item.price !== null && (
                        <CurrencyValues
                          convert={convert}
                          value={item.price * line.quantity}
                          currency={item.currency}
                        />
                      )}
                    </div>
                  ))}
                  {catalog.showPrices && (
                    <>
                      <div className="mt-2 flex justify-between border-t pt-2">
                        <span>Frete</span>
                        <CurrencyValues
                          convert={convert}
                          value={shipping}
                          currency={catalog.currency}
                        />
                      </div>
                      <div className="flex justify-between font-semibold">
                        <span>Total</span>
                        <CurrencyValues
                          convert={convert}
                          value={total}
                          currency={catalog.currency}
                          emphasize
                        />
                      </div>
                    </>
                  )}
                </div>
                <p className="text-muted-foreground text-xs">
                  {form.mode === "retirada" ? "Retirada no local" : `Entrega: ${form.address}`}
                  {form.payment_method ? ` · ${form.payment_method}` : ""}
                </p>
              </div>
            )}

            {error && <p className="text-destructive text-sm">{error}</p>}

            <DialogFooter>
              {step !== "cliente" && (
                <Button
                  variant="outline"
                  onClick={() => {
                    const i = STEPS.findIndex((s) => s.key === step);
                    setStep(STEPS[i - 1]!.key);
                  }}
                >
                  Voltar
                </Button>
              )}
              {step === "revisao" ? (
                <Button onClick={confirm} disabled={saving}>
                  {saving ? "Enviando…" : "Enviar solicitação"}
                </Button>
              ) : (
                <Button onClick={next}>Continuar</Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
