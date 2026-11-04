import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useMenuAccess } from "@/hooks/useMenuAccess";

/** Um menu oculto não basta: impede também a abertura direta de URLs bloqueadas. */
export function MenuGate({ children }: { children: React.ReactNode }) {
  const { allowedRoutes, loading, error, isAllowed } = useMenuAccess();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const bypass = pathname === "/sem-acesso";
  const permitted = bypass || isAllowed(pathname);
  const first = allowedRoutes?.[0];
  useEffect(() => {
    if (!loading && !error && !permitted && first && first !== pathname) {
      void navigate({ to: first as "/crm", replace: true });
    }
  }, [loading, error, permitted, first, pathname, navigate]);
  if (loading) return <p className="text-sm text-muted-foreground">Verificando acesso às abas…</p>;
  if (error) return <p role="alert">Não foi possível verificar o acesso ao menu. Atualize a página ou procure um administrador.</p>;
  if (!permitted) return <div className="rounded-xl border p-6 text-center"><h2 className="font-semibold">Aba não autorizada</h2><p className="mt-2 text-sm text-muted-foreground">Seu administrador definiu quais áreas você pode acessar.</p></div>;
  return <>{children}</>;
}
