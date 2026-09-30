/**
 * Mapa da posição atual. Por padrão não usa nenhum serviço de terceiros:
 * desenha um traçado privado com as posições recebidas. Blocos de mapa só
 * aparecem se o projeto configurar um provedor próprio e permitido.
 * Nunca desenha marcador ou rota falsos.
 */
const TILE_URL = (import.meta.env["VITE_MAP_TILES_URL"] as string | undefined) ?? "";
const ALLOWED_TILE_HOSTS = ((import.meta.env["VITE_MAP_TILES_HOSTS"] as string | undefined) ?? "")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);

function tilesAllowed(url: string) {
  if (!url) return false;
  try {
    const host = new URL(url.replace("{z}", "1").replace("{x}", "1").replace("{y}", "1")).hostname;
    return ALLOWED_TILE_HOSTS.includes(host);
  } catch {
    return false;
  }
}

const TILE = 256;
const ZOOM = 15;

export type MapPoint = {
  latitude: number;
  longitude: number;
  accuracy_m?: number | null;
  device_time?: string;
};

function project(lat: number, lng: number, z: number) {
  const n = 2 ** z;
  const x = ((lng + 180) / 360) * n;
  const rad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  return { x, y };
}

export function TrackingMap({
  current,
  history = [],
}: {
  current: MapPoint;
  history?: MapPoint[];
}) {
  const useTiles = tilesAllowed(TILE_URL);
  const center = project(current.latitude, current.longitude, ZOOM);
  const cx = Math.floor(center.x);
  const cy = Math.floor(center.y);
  const offX = (center.x - cx) * TILE;
  const offY = (center.y - cy) * TILE;

  const tiles: { x: number; y: number; dx: number; dy: number }[] = [];
  if (useTiles) {
    for (let i = -2; i <= 2; i++) {
      for (let j = -2; j <= 2; j++) {
        tiles.push({ x: cx + i, y: cy + j, dx: i * TILE - offX, dy: j * TILE - offY });
      }
    }
  }

  const dotFor = (p: MapPoint) => {
    const q = project(p.latitude, p.longitude, ZOOM);
    return { dx: (q.x - center.x) * TILE, dy: (q.y - center.y) * TILE };
  };

  return (
    <div className="relative h-72 w-full overflow-hidden rounded-lg border bg-muted">
      {!useTiles && (
        <>
          <div
            className="absolute inset-0 opacity-40"
            style={{
              backgroundImage:
                "linear-gradient(to right, hsl(var(--border)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border)) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
          />
          <span className="absolute left-2 top-2 rounded bg-background/80 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            Provedor de mapa privado pendente — traçado interno das posições
          </span>
        </>
      )}

      <div className="absolute left-1/2 top-1/2">
        {tiles.map((t) => (
          <img
            key={`${t.x}-${t.y}`}
            src={TILE_URL.replace("{z}", String(ZOOM))
              .replace("{x}", String(t.x))
              .replace("{y}", String(t.y))}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            width={TILE}
            height={TILE}
            className="absolute max-w-none select-none"
            style={{ transform: `translate(${t.dx}px, ${t.dy}px)` }}
          />
        ))}

        {history.slice(1).map((p, i) => {
          const d = dotFor(p);
          return (
            <span
              key={i}
              className="absolute size-1.5 rounded-full bg-primary/60"
              style={{ transform: `translate(${d.dx - 3}px, ${d.dy - 3}px)` }}
            />
          );
        })}

        <span
          className="absolute size-4 rounded-full border-2 border-background bg-primary shadow"
          style={{ transform: "translate(-8px, -8px)" }}
        />
      </div>
    </div>
  );
}
