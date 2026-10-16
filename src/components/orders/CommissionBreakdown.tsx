import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney, type Currency } from "@/lib/format";

type Breakdown = {
  currency: Currency;
  commission_total: number;
  exception_amount: number | null;
  items: {
    id: string;
    description: string;
    bases: string[];
    net_sale_basis: number;
    commission_percent: number;
    commission_amount: number;
    commission_enabled: boolean;
  }[];
};
const bases: Record<string, string> = {
  sale: "Valor de venda",
  cost: "Valor de custo",
  cost_freight: "Custo com frete",
  profit: "Lucro",
  custom: "Base personalizada",
};

export function CommissionBreakdown({ orderId }: { orderId: string }) {
  const query = useQuery({
    queryKey: ["commission-breakdown", orderId],
    queryFn: async () => {
      const { data, error } = await (
        supabase as unknown as {
          rpc: (
            name: string,
            args: { p_order: string },
          ) => Promise<{ data: Breakdown; error: Error | null }>;
        }
      ).rpc("remuneration_commission_breakdown", { p_order: orderId });
      if (error) throw error;
      return data;
    },
  });
  return (
    <details className="rounded-lg border p-3 text-sm">
      <summary className="cursor-pointer font-medium">Conferir comissão por produto</summary>
      {query.isLoading ? (
        <p className="mt-3">Conferindo cálculo…</p>
      ) : query.error ? (
        <p role="alert" className="mt-3">
          Não foi possível conferir a comissão. Reabra o pedido para tentar novamente.
        </p>
      ) : (
        query.data && (
          <>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr>
                    {["Produto", "Base de cálculo", "Venda após descontos", "Taxa", "Comissão"].map(
                      (h) => (
                        <th key={h} className="p-2">
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {query.data.items.map((item) => (
                    <tr key={item.id} className="border-t">
                      <td className="p-2">{item.description}</td>
                      <td className="p-2">{item.bases.map((b) => bases[b] ?? b).join(" + ")}</td>
                      <td className="p-2">
                        {formatMoney(Number(item.net_sale_basis), query.data.currency)}
                      </td>
                      <td className="p-2">
                        {!item.commission_enabled
                          ? "Sem comissão"
                          : Number(item.commission_percent) > 0
                            ? `${Number(item.commission_percent).toLocaleString("pt-BR")}%`
                            : "Valor definido no acordo"}
                      </td>
                      <td className="p-2">
                        {formatMoney(Number(item.commission_amount), query.data.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {query.data.exception_amount != null && (
              <p className="mt-3">
                Há uma exceção de comissão registrada para este pedido. O total abaixo considera
                essa decisão.
              </p>
            )}
            <p className="mt-3 font-semibold">
              Comissão prevista:{" "}
              {formatMoney(Number(query.data.commission_total), query.data.currency)}
            </p>
            <p className="mt-2 text-muted-foreground">
              Cada produto pode ter uma taxa diferente. A comissão liberada acompanha os pagamentos
              confirmados do cliente.
            </p>
          </>
        )
      )}
    </details>
  );
}
