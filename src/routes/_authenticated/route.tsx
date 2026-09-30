import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/AppShell";
import { ProductScopeProvider } from "@/hooks/useProductScope";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

const ESTADUAL_ROUTE_PREFIXES = [
  "/painel",
  "/crm",
  "/clientes",
  "/produtos",
  "/pedidos",
  "/promocoes",
  "/entregas",
  "/financeiro",
  "/ranking",
  "/relatorios",
  "/equipe",
  "/tarefas",
  "/avisos",
  "/chat",
  "/configuracoes",
  "/confirmar-entrega",
] as const;

function isEstadualRoute(pathname: string) {
  return ESTADUAL_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/"),
  );
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    if (!isEstadualRoute(location.pathname)) throw redirect({ to: "/painel" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const tables = [
      "inventory_items",
      "inventory_movements",
      "warehouse_inventory",
      "inventory_item_locations",
      "orders",
      "order_items",
      "customers",
      "customer_products",
      "delivery_events",
      "delivery_assignments",
      "payments",
      "accounts_receivable",
      "accounts_payable",
      "digital_catalogs",
      "promotions",
      "tasks",
      "whatsapp_conversations",
      "internal_notices",
      "purchase_orders",
      "purchase_order_items",
      "supplier_stock_lots",
      "stock_lot_balances",
    ];
    const channel = supabase.channel("integral-live-data");
    for (const table of tables) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        void queryClient.invalidateQueries({ refetchType: "active" });
      });
    }
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void queryClient.invalidateQueries({ refetchType: "active" });
      }
    });
    return () => { void supabase.removeChannel(channel); };
  }, [queryClient]);

  return (
    <ProductScopeProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </ProductScopeProvider>
  );
}
