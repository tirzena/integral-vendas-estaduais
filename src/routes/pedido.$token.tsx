/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileText, LockKeyhole, Printer } from "lucide-react";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  formatDate,
  formatDateTime,
  formatExchangeRate,
  formatMoney,
  formatNumber,
} from "@/lib/format";
import type { Currency } from "@/lib/format";
import { orderNumber } from "@/lib/sales";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CurrencyValues } from "@/components/common/CurrencyValues";

export const Route = createFileRoute("/pedido/$token")({
  head: () => ({
    meta: [
      { title: "Pedido compartilhado — OS" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  component: SharedOrderPage,
});

const stageLabel: Record<string, string> = {
  pedido_feito: "Pedido feito",
  esperando_pagamento: "Esperando pagamento",
  pagamento_parcial: "Pagamento parcial",
  vendido: "Pago",
  em_caminho: "Em caminho",
  cancelado: "Cancelado",
};

function exchangeText(snapshot: any) {
  if (!snapshot || typeof snapshot !== "object") return "Não registrada";
  return ["BRL", "USD", "PYG"]
    .filter((key) => snapshot[key] != null)
    .map((key) => `${key}: ${formatExchangeRate(Number(snapshot[key]))}`)
    .join(" · ");
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 break-words text-sm font-medium">{value || "—"}</div>
    </div>
  );
}

function SharedOrderPage() {
  const { token } = Route.useParams();
  const query = useQuery({
    queryKey: ["shared-order", token],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("public_order_by_share_token", {
        p_token: token,
      });
      if (error) throw error;
      return data as any;
    },
    retry: false,
  });

  if (query.isLoading)
    return (
      <main className="grid min-h-screen place-items-center p-6 text-muted-foreground">
        Carregando pedido…
      </main>
    );
  if (query.isError || !query.data)
    return (
      <main className="grid min-h-screen place-items-center bg-muted/20 p-6 text-center">
        <div>
          <LockKeyhole className="mx-auto size-10 text-muted-foreground" />
          <h1 className="mt-4 text-2xl font-semibold">Link inválido ou indisponível</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Confira o endereço recebido com quem compartilhou o pedido.
          </p>
        </div>
      </main>
    );

  const data = query.data;
  const order = data.order;
  const customer = data.customer ?? {};
  const items = data.items ?? [];
  const payments = data.payments ?? [];
  const proofs = data.proofs ?? [];
  const currency = (order.currency ?? "BRL") as Currency;

  return (
    <main className="min-h-screen bg-muted/20 px-4 py-8 print:bg-white print:p-0">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="flex flex-wrap items-start justify-between gap-4 rounded-xl border bg-background p-5 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">
              OS · Pedido compartilhado
            </p>
            <h1 className="mt-2 text-3xl font-semibold">
              Pedido {orderNumber(order.number, order.revision_no)}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Versão {order.revision_no ?? 1} · criado em {formatDateTime(order.created_at)}
            </p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <Badge variant="secondary">
              {stageLabel[order.workflow_stage] ?? order.workflow_stage}
            </Badge>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="mr-2 size-4" />
              Imprimir / PDF
            </Button>
          </div>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Dados da nota</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <Info label="Cliente" value={customer.name} />
            <Info label="Nome comercial" value={customer.trade_name} />
            <Info label="Documento" value={customer.document ?? customer.foreign_document} />
            <Info label="Telefone" value={customer.phone} />
            <Info label="WhatsApp" value={order.whatsapp ?? customer.whatsapp} />
            <Info label="E-mail" value={customer.email} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Entrega</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Info label="Destinatário" value={order.delivery_recipient_name} />
            <Info
              label="Endereço de entrega"
              value={[order.shipping_address, order.shipping_city, order.shipping_state]
                .filter(Boolean)
                .join(" · ")}
            />
            <Info label="Previsão" value={formatDate(order.delivery_deadline)} />
            <Info label="Transportadora" value={order.carrier} />
            <Info label="Código de rastreio" value={order.tracking_code} />
            <Info
              label="Situação da entrega"
              value={order.tracking_status ?? order.fulfillment_status}
            />
            <Info label="Entregue em" value={formatDate(order.delivered_at)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Produtos e valores</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-y bg-muted/50 text-left">
                <tr>
                  <th className="p-3">Produto</th>
                  <th className="p-3">SKU</th>
                  <th className="p-3 text-right">Qtd.</th>
                  <th className="p-3 text-right">Valor unitário</th>
                  <th className="p-3 text-right">Desconto</th>
                  <th className="p-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item: any, index: number) => (
                  <tr key={`${item.sku}-${index}`} className="border-b">
                    <td className="p-3 font-medium">{item.description}</td>
                    <td className="p-3">{item.sku ?? "—"}</td>
                    <td className="p-3 text-right">
                      {formatNumber(item.quantity, 3)} {item.unit ?? ""}
                    </td>
                    <td className="p-3 text-right">
                      <CurrencyValues value={item.unit_price} currency={currency} />
                    </td>
                    <td className="p-3 text-right">
                      <CurrencyValues value={item.discount} currency={currency} />
                    </td>
                    <td className="p-3 text-right font-medium">
                      <CurrencyValues value={item.total} currency={currency} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="grid gap-3 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <Info
                label="Frete"
                value={<CurrencyValues value={order.shipping_cost} currency={currency} />}
              />
              <Info
                label="Desconto do pedido"
                value={<CurrencyValues value={order.discount} currency={currency} />}
              />
              <Info
                label="Total"
                value={<CurrencyValues value={order.total} currency={currency} emphasize />}
              />
              <Info
                label="Pago"
                value={<CurrencyValues value={order.amount_paid} currency={currency} />}
              />
              <Info
                label="A receber"
                value={<CurrencyValues value={order.amount_receivable} currency={currency} />}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pagamentos e cotações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border p-4">
              <Info
                label="Cotação quando o pedido foi feito"
                value={`${exchangeText(order.exchange_rates_snapshot)}${order.exchange_rate_locked_at ? ` · ${formatDateTime(order.exchange_rate_locked_at)}` : ""}`}
              />
            </div>
            {payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum pagamento registrado.</p>
            ) : (
              payments.map((payment: any, index: number) => (
                <div
                  key={index}
                  className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4"
                >
                  <Info
                    label={`Pagamento ${index + 1}`}
                    value={
                      <CurrencyValues
                        value={payment.amount}
                        currency={payment.currency as Currency}
                      />
                    }
                  />
                  <Info
                    label="Forma e data"
                    value={`${payment.method ?? "—"} · ${formatDate(payment.paid_at ?? payment.created_at)}`}
                  />
                  <Info
                    label="Cotação do pagamento"
                    value={exchangeText(payment.exchange_rates_snapshot)}
                  />
                  <Info
                    label="Comprovante"
                    value={
                      proofs.filter(
                        (proof: any) =>
                          proof.created_at &&
                          payment.created_at &&
                          proof.created_at >= payment.created_at,
                      ).length
                        ? "Registrado"
                        : "Consulte a lista abaixo"
                    }
                  />
                </div>
              ))
            )}
            <div>
              <p className="text-sm font-semibold">Comprovantes registrados ({proofs.length})</p>
              <div className="mt-2 space-y-2">
                {proofs.length ? (
                  proofs.map((proof: any, index: number) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm"
                    >
                      <FileText className="size-4" />
                      {proof.file_name ??
                        (proof.type === "link" ? "Comprovante por link" : "Comprovante")}
                      {proof.external_url && (
                        <a
                          className="ml-auto text-primary underline"
                          href={proof.external_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Abrir
                        </a>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhum comprovante registrado.</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Observações</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg bg-muted/50 p-4 text-sm whitespace-pre-wrap">
              {order.notes || "Sem observações."}
            </div>
          </CardContent>
        </Card>

        <p className="flex items-center justify-center gap-2 pb-8 text-center text-xs text-muted-foreground">
          <LockKeyhole className="size-3.5" />
          Este endereço é sigiloso. Somente quem possui o link consegue abrir o pedido.
        </p>
      </div>
    </main>
  );
}
