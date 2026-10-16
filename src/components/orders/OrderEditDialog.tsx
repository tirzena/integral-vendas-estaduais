import { useCurrentUser } from "@/hooks/useAuth";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export function OrderEditDialog({
  orderId,
  onClose,
}: {
  orderId: string | null;
  onClose: () => void;
}) {
  const actor = useCurrentUser();
  const client = useQueryClient(),
    [form, setForm] = useState<any>(null),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [requestId] = useState(() => crypto.randomUUID());
  const query = useQuery({
    queryKey: ["order-editor", orderId, actor.userId, actor.isAdmin],
    enabled: !!orderId && !actor.loading,
    queryFn: async () => {
      const r = await (supabase as any).rpc("integral_order_context", { p_order_id: orderId });
      if (r.error) throw r.error;
      const [catalog, customers, warehouses] = await Promise.all(
        actor.isAdmin
          ? [
              (supabase as any).rpc("sales_items_for_sale"),
              (supabase as any).from("customers").select("id,name").is("deleted_at", null),
              (supabase as any).rpc("sales_warehouses"),
            ]
          : [
              (supabase as any).rpc("seller_portal_data"),
              (supabase as any).rpc("estadual_seller_customers"),
              Promise.resolve({ data: [], error: null }),
            ],
      );
      if (catalog.error) throw catalog.error;
      if (customers.error) throw customers.error;
      r.data.catalog = actor.isAdmin ? catalog.data : catalog.data.items;
      r.data.customers = customers.data ?? [];
      r.data.warehouses = actor.isAdmin ? (warehouses.data ?? []) : (catalog.data.warehouses ?? []);
      const next = { ...r.data.order, items: r.data.items.map((i: any) => ({ ...i })) };
      setForm(next);
      return r.data;
    },
  });
  async function save() {
    if (!form || busy) return;
    if (reason.trim().length < 5)
      return void toast.error("Descreva a alteração com pelo menos 5 caracteres.");
    setBusy(true);
    try {
      const args = {
        p_previous_order_id: orderId,
        p_customer_id: form.customer_id,
        p_product_id: form.product_id,
        p_currency: form.currency,
        p_discount: Number(form.discount ?? 0),
        p_shipping_cost: Number(form.shipping_cost ?? 0),
        p_shipping_percentage: form.shipping_percentage,
        p_notes: form.notes,
        p_whatsapp: form.whatsapp,
        p_items: form.items.map((i: any) => ({
          item_id: i.item_id,
          description: i.description,
          sku: i.sku,
          barcode: i.barcode,
          unit: i.unit,
          quantity: Number(i.quantity),
          unit_price: Number(i.unit_price),
          discount: Number(i.discount ?? 0),
          commission_enabled: i.commission_enabled,
          commission_percent: i.commission_percent,
          max_discount_percent: i.max_discount_percent,
        })),
        p_warehouse_id: form.warehouse_id,
        p_shipping_address: form.shipping_address,
        p_shipping_city: form.shipping_city,
        p_shipping_state: form.shipping_state,
        p_delivery_deadline: form.delivery_deadline,
        p_carrier: form.carrier,
        p_tracking_code: form.tracking_code,
        p_revision_note: reason.trim(),
      };
      const follow = {
        delivery_recipient_name: form.delivery_recipient_name ?? "",
        delivery_recipient_document: form.delivery_recipient_document ?? "",
        shipping_cep: form.shipping_cep ?? "",
        variable_cost: Number(form.variable_cost ?? 0),
        seller_id: form.seller_id,
        order_date: form.order_date,
        delivery_deadline: form.delivery_deadline,
        delivered_at: form.delivered_at,
        shipping_country: form.shipping_country ?? "Brasil",
        shipping_address_number: form.shipping_address_number ?? "",
      };
      const r = await (supabase as any).rpc("integral_submit_order_edit", {
        p_args: args,
        p_followup: follow,
        p_exchange: null,
        p_reason: reason.trim(),
        p_request_id: requestId,
      });
      if (r.error) throw r.error;
      toast.success(
        r.data.pending_approval
          ? "Solicitação enviada para aprovação. O pedido permanece inalterado."
          : r.data.awaiting_approval
            ? "Pedido reenviado para aprovação. Acompanhe o status nos detalhes."
            : "Alterações salvas e auditadas.",
      );
      await client.invalidateQueries();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const change = (key: string, value: any) => setForm({ ...form, [key]: value });
  return (
    <Dialog
      open={!!orderId}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {query.data?.requires_approval ? "Solicitar alteração" : "Editar pedido"} #
            {form?.number}
          </DialogTitle>
        </DialogHeader>
        {query.isLoading ? (
          <p>Carregando os dados atuais…</p>
        ) : query.error ? (
          <p role="alert">{(query.error as Error).message}</p>
        ) : (
          form && (
            <div className="space-y-4">
              <p>
                Cliente: {query.data.customer?.name ?? "Venda balcão"} · Estoque:{" "}
                {query.data.warehouse?.name ?? "Não definido"}
              </p>
              {query.data.requires_approval && (
                <p className="rounded-lg border p-3 text-sm">
                  Este pedido tem pagamento confirmado ou envio iniciado. As alterações só serão
                  aplicadas após aprovação administrativa.
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  Cliente
                  <select
                    className="rounded-md border bg-background p-2"
                    value={form.customer_id ?? ""}
                    onChange={(e) => change("customer_id", e.target.value || null)}
                  >
                    <option value="">Venda balcão</option>
                    {query.data.customers.map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  Estoque de origem
                  <select
                    className="rounded-md border bg-background p-2"
                    value={form.warehouse_id ?? ""}
                    onChange={(e) => change("warehouse_id", e.target.value)}
                  >
                    {[query.data.warehouse, ...query.data.warehouses]
                      .filter(
                        (w: any, i: number, rows: any[]) =>
                          w?.id && rows.findIndex((r) => r?.id === w.id) === i,
                      )
                      .map((w: any) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              <label className="grid gap-1 text-sm">
                Adicionar produto concedido
                <select
                  className="rounded-md border bg-background p-2"
                  value=""
                  onChange={(e) => {
                    const item = query.data.catalog.find((i: any) => i.id === e.target.value);
                    if (!item) return;
                    if (form.items.some((i: any) => i.item_id === item.id))
                      return void toast.error("O produto já está no pedido.");
                    const rate = Number(
                      query.data.exchange_rates_snapshot?.[item.currency] ??
                        (item.currency === form.currency ? 1 : 0),
                    );
                    if (!(rate > 0)) return void toast.error("Cotação do produto indisponível.");
                    change("items", [
                      ...form.items,
                      {
                        id: crypto.randomUUID(),
                        item_id: item.id,
                        description: item.name,
                        sku: item.sku,
                        barcode: item.barcode,
                        unit: item.unit ?? "UN",
                        quantity: 1,
                        unit_price: Math.round((Number(item.price) / rate) * 100) / 100,
                        discount: 0,
                        commission_enabled: true,
                        commission_percent: 5,
                      },
                    ]);
                  }}
                >
                  <option value="">Selecione um produto</option>
                  {query.data.catalog.map((item: any) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-left">Produto</th>
                      <th>Quantidade</th>
                      <th>Preço unitário</th>
                      <th>Desconto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.items.map((item: any, index: number) => (
                      <tr key={item.id}>
                        <td>{item.description}</td>
                        {["quantity", "unit_price", "discount"].map((key) => (
                          <td key={key}>
                            <Input
                              aria-label={`${key} ${item.description}`}
                              type="number"
                              step="0.01"
                              min="0"
                              value={item[key] ?? 0}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  items: form.items.map((old: any, i: number) =>
                                    i === index ? { ...old, [key]: e.target.value } : old,
                                  ),
                                })
                              }
                            />
                          </td>
                        ))}
                        <td>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={form.items.length === 1}
                            onClick={() =>
                              change(
                                "items",
                                form.items.filter((_: any, i: number) => i !== index),
                              )
                            }
                          >
                            Remover
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ["delivery_recipient_name", "Destinatário"],
                    ["delivery_recipient_document", "Documento"],
                    ["shipping_address", "Endereço"],
                    ["shipping_address_number", "Número"],
                    ["shipping_city", "Cidade"],
                    ["shipping_state", "UF"],
                    ["shipping_cep", "CEP"],
                    ["shipping_country", "País"],
                    ["whatsapp", "WhatsApp"],
                    ["notes", "Observações"],
                  ] as [string, string][]
                ).map(([key, label]) => (
                  <label className="grid gap-1 text-sm" key={key}>
                    {label}
                    <Input value={form[key] ?? ""} onChange={(e) => change(key, e.target.value)} />
                  </label>
                ))}
              </div>
              <label className="grid gap-1 text-sm">
                Justificativa obrigatória
                <Input value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>
            </div>
          )
        )}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={busy || !form || !!query.error} onClick={save}>
            {busy
              ? "Salvando…"
              : query.data?.requires_approval
                ? "Enviar solicitação"
                : "Salvar alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
