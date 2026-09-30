/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Rastreamento de veículos das entregas (administração).
 * O mapa começa desligado: nenhuma coordenada é buscada, assinada em tempo real
 * ou guardada em memória enquanto o botão "Visualizar no mapa" estiver desligado.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, Plus, ShieldAlert, Truck } from "lucide-react";
import { useCurrentUser } from "@/hooks/useAuth";
import { EmptyState } from "@/components/common/PageHeader";
import { TrackingMap } from "@/components/entregas/TrackingMap";
import { DriverSharePanel } from "@/components/entregas/DriverSharePanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
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
import {
  createTrackingSession,
  getSessionPosition,
  openTrackingView,
  closeTrackingView,
  getTrackingAudit,
  getTrackingConfig,
  getTrackingOverview,
  logTrackingView,
  saveTrackingDevice,
  saveVehicle,
  trackingSessionAction,
} from "@/lib/tracking.functions";

const SESSION_LABEL: Record<string, string> = {
  aguardando: "Aguardando aceite",
  aceito: "Aceito",
  compartilhando: "Compartilhando",
  parado: "Parado",
  revogado: "Revogado",
  expirado: "Expirado",
};

const MAP_IDLE_MS = 5 * 60_000;

function relative(iso?: string | null) {
  if (!iso) return "sem sinal";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return "agora mesmo";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dia(s)`;
}

function signalOf(session: any): {
  label: string;
  tone: "default" | "secondary" | "destructive" | "outline";
} {
  if (["revogado", "expirado", "parado"].includes(session.status))
    return { label: "rastreamento encerrado", tone: "secondary" };
  if (!session.last_point_at) return { label: "sem sinal", tone: "outline" };
  const min = (Date.now() - new Date(session.last_point_at).getTime()) / 60_000;
  if (min <= 3) return { label: "ao vivo", tone: "default" };
  if (min <= 20) return { label: "atrasado", tone: "outline" };
  return { label: "sem sinal", tone: "destructive" };
}

export function TrackingSection({ orders, people }: { orders: any[]; people: any[] }) {
  const { isAdmin } = useCurrentUser();
  const queryClient = useQueryClient();

  if (!isAdmin) {
    return (
      <div className="space-y-4">
        <DriverSharePanel />
        <EmptyState
          title="Acesso restrito"
          description="Somente administradores podem ver veículos, rastreadores e posições no mapa."
        />
      </div>
    );
  }
  return <AdminTracking orders={orders} people={people} queryClient={queryClient} />;
}

function AdminTracking({ orders, people, queryClient }: any) {
  const overviewFn = useServerFn(getTrackingOverview);
  const configFn = useServerFn(getTrackingConfig);
  const positionFn = useServerFn(getSessionPosition);
  const auditFn = useServerFn(getTrackingAudit);
  const saveVehicleFn = useServerFn(saveVehicle);
  const saveDeviceFn = useServerFn(saveTrackingDevice);
  const createSessionFn = useServerFn(createTrackingSession);
  const actionFn = useServerFn(trackingSessionAction);
  const logViewFn = useServerFn(logTrackingView);
  const openViewFn = useServerFn(openTrackingView);
  const closeViewFn = useServerFn(closeTrackingView);
  const [viewId, setViewId] = useState<string | null>(null);

  const [mapSession, setMapSession] = useState<any>(null);
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [deviceOpen, setDeviceOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [vf, setVf] = useState({ plate: "", label: "", model: "", driverId: "" });
  const [df, setDf] = useState({ provider: "", externalDeviceId: "", vehicleId: "", label: "" });
  const [sf, setSf] = useState({
    orderId: "",
    source: "motorista",
    vehicleId: "",
    deviceId: "",
    driverId: "",
    hours: "8",
  });

  const { data: config } = useQuery({ queryKey: ["tracking-config"], queryFn: () => configFn() });
  const { data, isLoading } = useQuery({
    queryKey: ["tracking-overview"],
    queryFn: () => overviewFn(),
    refetchInterval: 60_000,
  });
  const { data: audit } = useQuery({ queryKey: ["tracking-audit"], queryFn: () => auditFn() });

  // Posição: consultada apenas com o mapa ligado e a visualização autorizada.
  const { data: position, isFetching: loadingPos } = useQuery({
    queryKey: ["tracking-position", mapSession?.id, viewId],
    queryFn: () => positionFn({ data: { viewId: viewId!, sessionId: mapSession.id, history: 40 } }),
    enabled: !!mapSession && !!viewId,
    refetchInterval: mapSession && viewId ? 15_000 : false,
    gcTime: 0,
  });

  // Desligamento automático por inatividade.
  useEffect(() => {
    if (!mapSession) return;
    idleTimer.current = setTimeout(() => {
      toast.info("Mapa fechado automaticamente por inatividade.");
      closeMap();
    }, MAP_IDLE_MS);
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapSession]);

  async function openMap(session: any) {
    try {
      const res: any = await openViewFn({
        data: { orderId: session.order_id, sessionId: session.id },
      });
      setViewId(res?.view_id ?? null);
      setMapSession(session);
    } catch (e: any) {
      toast.error(
        String(e?.message || "")
          .toLowerCase()
          .includes("aal2")
          ? "Ative a verificação em duas etapas para ver coordenadas."
          : "Não foi possível abrir a visualização.",
      );
      return;
    }
    try {
      await logViewFn({ data: { orderId: session.order_id, action: "mapa_aberto" } });
    } catch {
      /* auditoria não bloqueia a visualização */
    }
  }

  async function closeMap() {
    const current = mapSession;
    const view = viewId;
    setMapSession(null);
    setViewId(null);
    if (view) {
      try {
        await closeViewFn({ data: { viewId: view, reason: "fechado" } });
      } catch {
        /* ignora */
      }
    }
    if (current) {
      queryClient.removeQueries({ queryKey: ["tracking-position"] });
      try {
        await logViewFn({ data: { orderId: current.order_id, action: "mapa_fechado" } });
      } catch {
        /* ignora */
      }
    }
  }

  // fecha o mapa ao sair da tela
  useEffect(() => {
    return () => {
      queryClient.removeQueries({ queryKey: ["tracking-position"] });
    };
  }, [queryClient]);

  const vehicles = data?.vehicles ?? [];
  const devices = data?.devices ?? [];
  const sessions = data?.sessions ?? [];
  const openOrders = useMemo(
    () =>
      (orders ?? [])
        .filter((o: any) => o.status !== "cancelado" && !o.delivered_at)
        .sort((a: any, b: any) => Number(a.number ?? 0) - Number(b.number ?? 0)),
    [orders],
  );

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["tracking-overview"] });

  async function submitVehicle() {
    setSaving(true);
    try {
      await saveVehicleFn({
        data: {
          plate: vf.plate,
          label: vf.label,
          model: vf.model,
          driverId: vf.driverId || null,
        },
      });
      toast.success("Veículo salvo.");
      setVehicleOpen(false);
      setVf({ plate: "", label: "", model: "", driverId: "" });
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível salvar.");
    }
    setSaving(false);
  }

  async function submitDevice() {
    setSaving(true);
    try {
      await saveDeviceFn({
        data: {
          provider: df.provider,
          externalDeviceId: df.externalDeviceId,
          vehicleId: df.vehicleId || null,
          label: df.label,
        },
      });
      toast.success("Rastreador salvo.");
      setDeviceOpen(false);
      setDf({ provider: "", externalDeviceId: "", vehicleId: "", label: "" });
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível salvar.");
    }
    setSaving(false);
  }

  async function submitSession() {
    setSaving(true);
    try {
      await createSessionFn({
        data: {
          orderId: sf.orderId,
          source: sf.source as "tag" | "motorista",
          vehicleId: sf.vehicleId || null,
          deviceId: sf.deviceId || null,
          driverId: sf.driverId || null,
          hours: Number(sf.hours) || 8,
        },
      });
      toast.success(
        sf.source === "motorista"
          ? "Convite enviado ao motorista."
          : "Rastreamento por tag ativado.",
      );
      setInviteOpen(false);
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível criar a sessão.");
    }
    setSaving(false);
  }

  async function revoke(session: any) {
    try {
      await actionFn({ data: { sessionId: session.id, action: "revogar" } });
      if (mapSession?.id === session.id) closeMap();
      toast.success("Rastreamento revogado.");
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível revogar.");
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">Veículos e rastreadores</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setVehicleOpen(true)}>
              <Plus className="mr-1.5 size-4" /> Veículo
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDeviceOpen(true)}>
              <Plus className="mr-1.5 size-4" /> Rastreador
            </Button>
            <Button size="sm" onClick={() => setInviteOpen(true)}>
              <Truck className="mr-1.5 size-4" /> Rastrear entrega
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!config?.tagProviderReady && (
            <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              <ShieldAlert className="mr-1.5 inline size-4" />
              Configuração pendente para rastreadores (tags): o recebimento automático de posições
              fica bloqueado até o provedor ser configurado. O compartilhamento pelo motorista já
              funciona.
            </p>
          )}
          {vehicles.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum veículo cadastrado ainda.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {vehicles.map((v: any) => {
                const dev = devices.find((d: any) => d.vehicle_id === v.id);
                return (
                  <div key={v.id} className="rounded-lg border p-3 text-sm">
                    <p className="font-medium">
                      {v.plate} {v.label ? `· ${v.label}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {v.model || "sem modelo"} ·{" "}
                      {people.find((p: any) => p.id === v.driver_id)?.full_name ?? "sem motorista"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {dev
                        ? `Tag ${dev.provider} · último sinal ${relative(dev.last_seen_at)}`
                        : "Sem tag vinculada"}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Entregas rastreadas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Carregando…
            </p>
          ) : sessions.length === 0 ? (
            <EmptyState
              title="Nenhum rastreamento ativo"
              description="Use “Rastrear entrega” para acompanhar um caminhão por tag ou pelo motorista."
            />
          ) : (
            sessions.map((s: any) => {
              const sig = signalOf(s);
              const vehicle = vehicles.find((v: any) => v.id === s.vehicle_id);
              const isOpen = mapSession?.id === s.id;
              return (
                <div key={s.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">Entrega #{s.order?.number ?? "—"}</span>
                        <Badge variant="secondary">
                          {s.source === "tag" ? "Tag" : "Motorista"}
                        </Badge>
                        <Badge variant={s.status === "compartilhando" ? "default" : "secondary"}>
                          {SESSION_LABEL[s.status] ?? s.status}
                        </Badge>
                        <Badge variant={sig.tone}>{sig.label}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {vehicle ? `${vehicle.plate}` : "sem veículo"} ·{" "}
                        {s.driver?.full_name ?? (s.source === "tag" ? "tag da empresa" : "—")} ·
                        atualizado {relative(s.last_point_at)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Consentimento:{" "}
                        {s.consent_at
                          ? new Date(s.consent_at).toLocaleString("pt-BR")
                          : "ainda não aceito"}{" "}
                        · válido até {new Date(s.expires_at).toLocaleString("pt-BR")}
                        {s.end_reason ? ` · encerrado (${s.end_reason})` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Switch
                          id={`map-${s.id}`}
                          checked={isOpen}
                          onCheckedChange={(v) => (v ? openMap(s) : closeMap())}
                        />
                        <Label htmlFor={`map-${s.id}`} className="text-sm">
                          {isOpen ? (
                            <Eye className="mr-1 inline size-4" />
                          ) : (
                            <EyeOff className="mr-1 inline size-4" />
                          )}
                          Visualizar no mapa
                        </Label>
                      </div>
                      {!["revogado", "expirado"].includes(s.status) && (
                        <Button size="sm" variant="outline" onClick={() => revoke(s)}>
                          Revogar
                        </Button>
                      )}
                    </div>
                  </div>

                  {isOpen && (
                    <div className="mt-3 border-t pt-3">
                      <p className="mb-2 text-xs text-amber-600">
                        Acesso restrito: as coordenadas aparecem apenas enquanto este botão estiver
                        ligado e são fechadas automaticamente após alguns minutos.
                      </p>
                      {loadingPos && !position ? (
                        <p className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="size-4 animate-spin" /> Buscando posição…
                        </p>
                      ) : !position?.current ? (
                        <p className="text-sm text-muted-foreground">
                          Sem sinal: ainda não recebemos nenhuma posição desta entrega.
                        </p>
                      ) : (
                        <>
                          <TrackingMap
                            current={position.current as any}
                            history={(position.history ?? []) as any}
                          />
                          <p className="mt-2 text-xs text-muted-foreground">
                            {Number(position.current.latitude).toFixed(5)},{" "}
                            {Number(position.current.longitude).toFixed(5)} · precisão{" "}
                            {position.current.accuracy_m
                              ? `${Math.round(Number(position.current.accuracy_m))} m`
                              : "não informada"}
                            {position.current.speed_kmh != null
                              ? ` · ${Math.round(Number(position.current.speed_kmh))} km/h`
                              : ""}
                            {position.current.heading_deg != null
                              ? ` · direção ${Math.round(Number(position.current.heading_deg))}°`
                              : ""}{" "}
                            · {relative(position.current.device_time)} · {position.history.length}{" "}
                            ponto(s) no histórico guardado
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Auditoria do rastreamento</CardTitle>
        </CardHeader>
        <CardContent>
          {(audit ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum registro ainda.</p>
          ) : (
            <div className="space-y-1">
              {(audit ?? []).map((a: any) => (
                <p key={a.id} className="text-xs text-muted-foreground">
                  {new Date(a.created_at).toLocaleString("pt-BR")} · {a.actor_name} ·{" "}
                  {a.action.replaceAll("_", " ")}
                </p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <DriverSharePanel />

      {/* Veículo */}
      <Dialog open={vehicleOpen} onOpenChange={setVehicleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo veículo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Placa</Label>
              <Input
                className="mt-1.5"
                value={vf.plate}
                onChange={(e) => setVf({ ...vf, plate: e.target.value })}
                placeholder="ABC1D23"
              />
            </div>
            <div>
              <Label>Apelido</Label>
              <Input
                className="mt-1.5"
                value={vf.label}
                onChange={(e) => setVf({ ...vf, label: e.target.value })}
                placeholder="Caminhão 1"
              />
            </div>
            <div>
              <Label>Modelo</Label>
              <Input
                className="mt-1.5"
                value={vf.model}
                onChange={(e) => setVf({ ...vf, model: e.target.value })}
              />
            </div>
            <div>
              <Label>Motorista responsável</Label>
              <Select value={vf.driverId} onValueChange={(v) => setVf({ ...vf, driverId: v })}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Selecionar" />
                </SelectTrigger>
                <SelectContent>
                  {people.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name ?? p.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVehicleOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submitVehicle} disabled={saving}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rastreador */}
      <Dialog open={deviceOpen} onOpenChange={setDeviceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo rastreador (tag)</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Provedor</Label>
              <Input
                className="mt-1.5"
                value={df.provider}
                onChange={(e) => setDf({ ...df, provider: e.target.value })}
                placeholder="Ex.: traccar, positron"
              />
            </div>
            <div>
              <Label>Identificador do aparelho</Label>
              <Input
                className="mt-1.5"
                value={df.externalDeviceId}
                onChange={(e) => setDf({ ...df, externalDeviceId: e.target.value })}
                placeholder="IMEI ou ID do provedor"
              />
            </div>
            <div>
              <Label>Veículo</Label>
              <Select value={df.vehicleId} onValueChange={(v) => setDf({ ...df, vehicleId: v })}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Selecionar" />
                </SelectTrigger>
                <SelectContent>
                  {vehicles.map((v: any) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.plate}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Chaves e segredos do provedor ficam somente no servidor e nunca aparecem aqui depois
              de salvos.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeviceOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submitDevice} disabled={saving}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sessão */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rastrear uma entrega</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Entrega</Label>
              <Select value={sf.orderId} onValueChange={(v) => setSf({ ...sf, orderId: v })}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Selecionar pedido" />
                </SelectTrigger>
                <SelectContent>
                  {openOrders.map((o: any) => (
                    <SelectItem key={o.id} value={o.id}>
                      #{o.number} · {o.customers?.name ?? "sem cliente"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fonte</Label>
              <Select value={sf.source} onValueChange={(v) => setSf({ ...sf, source: v })}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="motorista">Localização do motorista</SelectItem>
                  <SelectItem value="tag">Tag da empresa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Veículo</Label>
              <Select value={sf.vehicleId} onValueChange={(v) => setSf({ ...sf, vehicleId: v })}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Selecionar" />
                </SelectTrigger>
                <SelectContent>
                  {vehicles.map((v: any) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.plate}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {sf.source === "tag" ? (
              <div>
                <Label>Rastreador</Label>
                <Select value={sf.deviceId} onValueChange={(v) => setSf({ ...sf, deviceId: v })}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Selecionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {devices.map((d: any) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.provider} · {d.external_device_id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <Label>Motorista</Label>
                <Select value={sf.driverId} onValueChange={(v) => setSf({ ...sf, driverId: v })}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Selecionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {people.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name ?? p.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Duração da permissão (horas)</Label>
              <Input
                className="mt-1.5"
                type="number"
                min={1}
                max={72}
                value={sf.hours}
                onChange={(e) => setSf({ ...sf, hours: e.target.value })}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              O motorista precisa aceitar antes de qualquer envio e pode parar quando quiser. A
              permissão expira sozinha no prazo escolhido.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submitSession} disabled={saving || !sf.orderId}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />} Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
