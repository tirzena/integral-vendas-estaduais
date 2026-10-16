/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOperationalAccess } from "@/hooks/useOperationalAccess";
import { useCurrentUser } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function LogisticsConsole() {
  const access = useOperationalAccess();
  const { userId } = useCurrentUser();
  const client = useQueryClient();
  const [page, setPage] = useState(0),
    [selected, setSelected] = useState<any>(null),
    [cost, setCost] = useState(""),
    [costCurrency, setCostCurrency] = useState("BRL"),
    [costNote, setCostNote] = useState(""),
    [carrier, setCarrier] = useState(""),
    [tracking, setTracking] = useState(""),
    [event, setEvent] = useState("tracking"),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ["logistics-console", userId, page],
    enabled: access.dispatch || access.logistics,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("integral_logistics_orders", {
        p_offset: page * 50,
        p_limit: 50,
      });
      if (error) throw error;
      return data as any[];
    },
  });
  function open(order: any) {
    setSelected(order);
    setCost(order.transport_cost == null ? "" : String(order.transport_cost));
    setCostCurrency(order.transport_currency ?? order.base_currency ?? "BRL");
    setCostNote("");
    setCarrier(order.carrier ?? "");
    setTracking(order.tracking_code ?? "");
    setEvent("tracking");
    setNote("");
  }
  async function save() {
    if (!selected || busy) return;
    if (note.trim().length < 5) return void toast.error("Descreva a movimentação realizada.");
    setBusy(true);
    try {
      const { error } = await (supabase as any).rpc("integral_update_dispatch", {
        p_order: selected.id,
        p_carrier: carrier,
        p_tracking: tracking,
        p_event: event,
        p_note: note,
      });
      if (error) throw error;
      await client.invalidateQueries();
      setSelected(null);
      toast.success("Movimentação registrada. Vendedor e responsáveis notificados.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function requestReplacement() {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const { data, error } = await (supabase as any).rpc("remuneration_duplicate_lost_order", { p_order: selected.id });
      if (error) throw error;
      await client.invalidateQueries();
      setSelected(null);
      toast.success(`Reposição solicitada no pedido #${data.number}. Aguardando aprovação financeira.`);
    } catch (error) { toast.error((error as Error).message); }
    finally { setBusy(false); }
  }
  async function saveCost() {
    if (!selected || busy) return;
    const amount = Number(cost);
    if (!cost.trim() || !Number.isFinite(amount) || amount < 0 || costNote.trim().length < 5)
      return void toast.error("Informe o custo do transporte, a moeda e a justificativa.");
    setBusy(true);
    try {
      const { error } = await (supabase as any).rpc("integral_record_transport_cost", {
        p_order: selected.id, p_amount: amount, p_currency: costCurrency, p_note: costNote,
      });
      if (error) throw error;
      await client.invalidateQueries();
      setSelected(null);
      toast.success("Custo do transporte registrado no histórico.");
    } catch (error) { toast.error((error as Error).message); }
    finally { setBusy(false); }
  }
  if (access.isLoading) return <p>Conferindo acesso à logística…</p>;
  if (!access.dispatch && !access.logistics) return null;
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Despacho e logística</h2>
        <p className="text-sm text-muted-foreground">
          Pedidos liberados para a operação. Atualize transportadora, rastreio e movimentações,
          mantendo o histórico de cada responsável.
        </p>
      </div>
      {query.isLoading ? (
        <p>Carregando pedidos aprovados…</p>
      ) : query.error ? (
        <p role="alert">Não foi possível carregar os pedidos: {(query.error as Error).message}</p>
      ) : (
        <div className="space-y-3">
          {!query.data?.length && (
            <p className="surface-card p-6 text-muted-foreground">
              Nenhum pedido liberado nesta página.
            </p>
          )}
          {query.data?.map((o) => (
            <article
              key={o.id}
              className="surface-card flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <div>
                <p className="font-semibold">
                  Pedido #{o.number} ·{" "}
                  {o.customer_name || o.delivery_recipient_name || "Destinatário"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {o.shipping_city} / {o.shipping_state} ·{" "}
                  {o.fulfillment_status === "perdido"
                    ? "Mercadoria perdida"
                    : o.fulfillment_status === "entregue"
                      ? "Entregue"
                      : o.fulfillment_status === "a_caminho"
                        ? "Em transporte"
                        : "A preparar"}
                </p>
                <p className="text-sm">Rastreio: {o.tracking_code || "Não informado"}</p>
              </div>
              <Button variant="outline" onClick={() => open(o)}>
                Abrir operação
              </Button>
            </article>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between">
        <Button variant="outline" disabled={!page} onClick={() => setPage(page - 1)}>
          Anterior
        </Button>
        <span className="text-sm">Página {page + 1}</span>
        <Button
          variant="outline"
          disabled={(query.data?.length ?? 0) < 50}
          onClick={() => setPage(page + 1)}
        >
          Próxima
        </Button>
      </div>
      <Dialog
        open={!!selected}
        onOpenChange={(v) => {
          if (!v && !busy) setSelected(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Operação do pedido #{selected?.number}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3">
              <p className="font-medium">
                {selected.delivery_recipient_name || selected.customer_name}
              </p>
              <p className="text-sm">
                {[
                  selected.shipping_address,
                  selected.shipping_address_number,
                  selected.shipping_city,
                  selected.shipping_state,
                  selected.shipping_cep,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </p>
              <p className="rounded-md bg-muted p-3 text-sm">{selected.items}</p>
              {access.logistics && <section className="space-y-3 rounded-md border p-3">
                <h3 className="font-medium">Custo do transporte para a empresa</h3>
                <p className="text-xs text-muted-foreground">Registre o custo contratado com a transportadora. O frete cobrado do cliente é conferido no pedido.</p>
                <label className="grid gap-1 text-sm">Valor<Input type="number" min={0} step="0.01" value={cost} disabled={busy} onChange={(event) => setCost(event.target.value)} /></label>
                <label className="grid gap-1 text-sm">Moeda<select className="h-10 rounded-md border bg-background px-3" value={costCurrency} disabled={busy} onChange={(event) => setCostCurrency(event.target.value)}><option value="BRL">Real</option><option value="USD">Dólar</option><option value="PYG">Guarani</option></select></label>
                <label className="grid gap-1 text-sm">Justificativa<Input value={costNote} disabled={busy} onChange={(event) => setCostNote(event.target.value)} /></label>
                <Button variant="outline" disabled={busy} onClick={saveCost}>Registrar custo do transporte</Button>
              </section>}

              {selected.fulfillment_status === "perdido" ? (
                <div className="space-y-2"><p className="text-sm text-destructive">A perda está registrada. A reposição segue para aprovação antes da saída de estoque.</p>{access.logistics && <Button variant="outline" disabled={busy} onClick={requestReplacement}>Duplicar nota para reposição</Button>}</div>
              ) : (
                <>
                  <label className="grid gap-1 text-sm">
                    Transportadora
                    <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Código de rastreio
                    <Input value={tracking} onChange={(e) => setTracking(e.target.value)} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Movimentação
                    <select
                      className="h-10 rounded-md border bg-background px-3"
                      value={event}
                      onChange={(e) => setEvent(e.target.value)}
                    >
                      <option value="tracking">Atualizar rastreio</option>
                      <option value="dispatch">Registrar despacho</option>
                      {access.logistics && (
                        <>
                          <option value="delivered">Confirmar entrega</option>
                          <option value="lost">Registrar perda</option>
                        </>
                      )}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm">
                    Observação e justificativa
                    <Input value={note} onChange={(e) => setNote(e.target.value)} />
                  </label>
                  <Button disabled={busy} onClick={save}>
                    {busy ? "Registrando…" : "Registrar movimentação"}
                  </Button>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
