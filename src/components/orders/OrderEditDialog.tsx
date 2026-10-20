import { useCurrentUser } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
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
  return orderId ? <OrderEditor key={orderId} orderId={orderId} onClose={onClose} /> : null;
}

function OrderEditor({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const actor = useCurrentUser();
  const permissions = usePermissions();
  // Match the server seller boundary even when another job grants company_sales.
  const restrictedSeller = actor.roles.includes("vendedor") && !actor.isAdmin;
  const broadSales = !restrictedSeller && (actor.isAdmin || permissions.seesCompanySales);
  const client = useQueryClient(),
    [form, setForm] = useState<any>(null),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [requestId] = useState(() => crypto.randomUUID());
  const [selectedProductId, setSelectedProductId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [createdCustomers, setCreatedCustomers] = useState<{ id: string; name: string }[]>([]);
  const query = useQuery({
    queryKey: ["order-editor", orderId, actor.userId, broadSales],
    enabled: !!orderId && !actor.loading && !permissions.loading && !actor.viewAs,
    queryFn: async () => {
      const r = await (supabase as any).rpc("division_order_context", { p_order_id: orderId });
      if (r.error) throw r.error;
      const [catalog, customers, warehouses] = await Promise.all(
        broadSales
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
      if (warehouses.error) throw warehouses.error;
      r.data.catalog = broadSales ? catalog.data : catalog.data.items;
      r.data.customers = customers.data ?? [];
      r.data.warehouses = broadSales ? (warehouses.data ?? []) : (catalog.data.warehouses ?? []);
      return r.data;
    },
  });
  const customersForSelection = [
    ...(query.data?.customers ?? []),
    ...createdCustomers.filter(
      (created) => !(query.data?.customers ?? []).some((customer: any) => customer.id === created.id),
    ),
  ];

  async function registerCustomer() {
    if (creatingCustomer || busy || !query.data?.can_edit || actor.viewAs) return;
    const name = newCustomerName.trim();
    const phone = newCustomerPhone.trim();
    const email = newCustomerEmail.trim();
    if (!name || name.length > 150 || phone.length > 80 || email.length > 254) {
      toast.error("Informe um nome válido (até 150 caracteres) e confira telefone e e-mail.");
      return;
    }
    setCreatingCustomer(true);
    try {
      let id: string;
      if (broadSales) {
        const result = await (supabase as any)
          .from("customers")
          .insert({
            name,
            phone: phone || null,
            whatsapp: phone || null,
            email: email || null,
            created_by: actor.userId,
            origin: "Edição de pedido",
          })
          .select("id")
          .single();
        if (result.error) throw result.error;
        id = result.data.id;
      } else {
        const result = await (supabase as any).rpc("integral_seller_create_customer", {
          p_name: name,
          p_phone: phone || null,
          p_email: email || null,
        });
        if (result.error) throw result.error;
        id = result.data;
      }
      setCreatedCustomers((current) => [...current, { id, name }]);
      setForm((current: any) => ({ ...current, customer_id: id }));
      setShowNewCustomer(false);
      setNewCustomerName("");
      setNewCustomerPhone("");
      setNewCustomerEmail("");
      toast.success("Cliente cadastrado. Envie a alteração para aprovação e vinculação ao pedido.");
      void client.invalidateQueries({ queryKey: ["estadual-seller-customers"] });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setCreatingCustomer(false);
    }
  }

  // Cached data must initialize a newly opened editor too. Background refetches
  // must not overwrite changes the user is typing.
  useEffect(() => {
    if (query.data)
      setForm(
        (current: any) =>
          current ?? {
            ...query.data.order,
            items: query.data.items.map((item: any) => ({ ...item })),
          },
      );
  }, [query.data]);
  async function save() {
    if (!form || busy || actor.viewAs || !query.data?.can_edit) return;
    if (
      !form.items.length ||
      form.items.some(
        (item: any) =>
          !Number.isFinite(Number(item.quantity)) ||
          Number(item.quantity) <= 0 ||
          !Number.isFinite(Number(item.unit_price)) ||
          Number(item.unit_price) < 0 ||
          !Number.isFinite(Number(item.discount ?? 0)) ||
          Number(item.discount ?? 0) < 0 ||
          Number(item.discount ?? 0) > Number(item.quantity) * Number(item.unit_price),
      )
    )
      return void toast.error("Confira quantidades, preços e descontos dos produtos.");
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
  function addProduct() {
    if (!form || !query.data || busy || !query.data.can_edit) return;
                    const item = query.data.catalog.find((i: any) => i.id === selectedProductId);
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
                        commission_percent: Number(item.commission_percent ?? 5),
                        max_discount_percent: Number(item.max_discount_percent ?? 0),
                      },
                    ]);
                    setSelectedProductId("");
                    setProductSearch("");
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
            {query.data?.requires_approval || form?.approval_status === "approved"
              ? "Solicitar alteração"
              : "Editar pedido"}{" "}
            #{form?.number}
          </DialogTitle>
        </DialogHeader>
        {actor.viewAs ? (
          <p role="status">Saia do modo espelho para editar um pedido.</p>
        ) : query.isLoading || (query.data && !form) ? (
          <p>Carregando os dados atuais…</p>
        ) : query.error ? (
          <p role="alert">{(query.error as Error).message}</p>
        ) : (
          form && (
            <div className="space-y-4">
              <p>
                Cliente:{" "}
                {form.customer_id
                  ? (customersForSelection.find((customer: any) => customer.id === form.customer_id)
                      ?.name ??
                    query.data.customer?.name ??
                    "Cliente identificado")
                  : "Venda balcão"}{" "}
                · Estoque: {query.data.warehouse?.name ?? "Não definido"}
              </p>
              {(query.data.requires_approval || form.approval_status === "approved") && (
                <p className="rounded-lg border p-3 text-sm">
                  As alterações e os novos produtos só serão aplicados após aprovação administrativa.
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
                    {form.customer_id &&
                      !customersForSelection.some((c: any) => c.id === form.customer_id) && (
                        <option value={form.customer_id}>
                          {query.data.customer?.name ?? "Cliente atual"}
                        </option>
                      )}
                    {customersForSelection.map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2 w-fit"
                    disabled={busy || creatingCustomer || !query.data.can_edit}
                    onClick={() => setShowNewCustomer((open) => !open)}
                  >
                    {showNewCustomer ? "Cancelar cadastro" : "Cadastrar novo cliente"}
                  </Button>
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
              {showNewCustomer && (
                <div className="space-y-3 rounded-lg border p-3">
                  <p className="text-sm font-semibold">Identificar a venda balcão</p>
                  <p className="text-xs text-muted-foreground">
                    O cadastro do cliente é independente. O pedido só será vinculado após
                    enviar a alteração e obter a aprovação administrativa.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="grid gap-1 text-sm">
                      Nome completo
                      <Input
                        value={newCustomerName}
                        maxLength={150}
                        onChange={(event) => setNewCustomerName(event.target.value)}
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      Telefone
                      <Input
                        value={newCustomerPhone}
                        maxLength={80}
                        onChange={(event) => setNewCustomerPhone(event.target.value)}
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      E-mail
                      <Input
                        type="email"
                        value={newCustomerEmail}
                        maxLength={254}
                        onChange={(event) => setNewCustomerEmail(event.target.value)}
                      />
                    </label>
                  </div>
                  <Button
                    type="button"
                    disabled={busy || creatingCustomer || !query.data.can_edit || !newCustomerName.trim()}
                    onClick={() => void registerCustomer()}
                  >
                    {creatingCustomer ? "Cadastrando…" : "Cadastrar e selecionar cliente"}
                  </Button>
                </div>
              )}
              <fieldset className="space-y-3 rounded-lg border p-3" disabled={busy || !query.data.can_edit}>
                <legend className="px-1 text-sm font-semibold">Adicionar novo produto</legend>
                <label className="grid gap-1 text-sm">
                  Buscar produto por nome ou código
                  <Input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Digite o nome ou código do produto" />
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <label className="grid min-w-0 flex-1 gap-1 text-sm">
                    Produtos liberados
                    <select
                      className="min-w-0 rounded-md border bg-background p-2"
                      value={selectedProductId}
                      onChange={(event) => setSelectedProductId(event.target.value)}
                    >
                      <option value="">Selecione um novo produto</option>
                      {query.data.catalog.filter((item: any) =>
                        !form.items.some((line: any) => line.item_id === item.id) &&
                        `${item.name} ${item.sku ?? ""}`.toLocaleLowerCase("pt-BR").includes(productSearch.trim().toLocaleLowerCase("pt-BR"))
                      ).map((item: any) => (
                        <option key={item.id} value={item.id}>{item.name}{item.sku ? ` · ${item.sku}` : ""}</option>
                      ))}
                    </select>
                  </label>
                  <Button className="self-end" disabled={!selectedProductId || busy || !query.data.can_edit} onClick={addProduct}>Adicionar ao pedido</Button>
                </div>
                <p className="text-xs text-muted-foreground">O novo produto será incluído abaixo. Confira quantidade e preço antes de enviar a solicitação.</p>
              </fieldset>
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
                    ["carrier", "Transportadora"],
                    ["tracking_code", "Código de rastreio"],
                    ["notes", "Observações"],
                  ] as [string, string][]
                ).map(([key, label]) => (
                  <label className="grid gap-1 text-sm" key={key}>
                    {label}
                    <Input value={form[key] ?? ""} onChange={(e) => change(key, e.target.value)} />
                  </label>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ["order_date", "Data do pedido"],
                    ["delivery_deadline", "Prazo de entrega"],
                  ] as const
                ).map(([key, label]) => (
                  <label className="grid gap-1 text-sm" key={key}>
                    {label}
                    <Input
                      type="date"
                      value={form[key] ?? ""}
                      onChange={(event) => change(key, event.target.value || null)}
                    />
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
          <Button
            disabled={busy || creatingCustomer || !form || !!query.error || !!actor.viewAs || !query.data?.can_edit}
            onClick={save}
          >
            {busy
              ? "Salvando…"
              : query.data?.requires_approval || form?.approval_status === "approved"
                ? "Enviar solicitação"
                : "Salvar alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
