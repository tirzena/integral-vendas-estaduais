/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatMoney } from "@/lib/format";
import type { Currency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CurrencyValues } from "@/components/common/CurrencyValues";

export const Route = createFileRoute("/recibo/$token")({
  head: () => ({ meta: [{ title: "Recibo de pagamento — OS" }] }),
  component: PaymentReceipt,
});

function PaymentReceipt() {
  const { token } = Route.useParams();
  const query = useQuery({
    queryKey: ["public-payment-receipt", token],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("public_payment_receipt", {
        p_token: token,
      });
      if (error) throw error;
      return data as any;
    },
  });

  if (query.isLoading) return <main className="mx-auto max-w-2xl p-6">Carregando recibo…</main>;
  if (!query.data) return <main className="mx-auto max-w-2xl p-6">Recibo não encontrado.</main>;

  const receipt = query.data;
  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-8">
      <Card className="print:border-0 print:shadow-none">
        <CardHeader className="border-b">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-primary">OS</p>
              <CardTitle>Recibo de pagamento</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Pedido #{String(receipt.order_number ?? 0).padStart(2, "0")}
                {Number(receipt.order_revision ?? 1) > 1
                  ? `.${Number(receipt.order_revision) - 1}`
                  : ""}
              </p>
            </div>
            <Button className="print:hidden" variant="outline" onClick={() => window.print()}>
              <Printer className="mr-2 size-4" /> Gerar arquivo / imprimir
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 pt-6">
          <p className="text-sm text-muted-foreground">Recebemos de</p>
          <p className="text-xl font-semibold">{receipt.customer_name ?? "Cliente"}</p>
          <div className="rounded-xl border bg-muted/20 p-5">
            <p className="text-sm text-muted-foreground">Valor recebido</p>
            <CurrencyValues
              value={receipt.amount}
              currency={receipt.currency as Currency}
              className="mt-1 text-3xl"
              emphasize
            />
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <span className="block text-muted-foreground">Forma</span>
                {receipt.method}
              </div>
              <div>
                <span className="block text-muted-foreground">Data</span>
                {formatDate(receipt.paid_at ?? receipt.created_at)}
              </div>
              <div>
                <span className="block text-muted-foreground">Recebedor da entrega</span>
                {receipt.recipient_name ?? "Não informado"}
              </div>
              <div>
                <span className="block text-muted-foreground">Registrado por</span>
                {receipt.seller_name ?? "Equipe OS"}
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            A autenticidade deste recibo é confirmada pelo endereço exclusivo desta página.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
