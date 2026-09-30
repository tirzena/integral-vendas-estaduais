/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Check, ExternalLink, Loader2, MapPinned, Search } from "lucide-react";
import { toast } from "sonner";
import "leaflet/dist/leaflet.css";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProductScope } from "@/hooks/useProductScope";
import { useCurrentUser } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/contatos_/mapa")({
  head: () => ({ meta: [{ title: "Buscar empresas no mapa — OS" }] }),
  component: AdvancedContactSearch,
});

type Place = {
  id: string;
  position: number;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  rating: number | null;
  ratingCount: number | null;
  category: string | null;
  phone: string | null;
  website: string | null;
  description?: string | null;
  types?: string[];
  openingHours?: any;
  duplicateCustomerId?: string | null;
  details?: any;
};

function PlacesMap({
  places,
  selected,
  onSelect,
}: {
  places: Place[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  useEffect(() => {
    let disposed = false;
    void import("leaflet").then((L) => {
      if (disposed || !host.current) return;
      if (!mapRef.current) {
        mapRef.current = L.map(host.current, { zoomControl: true }).setView(
          [-25.5163, -54.5854],
          12,
        );
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(mapRef.current);
      }
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      if (!places.length) return;
      const bounds: [number, number][] = [];
      for (const place of places) {
        bounds.push([place.latitude, place.longitude]);
        const active = selected === place.id;
        const icon = L.divIcon({
          className: "",
          html: `<div style="width:${active ? 38 : 32}px;height:${active ? 38 : 32}px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${active ? "#7c3aed" : "#2563eb"};border:3px solid white;box-shadow:0 2px 8px #0005"><span style="display:flex;transform:rotate(45deg);width:100%;height:100%;align-items:center;justify-content:center;color:white;font-weight:700;font-size:11px">${place.position}</span></div>`,
          iconSize: [active ? 38 : 32, active ? 38 : 32],
          iconAnchor: [16, 32],
        });
        const marker = L.marker([place.latitude, place.longitude], { icon })
          .addTo(mapRef.current)
          .bindTooltip(place.name, { direction: "top" })
          .on("click", () => onSelect(place.id));
        markersRef.current.push(marker);
      }
      mapRef.current.fitBounds(bounds, { padding: [35, 35], maxZoom: 15 });
    });
    return () => {
      disposed = true;
    };
  }, [places, selected, onSelect]);

  useEffect(
    () => () => {
      mapRef.current?.remove();
      mapRef.current = null;
    },
    [],
  );

  return (
    <div
      ref={host}
      className="h-[520px] w-full rounded-xl"
      aria-label="Mapa das empresas encontradas"
    />
  );
}

function AdvancedContactSearch() {
  const { productId, products, loading: productsLoading } = useProductScope();
  const { userId } = useCurrentUser();
  const [crmProductId, setCrmProductId] = useState(productId === "todos" ? "" : productId);
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (crmProductId) return;
    if (productId !== "todos") {
      setCrmProductId(productId);
      return;
    }
    if (products.length === 1 && products[0]) setCrmProductId(products[0].id);
  }, [crmProductId, productId, products]);

  const current = places.find((place) => place.id === selected) ?? null;
  const digits = (value?: string | null) => String(value ?? "").replace(/\D/g, "");
  const norm = (value?: string | null) =>
    String(value ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\W/g, "");

  async function selectPlace(id: string) {
    setSelected(id);
    const place = places.find((item) => item.id === id);
    if (!place || place.details) return;
    setDetailLoading(true);
    const { data } = await supabase.functions.invoke("serper-places", {
      body: { action: "details", name: place.name, address: place.address },
    });
    setDetailLoading(false);
    if (data?.details)
      setPlaces((old) =>
        old.map((item) =>
          item.id === id
            ? {
                ...item,
                details: data.details,
                website: item.website ?? data.details.website,
                description: item.description ?? data.details.description,
              }
            : item,
        ),
      );
  }

  async function searchPlaces(event: React.FormEvent) {
    event.preventDefault();
    if (query.trim().length < 3) return void toast.error("Informe o tipo de empresa e a cidade.");
    const value = query.trim();
    const more = value === searched && places.length > 0;
    const nextPage = more ? page + 1 : 1;
    setLoading(true);
    const [{ data, error }, { data: customers }] = await Promise.all([
      supabase.functions.invoke("serper-places", { body: { query: value, page: nextPage } }),
      supabase.from("customers").select("id,name,trade_name,phone,whatsapp").is("deleted_at", null),
    ]);
    setLoading(false);
    if (error || !data?.ok)
      return void toast.error(data?.error ?? "Não foi possível fazer a busca.");
    const marked = (data.places ?? []).map((place: Place) => ({
      ...place,
      duplicateCustomerId:
        (customers ?? []).find(
          (customer: any) =>
            (digits(place.phone) &&
              [digits(customer.phone), digits(customer.whatsapp)].includes(digits(place.phone))) ||
            norm(customer.name) === norm(place.name) ||
            norm(customer.trade_name) === norm(place.name),
        )?.id ?? null,
    }));
    setPlaces((old) =>
      more
        ? [...old, ...marked.filter((place: Place) => !old.some((item) => item.id === place.id))]
        : marked,
    );
    setSearched(value);
    setPage(nextPage);
    setHasMore(data.hasMore !== false);
    if (!more) {
      setChosen(new Set());
      setSelected(marked[0]?.id ?? null);
    }
    if (!data.places?.length) toast.info("Nenhuma empresa com localização foi encontrada.");
  }

  async function importSelected() {
    if (!crmProductId) return void toast.error("Selecione a categoria do CRM antes de importar.");
    const rows = places.filter((place) => chosen.has(place.id) && !place.duplicateCustomerId);
    if (!rows.length) return;
    setLoading(true);
    const { data: pipeline } = await supabase
      .from("pipelines")
      .select("id")
      .eq("product_id", crmProductId)
      .eq("is_default", true)
      .maybeSingle();
    const { data: stage } = pipeline
      ? await supabase
          .from("pipeline_stages")
          .select("id")
          .eq("pipeline_id", pipeline.id)
          .order("position")
          .limit(1)
          .maybeSingle()
      : { data: null };
    let imported = 0;
    for (const place of rows) {
      const social = (place.details?.socialLinks ?? []).map((item: any) => item.url).join("\n");
      const notes = [
        place.website ? `Site: ${place.website}` : "",
        social ? `Redes sociais:\n${social}` : "",
        place.description ?? "",
      ]
        .filter(Boolean)
        .join("\n\n");
      const { data: customer, error } = await supabase
        .from("customers")
        .insert({
          name: place.name,
          trade_name: place.name,
          phone: place.phone,
          whatsapp: place.phone,
          address: place.address,
          origin: "Busca avançada no Google",
          status: "lead",
          ...(userId ? { created_by: userId } : {}),
          notes: notes || null,
        })
        .select("id")
        .single();
      if (error || !customer) continue;
      const { error: opportunityError } = await supabase.from("customer_products").insert({
        customer_id: customer.id,
        product_id: crmProductId,
        pipeline_id: pipeline?.id ?? null,
        stage_id: stage?.id ?? null,
        commercial_status: "lead",
        lead_origin: "Busca avançada no Google",
        channel: "google",
        notes: notes || null,
      });
      if (!opportunityError) imported += 1;
    }
    setLoading(false);
    setChosen(new Set());
    toast.success(`${imported} empresa(s) importada(s) para o CRM.`);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Buscar empresas no mapa"
        description="Pesquise um nicho e uma cidade para encontrar empresas e seus dados públicos."
        actions={
          <Button variant="outline" asChild>
            <Link to="/contatos">
              <ArrowLeft className="mr-2 size-4" /> Listas de contatos
            </Link>
          </Button>
        }
      />
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={searchPlaces} className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
                placeholder="Ex.: escritórios de contabilidade em Curitiba"
                maxLength={180}
              />
            </div>
            <Button type="submit" disabled={loading || query.trim().length < 3}>
              {loading ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <MapPinned className="mr-2 size-4" />
              )}
              {query.trim() === searched && places.length ? "Buscar mais" : "Buscar no mapa"}
            </Button>
          </form>
        </CardContent>
      </Card>
      {!places.length ? (
        <EmptyState
          title="Faça uma busca"
          description="Informe o tipo de empresa e a cidade para ver os resultados no mapa."
        />
      ) : (
        <>
          <div className="mb-3 flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-end">
            <span className="pb-2 text-sm font-medium sm:mr-auto">
              {chosen.size} selecionada(s)
            </span>
            <div className="w-full space-y-1.5 sm:w-[260px]">
              <Label htmlFor="crm-category">Categoria do CRM</Label>
              <Select
                value={crmProductId}
                onValueChange={setCrmProductId}
                disabled={productsLoading || products.length === 0}
              >
                <SelectTrigger id="crm-category">
                  <SelectValue placeholder="Selecione a categoria" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                As empresas selecionadas serão importadas para esta categoria.
              </p>
            </div>
            <Button
              disabled={!chosen.size || !crmProductId || loading}
              onClick={() => void importSelected()}
            >
              <Check className="mr-2 size-4" />
              Importar no CRM
            </Button>
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <PlacesMap
                  places={places}
                  selected={selected}
                  onSelect={(id) => void selectPlace(id)}
                />
              </CardContent>
            </Card>
            <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
              {places.map((place) => (
                <button
                  key={place.id}
                  type="button"
                  onClick={() => void selectPlace(place.id)}
                  className={`w-full rounded-xl border p-4 text-left transition-colors ${selected === place.id ? "border-primary bg-primary/5" : "bg-card hover:bg-muted/50"}`}
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={chosen.has(place.id)}
                      disabled={!!place.duplicateCustomerId}
                      onClick={(e) => e.stopPropagation()}
                      onCheckedChange={(checked) =>
                        setChosen((old) => {
                          const next = new Set(old);
                          if (checked) next.add(place.id);
                          else next.delete(place.id);
                          return next;
                        })
                      }
                    />
                    <Badge className="shrink-0">{place.position}</Badge>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{place.name}</p>
                      {place.duplicateCustomerId && (
                        <Badge variant="secondary" className="mt-1">
                          Já está no CRM
                        </Badge>
                      )}
                      {place.category && (
                        <p className="text-xs text-muted-foreground">{place.category}</p>
                      )}
                      {place.address && <p className="mt-2 text-sm">{place.address}</p>}
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {place.rating !== null && (
                          <span>
                            ★ {place.rating}
                            {place.ratingCount !== null ? ` (${place.ratingCount})` : ""}
                          </span>
                        )}
                        {place.phone && <span>{place.phone}</span>}
                        {place.website && (
                          <a
                            href={place.website}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center text-primary hover:underline"
                          >
                            Site <ExternalLink className="ml-1 size-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
          {current && (
            <Card className="mt-4">
              <CardContent className="space-y-3 pt-6">
                <h2 className="text-lg font-semibold">{current.name}</h2>
                {detailLoading ? (
                  <p className="text-sm">
                    <Loader2 className="mr-2 inline size-4 animate-spin" />
                    Buscando mais informações…
                  </p>
                ) : (
                  <>
                    <p className="text-sm">
                      {current.description ??
                        current.details?.description ??
                        "Descrição não encontrada."}
                    </p>
                    <div className="grid gap-2 text-sm sm:grid-cols-2">
                      <p>
                        <b>Endereço:</b> {current.address ?? "Não informado"}
                      </p>
                      <p>
                        <b>Telefone:</b> {current.phone ?? "Não informado"}
                      </p>
                      <p>
                        <b>Categoria:</b>{" "}
                        {current.types?.join(", ") ?? current.category ?? "Não informada"}
                      </p>
                      <p>
                        <b>Avaliação:</b> {current.rating ?? "Não informada"}{" "}
                        {current.ratingCount ? `(${current.ratingCount})` : ""}
                      </p>
                    </div>
                    {(current.website || current.details?.website) && (
                      <a
                        href={current.website || current.details.website}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center text-primary underline"
                      >
                        Abrir site <ExternalLink className="ml-1 size-3" />
                      </a>
                    )}
                    {current.details?.socialLinks?.length > 0 && (
                      <div>
                        <p className="font-medium">Redes sociais</p>
                        <div className="flex flex-wrap gap-2">
                          {current.details.socialLinks.map((social: any) => (
                            <a
                              key={social.url}
                              href={social.url}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded border px-2 py-1 text-sm text-primary"
                            >
                              {social.title}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                    {Object.entries(current.details?.attributes ?? {}).map(([key, value]) => (
                      <p className="text-sm" key={key}>
                        <b>{key}:</b> {String(value)}
                      </p>
                    ))}
                  </>
                )}
              </CardContent>
            </Card>
          )}
          {hasMore && (
            <div className="mt-4 text-center">
              <Button
                variant="outline"
                disabled={loading}
                onClick={(event) => void searchPlaces(event as any)}
              >
                Buscar mais empresas
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
