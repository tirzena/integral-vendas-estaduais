import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/AppShell";
import { ProductScopeProvider } from "@/hooks/useProductScope";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { isEstadualRoute } from "@/lib/estadual-routes";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    if (!isEstadualRoute(location.pathname)) throw redirect({ to: "/painel" });

    const [{ data: roles }, { data: grants, error: grantsError }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", data.user.id),
      (supabase as any)
        .from("integral_division_access")
        .select("can_view,can_write")
        .eq("user_id", data.user.id)
        .eq("system_code", "vendas_estaduais"),
    ]);
    const admin = (roles ?? []).some((row) => row.role === "admin" || row.role === "superadmin");
    const hasGrant = !grantsError && (grants ?? []).some((grant: any) => grant.can_view || grant.can_write);
    if (!admin && !hasGrant && location.pathname !== "/sem-acesso") {
      throw redirect({ to: "/sem-acesso" });
    }
    if ((admin || hasGrant) && location.pathname === "/sem-acesso") {
      throw redirect({ to: "/painel" });
    }
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const queryClient = useQueryClient();
  useEffect(() => {
    // Apenas estoque precisa de sincronização instantânea.
    // Os demais módulos carregam ao abrir/recarregar a página para reduzir
    // conexões, invalidações globais e carga no Supabase.
    const channel = supabase.channel("integral-stock-live");
    for (const table of ["inventory_items", "warehouse_inventory"]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        void queryClient.invalidateQueries({
          refetchType: "active",
          predicate: (query) => {
            const key = String(query.queryKey[0] ?? "").toLowerCase();
            return key.includes("estoque") || key.includes("inventory") || key.includes("stock");
          },
        });
      });
    }
    channel.subscribe();

    // Fora do estoque, uma atualização leve a cada 10 minutos mantém telas
    // abertas razoavelmente atuais sem o custo do Realtime global.
    const interval = window.setInterval(() => {
      void queryClient.invalidateQueries({
        refetchType: "active",
        predicate: (query) => {
          const key = String(query.queryKey[0] ?? "").toLowerCase();
          return !(key.includes("estoque") || key.includes("inventory") || key.includes("stock"));
        },
      });
    }, 600_000);

    return () => {
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return (
    <ProductScopeProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </ProductScopeProvider>
  );
}
