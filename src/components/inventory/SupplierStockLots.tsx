/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { getSupplierStock, registerSupplierLot } from "@/lib/supplier-stock.functions";
import { formatDate, formatNumber } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
const blank = () => ({
  itemId: "",
  lot: "",
  purchaseDate: new Date().toISOString().slice(0, 10),
  manufacture: "",
  expiry: "",
  quantity: "",
  unitCost: "",
  currency: "USD" as "BRL" | "USD" | "PYG",
});
export function SupplierStockLots({
  supplierId,
  warehouseId,
}: {
  supplierId?: string;
  warehouseId?: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [qr, setQr] = useState<any>(null);
  const q = useQuery({
    queryKey: ["supplier-stock", supplierId, warehouseId],
    queryFn: () => getSupplierStock({ data: { supplierId, warehouseId } }),
  });
  const create = useMutation({
    mutationFn: () =>
      registerSupplierLot({
        data: {
          ...form,
          supplierId: supplierId || q.data!.supplierId!,
          quantity: Number(form.quantity),
          unitCost: Number(form.unitCost),
          manufacture: form.manufacture + "-01",
          expiry: form.expiry + "-01",
        },
      }),
    onSuccess: async (created) => {
      setQr({
        lot_number: form.lot,
        quantity: Number(form.quantity),
        inventory_items: { name: q.data?.items.find((item: any) => item.id === form.itemId)?.name },
        batch: { id: created.batchId },
      });
      setOpen(false);
      setForm(blank());
      await qc.invalidateQueries({ queryKey: ["supplier-stock"] });
      qc.invalidateQueries({ queryKey: ["authenticity-admin"] });
      toast.success("Compra do lote registrada. Estoque, QR Code e códigos gerados.");
    },
    onError: (e) => toast.error(e.message),
  });
  if (q.isPending) return <p>Carregando lotes…</p>;
  if (q.isError) return <p role="alert">{q.error.message}</p>;
  const data = q.data;
  const rows = warehouseId ? data.receipts : data.lots;
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            {warehouseId
              ? "Lotes no estoque principal"
              : "Compras de lotes e estoque do fornecedor"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {warehouseId
              ? "Origem da compra, saldo por lote e pedidos vinculados."
              : "Registre o lote adquirido pelo fornecedor. Cada unidade terá seu próprio código, com um QR Code compartilhado pelo lote."}
          </p>
        </div>
        {!warehouseId && <Button onClick={() => setOpen(true)}>Registrar compra de lote</Button>}
      </div>
      {!rows.length && (
        <p className="rounded-xl border p-5 text-muted-foreground">Nenhum lote registrado.</p>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {rows.map((row: any) => {
          const lot = warehouseId ? row.supplier_stock_lots : row;
          const batch = Array.isArray(lot.authenticity_batches)
            ? lot.authenticity_batches[0]
            : lot.authenticity_batches;
          return (
            <Card key={row.id}>
              <CardContent className="space-y-3 pt-5">
                <h3 className="font-semibold">
                  {lot.inventory_items?.name} · Lote {lot.lot_number}
                </h3>
                <div className="flex gap-5">
                  <p>
                    <span className="block text-xs text-muted-foreground">
                      {warehouseId ? "Recebido" : "Comprado"}
                    </span>
                    <strong>{formatNumber(row.quantity)} unidades</strong>
                  </p>
                  <p className="text-emerald-600">
                    <span className="block text-xs">Disponível</span>
                    <strong>{formatNumber(row.available)} unidades</strong>
                  </p>
                </div>
                {!warehouseId && (
                  <p className="text-sm text-muted-foreground">
                    Compra: {formatDate(lot.purchase_date)} · Fabricação:{" "}
                    {formatDate(lot.manufacture_date)} · Validade: {formatDate(lot.expiry_date)}
                  </p>
                )}
                {warehouseId && (
                  <p className="text-sm">
                    Compra #OC-{row.purchase_order_items?.purchase_orders?.number}
                  </p>
                )}
                {batch && (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => setQr({ ...lot, batch })}>
                      Ver QR Code
                    </Button>
                    {data.isAdmin && (
                      <Button variant="outline" asChild>
                        <Link to="/autenticidade" search={{ batchId: batch.id }}>
                          Abrir lote e códigos
                        </Link>
                      </Button>
                    )}
                  </div>
                )}
                {warehouseId &&
                  row.stock_lot_movements?.map((m: any, i: number) => (
                    <p key={i} className="text-sm">
                      Pedido #{m.orders?.number}
                      {m.orders?.revision_no ? `.${m.orders.revision_no}` : ""} ·{" "}
                      {formatNumber(m.quantity)} unidades ·{" "}
                      {m.orders?.fulfillment_status || m.orders?.workflow_stage}
                    </p>
                  ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar compra de lote do fornecedor</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <Label htmlFor="supplier-lot-item">Produto</Label>
            <select
              id="supplier-lot-item"
              required
              className="w-full rounded-md border bg-background p-2"
              value={form.itemId}
              onChange={(e) => setForm({ ...form, itemId: e.target.value })}
            >
              <option value="">Selecione o produto</option>
              {data.items.map((i: any) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                  {i.sku ? ` · ${i.sku}` : ""}
                </option>
              ))}
            </select>
            {(
              [
                ["lot", "Número do lote", "text"],
                ["purchaseDate", "Data da compra", "date"],
                ["manufacture", "Fabricação", "month"],
                ["expiry", "Validade", "month"],
                ["quantity", "Unidades do lote", "number"],
                ["unitCost", "Custo unitário", "number"],
              ] as const
            ).map(([key, label, type]) => (
              <div key={key}>
                <Label htmlFor={`supplier-lot-${key}`}>{label}</Label>
                <Input
                  id={`supplier-lot-${key}`}
                  required
                  type={type}
                  value={form[key]}
                  min={type === "number" ? (key === "unitCost" ? "0.01" : "1") : undefined}
                  step={key === "unitCost" ? "0.01" : key === "quantity" ? "1" : undefined}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              </div>
            ))}
            <Label htmlFor="supplier-lot-currency">Moeda do custo</Label>
            <select
              id="supplier-lot-currency"
              className="w-full rounded-md border bg-background p-2"
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value as any })}
            >
              {["USD", "BRL", "PYG"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Serão gerados tantos códigos quantas forem as unidades deste lote. Essa compra entra
              no estoque do fornecedor; o estoque principal recebe unidades pela aba Compras.
            </p>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending
                ? "Registrando lote e gerando códigos…"
                : "Registrar lote, estoque e QR Code"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!qr} onOpenChange={(v) => !v && setQr(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>QR Code · Lote {qr?.lot_number}</DialogTitle>
          </DialogHeader>
          {qr && (
            <>
              <div className="mx-auto bg-white p-4">
                <QRCodeSVG
                  id="supplier-lot-qr"
                  value={`${window.location.origin}/verificar/${qr.batch.id}`}
                  size={240}
                />
              </div>
              <p className="text-sm">
                {qr.inventory_items?.name} · {formatNumber(qr.quantity)} códigos individuais
              </p>
              <a
                className="break-all text-sm underline"
                href={`/verificar/${qr.batch.id}`}
                target="_blank"
                rel="noreferrer"
              >
                Abrir página pública do lote
              </a>
              <Button
                onClick={() => {
                  const svg = document.getElementById("supplier-lot-qr");
                  if (!svg) return;
                  const url = URL.createObjectURL(
                    new Blob([new XMLSerializer().serializeToString(svg)], {
                      type: "image/svg+xml",
                    }),
                  );
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "qr-lote.svg";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Baixar QR Code
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
