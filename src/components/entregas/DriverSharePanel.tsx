/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Painel do motorista: convites de rastreamento e compartilhamento manual da
 * localização. Nada é enviado sem o motorista tocar em "Começar".
 */
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, MapPin, Square } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getMyDriverSessions,
  pushDriverPoint,
  trackingSessionAction,
} from "@/lib/tracking.functions";

const STATUS_LABEL: Record<string, string> = {
  aguardando: "Aguardando sua permissão",
  aceito: "Permissão dada — parado",
  compartilhando: "Compartilhando",
  parado: "Parado",
  revogado: "Revogado",
  expirado: "Expirado",
};

export function DriverSharePanel() {
  const listFn = useServerFn(getMyDriverSessions);
  const actionFn = useServerFn(trackingSessionAction);
  const pushFn = useServerFn(pushDriverPoint);

  const [sharingId, setSharingId] = useState<string | null>(null);
  const [lastAt, setLastAt] = useState<Date | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const watchRef = useRef<number | null>(null);
  const lastSent = useRef(0);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["driver-sessions"],
    queryFn: () => listFn(),
    refetchInterval: 60_000,
  });

  function stopWatch() {
    if (watchRef.current !== null && typeof navigator !== "undefined") {
      navigator.geolocation.clearWatch(watchRef.current);
    }
    watchRef.current = null;
    setSharingId(null);
    setLastAt(null);
  }

  useEffect(() => stopWatch, []);

  async function start(session: any) {
    setGeoError(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError("Este aparelho não permite compartilhar localização.");
      return;
    }
    try {
      await actionFn({ data: { sessionId: session.id, action: "iniciar" } });
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível iniciar.");
      return;
    }
    setSharingId(session.id);
    watchRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const now = Date.now();
        if (now - lastSent.current < 10_000) return; // no máximo a cada 10s
        lastSent.current = now;
        try {
          await pushFn({
            data: {
              sessionId: session.id,
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy ?? null,
              speed: pos.coords.speed !== null ? Number(pos.coords.speed) * 3.6 : null,
              heading: pos.coords.heading ?? null,
              deviceTime: new Date().toISOString(),
            },
          });
          setLastAt(new Date());
          setGeoError(null);
        } catch (e: any) {
          setGeoError(e?.message ?? "Envio recusado.");
          if (String(e?.message ?? "").includes("não está ativo")) {
            stopWatch();
            refetch();
          }
        }
      },
      (err) => {
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? "Permissão de localização negada no aparelho."
            : "Localização indisponível no momento.",
        );
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
    refetch();
  }

  async function stop(session: any, action: "parar" | "aceitar") {
    try {
      await actionFn({ data: { sessionId: session.id, action } });
      if (action === "parar") stopWatch();
      refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível concluir.");
    }
  }

  const sessions = data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Compartilhar minha localização</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Carregando…
          </p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Você não tem nenhum convite de rastreamento no momento.
          </p>
        ) : (
          sessions.map((s: any) => (
            <div key={s.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">
                    Entrega #{s.order_number ?? "—"} {s.plate ? `· ${s.plate}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {s.purpose} · vale até {new Date(s.expires_at).toLocaleString("pt-BR")}
                  </p>
                </div>
                <Badge variant={s.status === "compartilhando" ? "default" : "secondary"}>
                  {STATUS_LABEL[s.status] ?? s.status}
                </Badge>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {s.status === "aguardando" && (
                  <Button size="sm" onClick={() => stop(s, "aceitar")}>
                    Aceito compartilhar
                  </Button>
                )}
                {(s.status === "aceito" || s.status === "parado") && (
                  <Button size="sm" onClick={() => start(s)}>
                    <MapPin className="mr-1.5 size-4" /> Começar a compartilhar
                  </Button>
                )}
                {s.status === "compartilhando" && (
                  <Button size="sm" variant="destructive" onClick={() => stop(s, "parar")}>
                    <Square className="mr-1.5 size-4" /> Parar
                  </Button>
                )}
                {sharingId === s.id && (
                  <span className="text-xs text-muted-foreground">
                    {lastAt
                      ? `Última atualização às ${lastAt.toLocaleTimeString("pt-BR")}`
                      : "Aguardando o sinal do aparelho…"}
                  </span>
                )}
              </div>

              {s.status === "compartilhando" && sharingId !== s.id && (
                <p className="mt-2 text-xs text-amber-600">
                  Este compartilhamento está marcado como ativo, mas não está enviando por aqui.
                  Toque em “Parar” e comece de novo neste aparelho.
                </p>
              )}
              {geoError && sharingId === s.id && (
                <p className="mt-2 text-xs text-destructive">{geoError}</p>
              )}
            </div>
          ))
        )}
        <p className="text-xs text-muted-foreground">
          A localização só é enviada enquanto você mantiver o compartilhamento ligado e a permissão
          valer. Ao concluir a entrega ou passar do prazo, ele para sozinho.
        </p>
      </CardContent>
    </Card>
  );
}
