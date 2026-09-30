import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { MapPin, PackageCheck, Warehouse, Users } from "lucide-react";
import { brazilStatePaths, brazilStates } from "@/data/brazil-state-map";
import { BRAZIL_REGIONS, matchesTerritory, regionForState, stateCodeFor, type TerritorySelection } from "@/lib/brazil-territory";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type StockLocation = { id: string; name: string; city?: string | null; state?: string | null; country?: string | null; items?: { id: string; name: string; quantity: number }[] };

/** O mapa usa apenas locais devolvidos ao usuário atual pelo Supabase/RLS. */
export function StateStockMap({ locations, canOpenStock, selection, committedSelection, onSelectionChange, onHoverChange, sellers, people, orders, leaders, summary, onLeaderChange }: {
  locations: StockLocation[]; canOpenStock: boolean;
  selection: TerritorySelection; committedSelection: TerritorySelection;
  onSelectionChange: (selection: TerritorySelection) => void;
  onHoverChange: (selection: TerritorySelection | null) => void;
  sellers: { id: string; full_name: string | null; phone: string | null }[];
  people: { id: string; full_name: string | null; phone: string | null }[];
  orders: { seller_id?: string | null; shipping_state?: string | null; customer_id?: string | null }[];
  leaders: Record<string, string>;
  summary: { orders: number; units: string; created: number; inTransit: number; delivered: number; paid: number; partial: number; awaiting: number; cancelled: number; lost: number; gross: string; cost: string; shipping: string; profit: string; paidAmount: string; remainingAmount: string; inTransitValue: string; deliveredUnpaid: string; currency: string };
  onLeaderChange?: (region: string, userId: string | null) => void;
}) {
  const [regionMode, setRegionMode] = useState(false);
  const byState = useMemo(() => {
    const result = new Map<string, StockLocation[]>();
    for (const location of locations) {
      if (location.country && !["BR", "BRA", "BRASIL", "BRAZIL"].includes(location.country.trim().toUpperCase())) continue;
      const code = stateCodeFor(location.state);
      if (code) result.set(code, [...(result.get(code) ?? []), location]);
    }
    return result;
  }, [locations]);
  const stateLabel = (code: string) => code === "53" ? "Brasília (DF)" : `${brazilStates[code]?.name ?? code} (${brazilStates[code]?.uf ?? code})`;
  const outsideBrazil = locations.filter((location) => location.country && !["BR", "BRA", "BRASIL", "BRAZIL"].includes(location.country.trim().toUpperCase()));
  const selectedLocations = locations.filter((location) =>
    (!location.country || ["BR", "BRA", "BRASIL", "BRAZIL"].includes(location.country.trim().toUpperCase())) &&
    !!stateCodeFor(location.state) && matchesTerritory(location.state, selection));
  const region = selection.mode === "region" ? selection.code : selection.mode === "state" && selection.code ? regionForState(selection.code) : null;
  const title = selection.mode === "state" && selection.code ? stateLabel(selection.code) :
    selection.mode === "region" ? selection.code ?? "Região" : "Brasil";
  const sellerIds = new Set(orders.map((order) => order.seller_id));
  const selectedSellers = sellers.filter((seller) => sellerIds.has(seller.id));
  const leader = people.find((person) => person.id === leaders[region ?? ""]);
  const territoryFor = (code: string): TerritorySelection => regionMode
    ? { mode: "region", code: regionForState(code) ?? undefined } : { mode: "state", code };
  const select = (code: string) => onSelectionChange(territoryFor(code));

  return (
    <section className="integral-territory-grid mb-5" aria-label="Estoque por estado">
      <Card className="integral-map-card min-w-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MapPin className="size-5 text-primary" /> Distribuição por estado e região</CardTitle>
          <p className="text-sm text-muted-foreground">Passe o mouse para uma prévia; clique para manter o território selecionado.</p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button size="sm" variant={committedSelection.mode === "national" ? "default" : "outline"} onClick={() => onSelectionChange({ mode: "national" })}>Ver Brasil todo</Button>
            <Button size="sm" variant={regionMode ? "default" : "outline"} aria-pressed={regionMode}
              onClick={() => { setRegionMode(!regionMode); onSelectionChange({ mode: "national" }); }}>Selecionar por região</Button>
          </div>
          <div className="pt-2">
            <select aria-label={regionMode ? "Escolher região" : "Escolher estado"} className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={regionMode ? committedSelection.mode === "region" ? committedSelection.code ?? "" : "" : committedSelection.mode === "state" ? committedSelection.code ?? "" : ""}
              onChange={(event) => { if (event.target.value) onSelectionChange(regionMode ? { mode: "region", code: event.target.value } : { mode: "state", code: event.target.value }); }}>
              <option value="">{regionMode ? "Escolha uma região" : "Escolha um estado"}</option>
              {regionMode ? Object.keys(BRAZIL_REGIONS).map((name) => <option key={name} value={name}>{name}</option>) :
                Object.keys(brazilStates).sort((a, b) => stateLabel(a).localeCompare(stateLabel(b), "pt-BR")).map((code) =>
                  <option key={code} value={code}>{stateLabel(code)}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap gap-3 pt-2 text-xs text-muted-foreground">
            {Object.entries(BRAZIL_REGIONS).map(([name, config]) => <span key={name} className="flex items-center gap-1"><i className="size-2.5 rounded-full" style={{ background: config.color }} />{name}</span>)}
          </div>
        </CardHeader>
        <CardContent>
          <svg className="integral-brazil-map" viewBox="0 0 575 475" role="group" aria-label="Mapa interativo dos estados brasileiros" onMouseLeave={() => onHoverChange(null)}>
            {brazilStatePaths.map(({ code, path }) => (
              <path
                key={code}
                d={path}
                role="button"
                tabIndex={0}
                aria-label={`${code === "53" ? "Brasília (Distrito Federal)" : brazilStates[code]?.name ?? code}: ${(byState.get(code) ?? []).length} locais de estoque visíveis`}
                aria-pressed={selection.mode === "state" ? selection.code === code : selection.mode === "region" && selection.code === regionForState(code)}
                data-stock={byState.has(code) ? "true" : "false"}
                className={selection.mode === "state" && selection.code === code || selection.mode === "region" && selection.code === regionForState(code) ? "is-selected" : undefined}
                style={{ fill: BRAZIL_REGIONS[regionForState(code)!]?.color, opacity: byState.has(code) ? 1 : 0.5 }}
                onMouseEnter={() => { if (committedSelection.mode === "national") onHoverChange(territoryFor(code)); }}
                onPointerDown={() => select(code)}
                onClick={() => select(code)}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(code); } }}
              />
            ))}
          </svg>
        </CardContent>
      </Card>
      <Card className="integral-map-detail min-w-0">
        <CardHeader>
          <span className="integral-state-mark">{selection.mode === "state" && selection.code ? brazilStates[selection.code]?.uf : selection.mode === "national" ? "BR" : "RG"}</span>
          <CardTitle>{title}</CardTitle>
          <p className="text-sm text-muted-foreground">Informações do território selecionado</p>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-4">
          <div className="integral-location-count"><Warehouse className="size-5 text-primary" /><span>Locais cadastrados</span><strong>{selectedLocations.length}</strong></div>
          <div className="rounded-lg border p-3 text-sm" aria-label={"Pedidos e resultados em " + title}>
            <strong className="block mb-2">Pedidos e resultados</strong>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-muted-foreground">
              <span>Pedidos <b className="text-foreground">{summary.orders}</b></span>
              <span>Unidades <b className="text-foreground">{summary.units}</b></span>
              <span>Pedido feito <b className="text-foreground">{summary.created}</b></span>
              <span>Em caminho <b className="text-foreground">{summary.inTransit}</b></span>
              <span>Entregues <b className="text-foreground">{summary.delivered}</b></span>
              <span>Pagos <b className="text-foreground">{summary.paid}</b></span>
              <span>Parciais <b className="text-foreground">{summary.partial}</b></span>
              <span>Aguardando <b className="text-foreground">{summary.awaiting}</b></span>
              <span>Cancelados <b className="text-foreground">{summary.cancelled}</b></span>
              <span>Perdidos <b className="text-foreground">{summary.lost}</b></span>
            </div>
            <dl className="mt-3 space-y-1.5 border-t pt-3 text-xs">
              {([
                ["Total vendido", summary.gross],
                ["Custo dos produtos", summary.cost],
                ["Custo de frete", summary.shipping],
                ["Lucro estimado", summary.profit],
                ["Total já pago", summary.paidAmount],
                ["Falta pagar", summary.remainingAmount],
                ["Pedidos em caminho", summary.inTransitValue],
                ["Entregue e não pago", summary.deliveredUnpaid],
              ] as const).map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-3">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="text-right font-semibold text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
          {region && <div className="rounded-lg border p-3 text-sm">
            <strong className="block">Líder da região {region}</strong>
            <span className="text-muted-foreground">{leader?.full_name ?? "Nenhum líder atribuído"}</span>
            {onLeaderChange && <select className="mt-2 w-full rounded-md border bg-background p-2" aria-label={"Atribuir líder da região " + region}
              value={leaders[region] ?? ""} onChange={(event) => onLeaderChange(region, event.target.value || null)}>
              <option value="">Sem líder atribuído</option>
              {people.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}
            </select>}
          </div>}
          <div className="rounded-lg border p-3 text-sm">
            <strong className="flex items-center gap-2"><Users className="size-4 text-primary" />Vendedores com pedidos em {title}</strong>
            {selectedSellers.length ? <ul className="mt-2 space-y-1">{selectedSellers.map((seller) => <li key={seller.id}>{seller.full_name}{seller.phone
              ? <a className="ml-2 text-primary" href={"tel:" + seller.phone}>{seller.phone}</a>
              : <span className="ml-2 text-muted-foreground">Telefone não cadastrado</span>}</li>)}</ul>
              : <p className="mt-2 text-muted-foreground">Nenhum vendedor identificado neste território.</p>}
          </div>
          <div className="space-y-2" aria-label={"Locais em " + title}>
            <strong className="text-sm">Resumo dos estoques em {title}</strong>
            {selectedLocations.length ? selectedLocations.map((location) => {
              const items = location.items ?? [];
              const total = items.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
              return <div key={location.id} className="rounded-lg border p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0"><strong className="flex items-center gap-2"><PackageCheck className="size-4 shrink-0 text-primary" />{location.name}</strong>
                    <small className="text-muted-foreground">{[location.city, location.state].filter(Boolean).join(" · ")}</small></span>
                  <span className="shrink-0 text-right"><strong className="block">{total.toLocaleString("pt-BR")} unidades</strong><small className="text-muted-foreground">{items.length} produto(s)</small></span>
                </div>
                {items.length > 0 && <details className="mt-2 border-t pt-2"><summary className="cursor-pointer text-xs text-primary">Ver produtos ({items.length})</summary><ul className="mt-2 space-y-1">{items.map((item) =>
                  <li key={item.id} className="flex justify-between gap-2 text-xs"><span className="truncate">{item.name}</span><strong>{Number(item.quantity ?? 0).toLocaleString("pt-BR")}</strong></li>
                )}</ul></details>}
                {!items.length && <p className="mt-2 text-xs text-muted-foreground">Nenhum produto vinculado.</p>}
              </div>;
            }) : <p className="text-sm text-muted-foreground">Nenhum local de estoque neste território.</p>}
          </div>
          {selection.mode === "national" && outsideBrazil.length > 0 && <div className="space-y-2 border-t pt-3" aria-label="Estoques fora do Brasil">
            <strong className="text-sm">Estoques fora do Brasil</strong>
            {outsideBrazil.map((location) => {
              const items = location.items ?? [];
              const total = items.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
              return <div key={location.id} className="rounded-lg border p-3 text-sm">
                <div className="flex items-start justify-between gap-2"><span><strong className="block">{location.name}</strong><small className="text-muted-foreground">{[location.city, location.country].filter(Boolean).join(" · ")}</small></span>
                  <span className="shrink-0 text-right"><strong className="block">{total.toLocaleString("pt-BR")} unidades</strong><small className="text-muted-foreground">{items.length} produto(s)</small></span></div>
                {items.length > 0 && <details className="mt-2 border-t pt-2"><summary className="cursor-pointer text-xs text-primary">Ver produtos ({items.length})</summary><ul className="mt-2 space-y-1">{items.map((item) =>
                  <li key={item.id} className="flex justify-between gap-2 text-xs"><span className="truncate">{item.name}</span><strong>{Number(item.quantity ?? 0).toLocaleString("pt-BR")}</strong></li>
                )}</ul></details>}
              </div>;
            })}
          </div>}
          {canOpenStock && <Button asChild variant="outline" className="mt-auto w-full"><Link to="/produtos">Abrir categorias e estoque</Link></Button>}
        </CardContent>
      </Card>
    </section>
  );
}
