/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery } from "@tanstack/react-query";
import { MapPin, PackageCheck, Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/common/PageHeader";
import { formatDate, formatNumber } from "@/lib/format";
import { orderNumber } from "@/lib/sales";
import { useCurrentUser } from "@/hooks/useAuth";
import { CurrencyValues } from "@/components/common/CurrencyValues";

export function StockSalesOrders({ warehouseId }: { warehouseId?: string | null }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["inventory-sales-orders"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("inventory_sales_orders");
      if (error) throw error;
      return data ?? [];
    },
  });
  const visible = data.filter((o: any) => !warehouseId || o.warehouse_id === warehouseId);
  return (
    <section className="mt-6 space-y-3 rounded-xl border bg-card p-4">
      <div>
        <h2 className="flex items-center gap-2 font-semibold">
          <PackageCheck className="size-4" /> Ordens de venda para o estoque
        </h2>
        <p className="text-sm text-muted-foreground">
          Separação e despacho sem exibir valores comerciais.
        </p>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando ordens…</p>
      ) : visible.length === 0 ? (
        <EmptyState
          title="Nenhuma ordem pendente"
          description="Pedidos feitos e em caminho aparecerão aqui."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {visible.map((o: any) => (
            <Card key={o.order_id}>
              <CardContent className="space-y-2 pt-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      Pedido {orderNumber(o.number)} · {o.customer_name ?? "Venda balcão"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(o.created_at)} · {o.item_count} item(ns) ·{" "}
                      {formatNumber(o.total_quantity, 2)} unidade(s)
                    </p>
                  </div>
                  <Badge variant="secondary">
                    {o.workflow_stage === "em_caminho" ? "Em caminho" : "Pedido feito"}
                  </Badge>
                </div>
                <p className="flex items-center gap-1 text-sm">
                  <PackageCheck className="size-4 text-primary" />{" "}
                  {o.warehouse_name ?? "Estoque ainda não definido"}
                  {o.warehouse_city ? ` · ${o.warehouse_city}/${o.warehouse_state}` : ""}
                </p>
                <p className="flex items-start gap-1 text-sm text-muted-foreground">
                  <MapPin className="mt-0.5 size-4 shrink-0" />{" "}
                  {[o.shipping_address, o.shipping_city, o.shipping_state]
                    .filter(Boolean)
                    .join(" · ") || "Endereço de despacho ainda não informado"}
                </p>
                {o.workflow_stage === "em_caminho" && (
                  <p className="flex items-center gap-1 text-xs text-primary">
                    <Truck className="size-3.5" /> Pedido em transporte
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
export function StockPurchaseHistory({ warehouseId }: { warehouseId: string }) {
  const { isAdmin } = useCurrentUser();
  const query = useQuery({
    queryKey: ["purchases-management"], enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("purchases_for_management");
      if (error) throw error;
      return data ?? [];
    },
  });
  if (!isAdmin) return null;
  const purchases = (query.data ?? []).filter((purchase: any) =>
    purchase.source_type === "manual" && purchase.warehouse?.id === warehouseId,
  ).sort((a: any, b: any) => Number(b.number) - Number(a.number));
  return <section className="mt-6 space-y-4 rounded-xl border bg-card p-4">
    <div><h2 className="font-semibold">Compras e pagamentos do estoque principal</h2>
      <p className="text-sm text-muted-foreground">Entradas de produtos, valores investidos e cada pagamento registrado.</p></div>
    {query.isError ? <p role="alert">Não foi possível carregar o histórico de compras.</p>
      : query.isLoading ? <p>Carregando compras…</p>
      : purchases.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma compra registrada para este estoque.</p>
      : purchases.map((purchase: any) => <Card key={purchase.id}><CardContent className="space-y-3 pt-5">
        <p className="font-medium">#OC-{String(purchase.number).padStart(2, "0")} · {purchase.supplier?.name}</p>
        <p className="text-sm">Compra em {formatDate(purchase.purchase_date)} · {purchase.buyer?.name ?? "Sistema"}{purchase.status === "cancelada" ? " · Cancelada" : ""}</p>
        {purchase.items.map((item: any) => <div key={item.id} className="grid gap-2 border-t pt-2 sm:grid-cols-2">
          <p>{item.description} · {formatNumber(Number(item.quantity), 2)} unidade(s)
            {Number(item.bonus_quantity) > 0 ? ' · ' + formatNumber(Number(item.bonus_quantity), 2) + ' bonificada(s)' : ""}</p>
          <div><p className="text-xs text-muted-foreground">Custo unitário</p><CurrencyValues value={Number(item.unit_cost)} currency={purchase.currency} /></div>
        </div>)}
        <div className="grid gap-3 border-t pt-3 sm:grid-cols-3">
          <div>Total da compra<CurrencyValues value={Number(purchase.total)} currency={purchase.currency} /></div>
          <div>Pago<CurrencyValues value={Number(purchase.amount_paid)} currency={purchase.currency} /></div>
          <div>A pagar<CurrencyValues value={Number(purchase.amount_payable)} currency={purchase.currency} /></div>
        </div>
        <div className="space-y-2 border-t pt-3"><p className="font-medium">Pagamentos</p>
          {purchase.payments.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum pagamento registrado.</p>
            : purchase.payments.map((payment: any) => <div key={payment.id} className="flex flex-wrap justify-between gap-2 text-sm">
              <span>{formatDate(payment.paid_at)} · {payment.method}{payment.reference ? ' · ' + payment.reference : ""}</span>
              <CurrencyValues value={Number(payment.amount)} currency={payment.currency ?? purchase.currency} />
            </div>)}
        </div>
      </CardContent></Card>)}
  </section>;
}
