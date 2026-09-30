/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProductScope } from "@/hooks/useProductScope";
import { useRates, type Currency } from "@/hooks/useRates";
import { formatMoney } from "@/lib/format";
import { ReportButton } from "@/components/common/ReportButton";
export function FinanceStock({ currency, productIdOverride }: { currency: Currency; productIdOverride?: string }) {
  const query = useQuery({
    queryKey: ["finance-stock"],
    queryFn: async () => {
      const rows: any[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await (supabase as any)
          .from("warehouse_inventory")
          .select("*,warehouses(name),inventory_items(name,product_id,cost,price,currency)")
          .order("id")
          .range(offset, offset + 499);
        if (error) throw error;
        rows.push(...(data ?? []));
        if ((data ?? []).length < 500) return rows;
      }
    },
  });
  const { productId: globalProductId } = useProductScope();
  const productId = productIdOverride ?? globalProductId;
  const rates = useRates();
  const rows = (query.data ?? []).filter(
    (r) => productId === "todos" || r.inventory_items?.product_id === productId,
  );
  const value = (r: any, key: string, quantity = Number(r.quantity)) =>
    r.inventory_items?.[key] === null
      ? null
      : rates.convert(
          Number(r.inventory_items?.[key] ?? 0) * quantity,
          r.inventory_items?.currency ?? "USD",
          currency,
        );
  const money = (n: number | null) => (n === null ? "Custo pendente" : formatMoney(n, currency));
  const available = (r: any) => Math.max(0, Number(r.quantity) - Number(r.reserved));
  const reservedValue = rows.reduce((n, r) => n + (value(r, "price", Number(r.reserved)) ?? 0), 0);
  const availableValue = rows.reduce((n, r) => n + (value(r, "price", available(r)) ?? 0), 0);
  const cost = rows.reduce((n, r) => n + (value(r, "cost") ?? 0), 0);
  const potential = rows.reduce((n, r) => n + (value(r, "price") ?? 0), 0);
  if (query.isPending || !rates.ready) return <p>Carregando estoque e cotações…</p>;
  if (query.error) return <p role="alert">Não foi possível carregar o estoque.</p>;
  return (
    <div className="space-y-4">
      <p>
        Posição atual por produto e depósito. O valor potencial de venda não representa dinheiro
        recebido.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="surface-card p-5">
          Em estoque: {rows.reduce((n, r) => n + Number(r.quantity), 0).toLocaleString("pt-BR")}{" "}
          unidades
        </div>
        <div className="surface-card p-5">
          Disponível: {rows.reduce((n, r) => n + available(r), 0).toLocaleString("pt-BR")} unidades
          · {money(availableValue)}
        </div>
        <div className="surface-card p-5">
          Reservado: {rows.reduce((n, r) => n + Number(r.reserved), 0).toLocaleString("pt-BR")}{" "}
          unidades · {money(reservedValue)}
        </div>
        <div className="surface-card p-5">Custo conhecido: {money(cost)}</div>
        <div className="surface-card p-5">Venda potencial: {money(potential)}</div>
      </div>
      {rows.some((r) => r.inventory_items?.cost === null) && (
        <p className="text-muted-foreground">
          Produtos com custo pendente não entram no custo conhecido.
        </p>
      )}
      <ReportButton
        title="Posição financeira do estoque"
        filename="financeiro-estoque"
        build={() => ({
          headers: [
            "Produto",
            "Depósito",
            "Unidades",
            "Reservadas",
            "Disponíveis",
            "Valor reservado",
            "Valor disponível",
            "Custo do saldo",
            "Venda potencial",
          ],
          rows: rows.map((r) => [
            r.inventory_items?.name,
            r.warehouses?.name,
            r.quantity,
            r.reserved,
            available(r),
            money(value(r, "price", Number(r.reserved))),
            money(value(r, "price", available(r))),
            money(value(r, "cost")),
            money(value(r, "price")),
          ]),
        })}
      />
      <div className="surface-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {[
                "Produto",
                "Depósito",
                "Unidades",
                "Reservadas",
                "Disponíveis",
                "Valor reservado",
                "Valor disponível",
                "Custo do saldo",
                "Venda potencial",
              ].map((x) => (
                <th className="p-3 text-left" key={x}>
                  {x}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-3">{r.inventory_items?.name}</td>
                <td>{r.warehouses?.name}</td>
                <td>{r.quantity}</td>
                <td>{r.reserved}</td>
                <td>{available(r)}</td>
                <td>{money(value(r, "price", Number(r.reserved)))}</td>
                <td>{money(value(r, "price", available(r)))}</td>
                <td>{money(value(r, "cost"))}</td>
                <td>{money(value(r, "price"))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
