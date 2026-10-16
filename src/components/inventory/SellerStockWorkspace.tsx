import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/common/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";

type Stock = {
  warehouses: { id: string; name: string; state: string }[];
  inventory: { id: string; name: string; variation?: string | null }[];
  balances: { warehouse_id: string; item_id: string; quantity: number }[];
};
export function SellerStockWorkspace() {
  const { userId, roles, isAdmin } = useCurrentUser();
  const restrictedSeller = roles.includes("vendedor") && !isAdmin;
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["seller-stock-availability", userId, restrictedSeller],
    enabled: !!userId,
    staleTime: 30_000,
    refetchInterval: 600_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc(
        restrictedSeller ? "integral_seller_stock_availability" : "integral_dashboard_stock",
      );
      if (error) throw error;
      return data as Stock;
    },
  });
  const items = useMemo(
    () => new Map((query.data?.inventory ?? []).map((i) => [i.id, i])),
    [query.data],
  );
  const term = search
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const matches = (name: string) =>
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .includes(term);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Estoques disponíveis"
        description="Consulte produtos e quantidades por estado. Novos estoques criados pela administração aparecem automaticamente. Esta área é somente para consulta."
        actions={
          <Button
            variant="outline"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            Atualizar
          </Button>
        }
      />
      <Input
        aria-label="Buscar produto ou estado"
        placeholder="Buscar produto ou estado…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {query.isLoading && <p className="text-muted-foreground">Carregando estoques…</p>}
      {query.isError && (
        <p role="alert" className="text-destructive">
          Não foi possível consultar os estoques. Clique em Atualizar para tentar novamente.
        </p>
      )}
      <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(query.data?.warehouses ?? []).map((warehouse) => {
          const balances = (query.data?.balances ?? []).filter(
            (b) =>
              b.warehouse_id === warehouse.id &&
              Number(b.quantity) > 0 &&
              (matches(warehouse.state) || matches(items.get(b.item_id)?.name ?? "")),
          );
          if (term && !balances.length && !matches(warehouse.state)) return null;
          return (
            <section key={warehouse.id} className="rounded-xl border bg-card p-4">
              <h2 className="font-semibold">{warehouse.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {balances.length} produtos ·{" "}
                {formatNumber(balances.reduce((total, b) => total + Number(b.quantity), 0))}{" "}
                unidades disponíveis
              </p>
              <div className="mt-3 max-h-96 divide-y overflow-y-auto">
                {balances.map((balance) => (
                  <div
                    key={balance.item_id}
                    className="flex items-center justify-between gap-3 py-3 text-sm"
                  >
                    <span>{items.get(balance.item_id)?.name ?? "Produto"}</span>
                    <strong className="shrink-0">
                      {formatNumber(Number(balance.quantity))} un.
                    </strong>
                  </div>
                ))}
              </div>
              {!balances.length && (
                <p className="mt-3 text-sm text-muted-foreground">
                  {term
                    ? "Nenhum produto encontrado neste estado."
                    : "Sem produtos disponíveis neste estoque."}
                </p>
              )}
            </section>
          );
        })}
      </div>
      {!query.isLoading && !query.isError && !query.data?.warehouses.length && (
        <p className="text-muted-foreground">Nenhum estoque ativo cadastrado pela administração.</p>
      )}
    </div>
  );
}
