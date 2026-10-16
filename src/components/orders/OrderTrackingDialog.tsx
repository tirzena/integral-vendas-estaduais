import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Package, Copy, Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Tracking = {
  can_edit: boolean;
  number: number;
  revision_no: number;
  tracking_code: string | null;
  carrier: string | null;
  created_at: string;
  delivered_at: string | null;
  workflow_stage: string;
  fulfillment_status: string;
  approval_status: string;
  events: {
    id: string;
    status: string;
    location: string | null;
    notes: string | null;
    happened_at: string;
  }[];
  history: {
    id: string;
    actor: string | null;
    note: string;
    created_at: string;
    tracking_code: string | null;
    carrier: string | null;
  }[];
};
async function request(
  orderId: string,
  save = false,
  code?: string,
  carrier?: string,
): Promise<Tracking> {
  const { data, error } = await (
    supabase.rpc as unknown as (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: Tracking; error: Error | null }>
  )("integral_order_tracking", {
    p_order_id: orderId,
    p_save: save,
    p_code: code ?? null,
    p_carrier: carrier ?? null,
  });
  if (error) throw error;
  return data;
}
const labels: Record<string, string> = {
  em_caminho: "Em caminho",
  entregue: "Entregue",
  preparando: "Em preparação",
  a_preparar: "A preparar",
  separado: "Separado",
  coletado: "Coletado",
  aprovado: "Aprovado",
  pending: "Em análise",
  approved: "Aprovado",
  rejected: "Reprovado",
  changes_requested: "Ajuste solicitado",
  saiu_para_entrega: "Saiu para entrega",
  perdido: "Produto perdido",
  cancelado: "Cancelado",
};
const date = (value: string) =>
  new Date(value.length === 10 ? value + "T12:00:00" : value).toLocaleString(
    "pt-BR",
    value.length === 10 ? { dateStyle: "short" } : { dateStyle: "short", timeStyle: "short" },
  );
export function OrderTrackingDialog({
  orderId,
  onClose,
}: {
  orderId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["order-tracking", orderId],
    queryFn: () => request(orderId),
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="size-5" />
            Código de rastreio
          </DialogTitle>
          <DialogDescription>
            Consulte o andamento do pedido e o código vinculado à entrega.
          </DialogDescription>
        </DialogHeader>
        {query.isLoading ? (
          <p>Carregando rastreio…</p>
        ) : query.isError ? (
          <p role="alert">
            Não foi possível consultar o rastreio.{" "}
            <Button variant="link" onClick={() => query.refetch()}>
              Tentar novamente
            </Button>
          </p>
        ) : (
          query.data && (
            <TrackingContent
              key={query.data.tracking_code + "|" + query.data.carrier}
              data={query.data}
              orderId={orderId}
              onSaved={async () => {
                await query.refetch();
                await qc.invalidateQueries();
              }}
            />
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
function TrackingContent({
  data,
  orderId,
  onSaved,
}: {
  data: Tracking;
  orderId: string;
  onSaved: () => Promise<void>;
}) {
  const [code, setCode] = useState(data.tracking_code ?? "");
  const [carrier, setCarrier] = useState(data.carrier ?? "");
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      await request(orderId, true, code, carrier);
      await onSaved();
      toast.success("Rastreio atualizado.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-muted/50 p-4">
        <p className="text-sm text-muted-foreground">
          Pedido #{data.number}
          {data.revision_no > 0 ? "." + data.revision_no : ""}
        </p>
        <p className="font-semibold">
          {labels[data.fulfillment_status] ?? labels[data.workflow_stage] ?? data.workflow_stage}
        </p>
      </div>
      <div className="space-y-3 rounded-xl border p-4">
        <div>
          <Label htmlFor="tracking-carrier">Transportadora</Label>
          <Input
            id="tracking-carrier"
            maxLength={150}
            value={carrier}
            readOnly={!data.can_edit}
            onChange={(e) => setCarrier(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="tracking-code">Código de rastreio</Label>
          <Input
            id="tracking-code"
            maxLength={150}
            value={code}
            readOnly={!data.can_edit}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Informe o código da entrega"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {data.can_edit && (
            <Button disabled={saving} onClick={save}>
              {saving ? "Salvando…" : "Salvar código"}
            </Button>
          )}
          {data.tracking_code && (
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(data.tracking_code!);
                  toast.success("Código copiado.");
                } catch {
                  toast.error("Não foi possível copiar.");
                }
              }}
            >
              <Copy className="mr-2 size-4" />
              Copiar código
            </Button>
          )}
        </div>
        {data.tracking_code && (
          <p className="text-xs text-muted-foreground">
            Use este código na consulta da transportadora. O histórico abaixo reúne as movimentações
            registradas no sistema.
          </p>
        )}
      </div>
      <section>
        <h3 className="mb-3 font-semibold">Caminho do pedido</h3>
        <ol className="ml-2 space-y-4 border-l-2 border-primary/25 pl-5">
          <li className="relative">
            <Package className="absolute -left-8 size-5 rounded-full bg-background text-primary" />
            <p className="font-medium">Pedido criado</p>
            <p className="text-xs text-muted-foreground">{date(data.created_at)}</p>
          </li>
          <li>
            <p className="font-medium">
              Revisão: {labels[data.approval_status] ?? data.approval_status}
            </p>
          </li>
          {data.events.map((event) => (
            <li key={event.id}>
              <p className="font-medium">{labels[event.status] ?? event.status}</p>
              <p className="text-xs text-muted-foreground">
                {date(event.happened_at)}
                {event.location ? " · " + event.location : ""}
              </p>
              {event.notes && <p className="text-sm">{event.notes}</p>}
            </li>
          ))}
          {data.delivered_at && (
            <li>
              <p className="font-medium text-emerald-600">Entregue</p>
              <p className="text-xs text-muted-foreground">{date(data.delivered_at)}</p>
            </li>
          )}
          {!data.events.length && !data.delivered_at && (
            <li className="text-sm text-muted-foreground">
              Ainda não há movimentações de transporte registradas.
            </li>
          )}
        </ol>
      </section>
      {!!data.history.length && (
        <details className="rounded-xl border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Histórico dos códigos ({data.history.length})
          </summary>
          <ul className="mt-3 space-y-3 text-sm">
            {data.history.map((h) => (
              <li key={h.id}>
                <p>
                  {h.tracking_code ?? "Código removido"}
                  {h.carrier ? " · " + h.carrier : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {h.actor ?? "Membro"} · {date(h.created_at)}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
