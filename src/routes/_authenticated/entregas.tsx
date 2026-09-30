import { OperationalFilters, useOperationalFilters } from "@/components/common/OperationalFilters";
import { enrichOperationalRow, filterOperationalRows } from "@/lib/operational-filters";
import { ReportButton } from "@/components/common/ReportButton";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CircleCheck,
  Download,
  Link2,
  Loader2,
  MapPin,
  PackageCheck,
  Plus,
  QrCode,
  Truck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatCep } from "@/lib/cep";
import { orderNumber } from "@/lib/sales";
import { downloadDeliveryPdf } from "@/lib/delivery-pdf";
import { StatCards } from "@/components/common/PeriodFilter";
import { deliveryState, delayDays, stateTone } from "@/lib/delivery";
import {
  getDeliverySeller,
  getManagedDeliveries,
  getDeliveryFilterMetadata,
} from "@/lib/deliveries.functions";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, EmptyState } from "@/components/common/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrackingSection } from "@/components/entregas/TrackingSection";
import { DeliveryQr } from "@/components/entregas/DeliveryQr";
import { DeliveryQrScanner } from "@/components/entregas/DeliveryQrScanner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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

export const Route = createFileRoute("/_authenticated/entregas")({
  head: () => ({
    meta: [
      { title: "Entregas — OS" },
      {
        name: "description",
        content: "Acompanhe onde está cada mercadoria e os prazos de entrega.",
      },
      { property: "og:title", content: "Entregas — OS" },
      { property: "og:description", content: "Rastreamento de mercadorias e prazos." },
    ],
  }),
  component: Entregas,
});

const EVENT_STATUS = [
  { value: "ajuste_entrega", label: "Em ajuste para entrega" },
  { value: "saiu_entrega", label: "Saiu para entrega" },
  { value: "chegando", label: "Está chegando" },
  { value: "entregue", label: "Entregue" },
  { value: "cancelado", label: "Cancelado" },
];

type LogisticsStage =
  "ajuste_entrega" | "saiu_entrega" | "chegando" | "entregue" | "cancelado" | "perdido";

const LOGISTICS_LABEL: Record<LogisticsStage, string> = {
  ajuste_entrega: "Em ajuste para entrega",
  saiu_entrega: "Saiu para entrega",
  chegando: "Está chegando",
  entregue: "Entregue",
  perdido: "Produtos perdidos",
  cancelado: "Cancelado",
};

function formatRecipientDocument(value?: string | null) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length !== 11) return value || "não informado";
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

function logisticsStage(order: any): LogisticsStage {
  if (order.fulfillment_status === "perdido" || order.workflow_stage === "perdido")
    return "perdido";
  if (order.status === "cancelado" || order.fulfillment_status === "cancelado") return "cancelado";
  if (order.delivered_at || order.status === "entregue" || order.fulfillment_status === "entregue")
    return "entregue";
  const tracking = String(order.tracking_status ?? "").toLowerCase();
  if (tracking.includes("chegando")) return "chegando";
  if (
    tracking.includes("saiu_entrega") ||
    tracking.includes("saiu para entrega") ||
    tracking.includes("em_transito") ||
    tracking.includes("em trânsito") ||
    order.fulfillment_status === "a_caminho" ||
    order.workflow_stage === "em_caminho"
  )
    return "saiu_entrega";
  return "ajuste_entrega";
}

function Entregas() {
  const { isAdmin } = useCurrentUser();
  const { can, loading: permissionsLoading } = usePermissions();
  const canManage = can("deliveries_manage");
  const loadManagedDeliveries = useServerFn(getManagedDeliveries);
  const loadDeliverySeller = useServerFn(getDeliverySeller);
  const queryClient = useQueryClient();
  const [filters, setFilters] = useOperationalFilters();
  const loadFilterMetadata = useServerFn(getDeliveryFilterMetadata);
  const [serviceStage, setServiceStage] = useState<LogisticsStage>("ajuste_entrega");
  const [mainTab, setMainTab] = useState("entregas");
  useEffect(() => {
    const fase = new URLSearchParams(window.location.search).get("fase");
    if (fase && Object.keys(LOGISTICS_LABEL).includes(fase))
      setServiceStage(fase as LogisticsStage);
  }, []);
  const [openOrder, setOpenOrder] = useState<any>(null);
  const [detailOrder, setDetailOrder] = useState<any>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [evStatus, setEvStatus] = useState<LogisticsStage>("ajuste_entrega");
  const [evLocation, setEvLocation] = useState("");
  const [evNotes, setEvNotes] = useState("");
  const [evDistance, setEvDistance] = useState("");
  const [evEta, setEvEta] = useState("");
  const [saving, setSaving] = useState(false);
  const [generatingPdfId, setGeneratingPdfId] = useState<string | null>(null);

  const {
    data,
    isLoading,
    error: deliveriesError,
  } = useQuery({
    queryKey: ["entregas", canManage],
    enabled: !permissionsLoading,
    queryFn: async () => {
      if (!canManage) {
        // Entregador vê apenas as entregas atribuídas a ele, sem valores.
        const { data: mine } = await supabase.rpc("my_deliveries");
        const rows = (mine ?? []).map((d: any) => ({
          id: d.order_id,
          number: d.number,
          revision_no: d.revision_no,
          status: d.status,
          tracking_status: d.tracking_status,
          workflow_stage: d.workflow_stage ?? "pedido_feito",
          fulfillment_status: d.fulfillment_status ?? "recebido",
          tracking_enabled: !!d.tracking_enabled,
          delivery_token: d.delivery_token,
          delivery_deadline: d.deadline,
          delivered_at: d.delivered_at,
          delivery_recipient_name: d.recipient,
          delivery_recipient_document: d.recipient_document,
          shipping_address: d.address,
          shipping_address_number: d.address_number,
          shipping_cep: d.cep,
          shipping_city: d.city,
          shipping_state: d.state,
          warehouse: {
            name: d.warehouse_name,
            address: d.warehouse_address,
            city: d.warehouse_city,
            state: d.warehouse_state,
          },
          notes: d.instructions,
        }));
        const ids = rows.map((row: any) => row.id);
        const { data: items } = ids.length
          ? await (supabase as any)
              .from("order_items")
              .select("order_id,description,quantity,unit")
              .in("order_id", ids)
          : { data: [] };
        return { orders: rows, events: [] as any[], items: items ?? [], warehouses: [] as any[] };
      }
      return loadManagedDeliveries();
    },
  });

  const { data: people } = useQuery({
    queryKey: ["entregas-pessoas"],
    enabled: canManage,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id,full_name,email")
        .eq("is_active", true)
        .order("full_name");
      return data ?? [];
    },
  });

  const filterMetadata = useQuery({
    queryKey: [
      "delivery-filter-metadata",
      (data?.orders ?? []).map((o: any) => o.id).join(","),
      canManage,
    ],
    enabled: !!data,
    queryFn: () =>
      loadFilterMetadata({ data: { ids: (data?.orders ?? []).map((o: any) => o.id) } }),
  });
  const filterRows = useMemo(
    () =>
      (data?.orders ?? []).map((o: any) => ({
        ...enrichOperationalRow(
          o,
          filterMetadata.data ?? {},
          (filterMetadata.data?.lines ?? []).filter((i: any) => i.order_id === o.id),
        ),
        filterStatus: logisticsStage(o),
      })),
    [data, filterMetadata.data],
  );
  const globalRows = useMemo(
    () => filterOperationalRows(filterRows, filters),
    [filterRows, filters],
  );
  const orders = useMemo(
    () => globalRows.filter((o) => logisticsStage(o) === serviceStage),
    [globalRows, serviceStage],
  );
  const serviceCounts = useMemo(
    () =>
      Object.fromEntries(
        (Object.keys(LOGISTICS_LABEL) as LogisticsStage[]).map((stage) => [
          stage,
          globalRows.filter((o) => logisticsStage(o) === stage).length,
        ]),
      ) as Record<LogisticsStage, number>,
    [globalRows],
  );
  const summary = useMemo(
    () => [
      { label: "Pedidos vinculados", value: globalRows.length },
      ...Object.entries(LOGISTICS_LABEL).map(([stage, label]) => ({
        label,
        value: globalRows.filter((o) => logisticsStage(o) === stage).length,
      })),
    ],
    [globalRows],
  );

  const eventsOf = (orderId: string) =>
    (data?.events ?? []).filter((e: any) => e.order_id === orderId);
  const itemsOf = (orderId: string) =>
    (data?.items ?? []).filter((item: any) => item.order_id === orderId);
  const warehouseOf = (order: any) =>
    order.warehouse ??
    (data?.warehouses ?? []).find((warehouse: any) => warehouse.id === order.warehouse_id);

  const deliveriesErrorMessage = useMemo(() => {
    if (!deliveriesError) return "";
    const message =
      deliveriesError instanceof Error ? deliveriesError.message : String(deliveriesError);
    return message || "Não foi possível consultar as entregas.";
  }, [deliveriesError]);

  useEffect(() => {
    const requestedId = new URLSearchParams(window.location.search).get("entrega");
    if (!requestedId || !data?.orders?.length) return;
    const requested = data.orders.find((order: any) => order.id === requestedId);
    if (requested) setDetailOrder(requested);
  }, [data?.orders]);

  async function copyDeliveryLink(order: any) {
    const url = new URL(window.location.href);
    url.searchParams.set("entrega", order.id);
    await navigator.clipboard.writeText(url.toString());
    toast.success("Link protegido da entrega copiado.");
  }

  async function downloadDelivery(order: any) {
    const rows = itemsOf(order.id);
    const warehouse = warehouseOf(order);
    setGeneratingPdfId(order.id);
    try {
      const { sellerName } = await loadDeliverySeller({ data: { orderId: order.id } });
      await downloadDeliveryPdf({
        orderNumber: orderNumber(order.number, order.revision_no),
        status: LOGISTICS_LABEL[logisticsStage(order)],
        seller: sellerName,
        recipient: order.delivery_recipient_name,
        recipientDocument: formatRecipientDocument(order.delivery_recipient_document),
        pickup: [warehouse?.name, warehouse?.address, warehouse?.city, warehouse?.state]
          .filter(Boolean)
          .join(" · "),
        destination: [
          [order.shipping_address, order.shipping_address_number].filter(Boolean).join(", "),
          order.shipping_city,
          order.shipping_state,
        ]
          .filter(Boolean)
          .join(" · "),
        destinationCep: order.shipping_cep ? formatCep(order.shipping_cep) : null,
        notes: order.notes,
        deadline: order.delivery_deadline,
        carrier: order.carrier,
        trackingCode: order.tracking_code,
        confirmationUrl: order.delivery_token
          ? `${window.location.origin}/confirmar-entrega/${order.delivery_token}`
          : null,
        items: rows.map((item: any) => ({
          description: item.description,
          quantity: Number(item.quantity ?? 0),
          unit: item.unit,
        })),
      });
      toast.success("PDF da ordem de entrega gerado.");
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível gerar o PDF da entrega.");
    } finally {
      setGeneratingPdfId(null);
    }
  }

  async function toggleTracking(order: any, value: boolean) {
    const { error } = await supabase
      .from("orders")
      .update({ tracking_enabled: value })
      .eq("id", order.id);
    if (error) toast.error("Não foi possível alterar o rastreio.");
    else {
      toast.success(value ? "Rastreio ativado." : "Rastreio desativado.");
      queryClient.invalidateQueries({ queryKey: ["entregas"] });
    }
  }

  const markDelivered = useCallback(
    async (orderId: string, source: "manual" | "qr" = "manual") => {
      setSaving(true);
      const rpcName = source === "qr" ? "delivery_confirm_by_qr" : "delivery_mark_delivered";
      const args =
        source === "qr" ? { p_token: orderId } : { p_order_id: orderId, p_source: "manual" };
      const { data: result, error } = await (supabase as any).rpc(rpcName, args);
      setSaving(false);
      if (error) {
        toast.error(error.message || "Não foi possível concluir a entrega.");
        return;
      }
      setScannerOpen(false);
      setDetailOrder(null);
      toast.success(
        result?.already_delivered
          ? "Esta entrega já estava concluída."
          : "Entrega concluída e registrada.",
      );
      await queryClient.invalidateQueries({ queryKey: ["entregas"] });
      await queryClient.invalidateQueries({ queryKey: ["sales-docs"] });
    },
    [queryClient],
  );

  const confirmScannedToken = useCallback(
    (token: string) => {
      void markDelivered(token, "qr");
    },
    [markDelivered],
  );

  const invalidQr = useCallback(() => {
    toast.error("Este QR Code não pertence a uma ordem de entrega do OS.");
    setScannerOpen(false);
  }, []);

  async function addEvent() {
    if (!openOrder) return;
    setSaving(true);
    const { error } = await supabase.from("delivery_events").insert({
      order_id: openOrder.id,
      status: evStatus,
      location: evLocation || null,
      notes: evNotes || null,
      distance_remaining_km: evDistance ? Number(evDistance.replace(",", ".")) : null,
      estimated_arrival_at: evEta ? new Date(evEta).toISOString() : null,
    });
    if (!error) {
      await supabase
        .from("orders")
        .update({
          tracking_status: evStatus,
          fulfillment_status:
            evStatus === "ajuste_entrega"
              ? "preparando"
              : evStatus === "entregue"
                ? "entregue"
                : evStatus === "cancelado"
                  ? "cancelado"
                  : "a_caminho",
          ...(evStatus === "entregue"
            ? { delivered_at: new Date().toISOString().slice(0, 10), status: "entregue" }
            : { delivered_at: null }),
        })
        .eq("id", openOrder.id);
    }
    setSaving(false);
    if (error) {
      toast.error("Não foi possível registrar o evento.");
      return;
    }
    setEvLocation("");
    setEvNotes("");
    setEvDistance("");
    setEvEta("");
    setOpenOrder(null);
    toast.success("Movimentação registrada.");
    queryClient.invalidateQueries({ queryKey: ["entregas"] });
  }

  return (
    <div>
      <PageHeader
        title="Entregas"
        description="Veja o prazo de cada pedido e, quando quiser, acompanhe o caminho da mercadoria."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setScannerOpen(true)}>
              <QrCode className="mr-2 size-4" /> Ler QR Code
            </Button>
          </div>
        }
      />

      <OperationalFilters
        rows={filterRows}
        value={filters}
        phase={serviceStage}
        onChange={(next) => {
          setFilters(next);
          if (next.status !== "todos") setServiceStage(next.status as LogisticsStage);
        }}
        statuses={LOGISTICS_LABEL}
        actions={
          <ReportButton
            label="Exportar relatório"
            title="Relatório de entregas"
            filename="entregas"
            build={() => {
              if (
                isLoading ||
                filterMetadata.isLoading ||
                filterMetadata.isError ||
                deliveriesError
              )
                throw new Error("Aguarde o carregamento das entregas e dos filtros.");
              return {
                headers: [
                  "Pedido",
                  "Situação",
                  "Vendedor",
                  "Fornecedor",
                  "Destinatário",
                  "Unidades",
                ],
                rows: (mainTab === "rastreamento" ? globalRows : orders).map((o) => [
                  orderNumber(o.number, o.revision_no),
                  LOGISTICS_LABEL[logisticsStage(o)],
                  o.filterSeller?.name,
                  o.filterSuppliers.map((s: any) => s.name).join(", "),
                  o.delivery_recipient_name,
                  (data?.items ?? [])
                    .filter((i: any) => i.order_id === o.id)
                    .reduce((n: number, i: any) => n + Number(i.quantity || 0), 0),
                ]),
              };
            }}
          />
        }
      />
      {filterMetadata.isError && (
        <p role="alert" className="mb-4 text-destructive">
          Não foi possível consultar os filtros das entregas.
        </p>
      )}
      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="entregas">Entregas</TabsTrigger>
          <TabsTrigger value="rastreamento">Rastreamento</TabsTrigger>
        </TabsList>

        <TabsContent value="rastreamento">
          <TrackingSection orders={globalRows} people={people ?? []} />
        </TabsContent>

        <TabsContent value="entregas">
          <StatCards stats={summary} />

          <Tabs
            value={serviceStage}
            onValueChange={(stage) => {
              setServiceStage(stage as LogisticsStage);
              setFilters({ ...filters, status: "todos" });
            }}
            className="mb-4"
          >
            <TabsList className="h-auto w-full justify-start overflow-x-auto p-1">
              {(Object.keys(LOGISTICS_LABEL) as LogisticsStage[]).map((stage) => (
                <TabsTrigger key={stage} value={stage}>
                  {LOGISTICS_LABEL[stage]} ({serviceCounts[stage]})
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Carregando entregas…
            </div>
          ) : deliveriesError ? (
            <EmptyState
              title="Não foi possível carregar as entregas"
              description={deliveriesErrorMessage}
            />
          ) : orders.length === 0 ? (
            <EmptyState
              title="Nenhuma entrega neste período"
              description="Crie pedidos com prazo de entrega para acompanhar aqui."
            />
          ) : (
            <div className="space-y-3">
              {orders.map((o: any) => {
                const st = deliveryState(o);
                const logistics = logisticsStage(o);
                const late = delayDays(o);
                const evs = eventsOf(o.id);
                return (
                  <Card
                    key={o.id}
                    className="cursor-pointer transition-colors hover:border-primary/40"
                    onClick={() => setDetailOrder(o)}
                  >
                    <CardContent className="pt-6">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <span className="font-semibold">
                              Pedido {orderNumber(o.number, o.revision_no)}
                            </span>
                            <Badge
                              variant={
                                logistics === "cancelado"
                                  ? "destructive"
                                  : logistics === "entregue"
                                    ? "default"
                                    : "secondary"
                              }
                            >
                              {LOGISTICS_LABEL[logistics]}
                            </Badge>
                            {(st === "atrasado" || st === "risco") && (
                              <Badge variant={stateTone(st)}>
                                {st === "atrasado" ? "Atrasado" : "Risco de atrasar"}
                              </Badge>
                            )}
                            {late > 0 && (
                              <span className="text-xs text-destructive">
                                {late} dia(s) de atraso
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {o.delivery_recipient_name ?? "Destinatário não informado"} · ordem
                            gerada em {formatDate(o.order_date ?? o.created_at)} · prazo{" "}
                            {o.delivery_deadline ? formatDate(o.delivery_deadline) : "não definido"}
                            {Number(o.grace_days ?? 0) > 0 ? ` (+${o.grace_days} dias)` : ""}
                            {o.delivered_at ? ` · chegou em ${formatDate(o.delivered_at)}` : ""}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            CPF/documento: {formatRecipientDocument(o.delivery_recipient_document)}
                          </p>
                          {o.tracking_enabled && (
                            <p className="mt-1 text-sm">
                              <MapPin className="mr-1 inline size-4 text-muted-foreground" />
                              {evs[0]?.location || o.address || "sem localização informada"}
                              {o.carrier ? ` · ${o.carrier}` : ""}
                              {o.tracking_code ? ` · ${o.tracking_code}` : ""}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          {(isAdmin || canManage) && (
                            <div
                              className="flex items-center gap-2"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <Switch
                                id={`t-${o.id}`}
                                checked={!!o.tracking_enabled}
                                onCheckedChange={(v) => toggleTracking(o, v)}
                              />
                              <Label htmlFor={`t-${o.id}`} className="text-sm">
                                Permitir visualização do rastreio
                              </Label>
                            </div>
                          )}
                          {(canManage || isAdmin) && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(event) => {
                                event.stopPropagation();
                                setOpenOrder(o);
                                setEvStatus(logisticsStage(o));
                                setEvLocation(evs[0]?.location || "");
                              }}
                            >
                              <Plus className="mr-1.5 size-4" /> Movimentação
                            </Button>
                          )}
                        </div>
                      </div>

                      {o.delivery_issue && (
                        <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                          Problema registrado: {o.delivery_issue}
                        </p>
                      )}
                      {o.tracking_enabled && evs.length > 0 && (
                        <div className="mt-4 border-t pt-4">
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            {[...evs].reverse().map((e: any, index: number, timeline: any[]) => (
                              <div
                                key={e.id}
                                className="relative rounded-xl border bg-muted/20 p-3"
                              >
                                <div className="mb-2 flex items-center gap-2">
                                  <span className="grid size-7 place-items-center rounded-full bg-primary text-primary-foreground">
                                    {index === timeline.length - 1 && e.status === "entregue" ? (
                                      <CircleCheck className="size-4" />
                                    ) : (
                                      <Truck className="size-4" />
                                    )}
                                  </span>
                                  <span className="text-xs font-semibold">
                                    {EVENT_STATUS.find((s) => s.value === e.status)?.label ??
                                      e.status}
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {formatDateTime(e.happened_at)}
                                </p>
                                {e.location && (
                                  <p className="mt-1 text-xs">
                                    <MapPin className="mr-1 inline size-3" />
                                    {e.location}
                                  </p>
                                )}
                                {e.distance_remaining_km != null && (
                                  <p className="mt-1 text-xs font-medium">
                                    A {Number(e.distance_remaining_km).toLocaleString("pt-BR")} km
                                    do destino
                                  </p>
                                )}
                                {e.estimated_arrival_at && (
                                  <p className="text-xs text-muted-foreground">
                                    Previsão: {formatDateTime(e.estimated_arrival_at)}
                                  </p>
                                )}
                                {e.notes && (
                                  <p className="mt-1 text-xs text-muted-foreground">{e.notes}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!openOrder} onOpenChange={(v) => !v && setOpenOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova movimentação</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Situação</Label>
              <Select value={evStatus} onValueChange={setEvStatus}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_STATUS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Onde está</Label>
              <Input
                className="mt-1.5"
                value={evLocation}
                onChange={(e) => setEvLocation(e.target.value)}
                placeholder="Ex.: Centro de distribuição São Paulo"
              />
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea
                className="mt-1.5"
                value={evNotes}
                onChange={(e) => setEvNotes(e.target.value)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Distância restante (km)</Label>
                <Input
                  className="mt-1.5"
                  inputMode="decimal"
                  value={evDistance}
                  onChange={(e) => setEvDistance(e.target.value)}
                  placeholder="Ex.: 42"
                />
              </div>
              <div>
                <Label>Nova previsão</Label>
                <Input
                  className="mt-1.5"
                  type="datetime-local"
                  value={evEta}
                  onChange={(e) => setEvEta(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenOrder(null)}>
              Cancelar
            </Button>
            <Button onClick={addEvent} disabled={saving}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />} Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={scannerOpen} onOpenChange={setScannerOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Ler QR Code da entrega</DialogTitle>
          </DialogHeader>
          <DeliveryQrScanner
            active={scannerOpen}
            onToken={confirmScannedToken}
            onInvalid={invalidQr}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!detailOrder} onOpenChange={(value) => !value && setDetailOrder(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Ordem de entrega {orderNumber(detailOrder?.number, detailOrder?.revision_no)}
            </DialogTitle>
          </DialogHeader>
          {detailOrder && (
            <div className="space-y-4">
              <div className="grid gap-3 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Quem receberá</p>
                  <p className="font-medium">
                    {detailOrder.delivery_recipient_name ?? "Não informado"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    CPF/documento:{" "}
                    {formatRecipientDocument(detailOrder.delivery_recipient_document)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Retirar em</p>
                  <p className="font-medium">
                    {[
                      warehouseOf(detailOrder)?.name,
                      warehouseOf(detailOrder)?.address,
                      warehouseOf(detailOrder)?.city,
                      warehouseOf(detailOrder)?.state,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Estoque não informado"}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs text-muted-foreground">Endereço de entrega</p>
                  <p className="font-medium">
                    {[detailOrder.shipping_address, detailOrder.shipping_address_number]
                      .filter(Boolean)
                      .join(", ") || "Não informado"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">CEP</p>
                  <p className="font-medium">
                    {detailOrder.shipping_cep
                      ? formatCep(detailOrder.shipping_cep)
                      : "Não informado"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Cidade e estado</p>
                  <p className="font-medium">
                    {[detailOrder.shipping_city, detailOrder.shipping_state]
                      .filter(Boolean)
                      .join(" · ") || "Não informado"}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs text-muted-foreground">Observações</p>
                  <p className="whitespace-pre-wrap font-medium">
                    {detailOrder.notes || "Nenhuma observação"}
                  </p>
                </div>
              </div>
              {detailOrder.delivery_token && (
                <DeliveryQr
                  token={detailOrder.delivery_token}
                  number={detailOrder.number}
                  compact
                />
              )}
              <div className="overflow-hidden rounded-lg border">
                <div className="grid grid-cols-[1fr_auto] gap-3 bg-muted px-4 py-2 text-sm font-medium">
                  <span>Produto</span>
                  <span>Quantidade</span>
                </div>
                {itemsOf(detailOrder.id).map((item: any) => (
                  <div
                    key={`${item.order_id}-${item.description}`}
                    className="grid grid-cols-[1fr_auto] gap-3 border-t px-4 py-3 text-sm"
                  >
                    <span>{item.description}</span>
                    <span className="font-medium">
                      {Number(item.quantity ?? 0).toLocaleString("pt-BR")} {item.unit ?? "UN"}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {logisticsStage(detailOrder) !== "entregue" &&
                  logisticsStage(detailOrder) !== "cancelado" && (
                    <Button onClick={() => void markDelivered(detailOrder.id)} disabled={saving}>
                      {saving ? (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                      ) : (
                        <PackageCheck className="mr-2 size-4" />
                      )}
                      Marcar como entregue
                    </Button>
                  )}
                <Button variant="outline" onClick={() => void copyDeliveryLink(detailOrder)}>
                  <Link2 className="mr-2 size-4" /> Gerar link
                </Button>
                <Button
                  onClick={() => void downloadDelivery(detailOrder)}
                  disabled={generatingPdfId === detailOrder.id}
                >
                  {generatingPdfId === detailOrder.id ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 size-4" />
                  )}
                  Gerar PDF
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
