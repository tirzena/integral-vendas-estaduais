import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePermissions, type Capability } from "@/hooks/usePermissions";

/** Bloqueia a página inteira quando o cargo não tem acesso. */
export function RouteGuard({
  capability,
  children,
}: {
  capability: Capability;
  children: ReactNode;
}) {
  const { can, loading } = usePermissions();
  if (loading) return null;
  if (can(capability)) return <>{children}</>;
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-20 text-center">
      <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Lock className="size-5" />
      </div>
      <p className="font-medium">Esta área não faz parte do seu perfil</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Seu cargo enxerga apenas os próprios resultados. Fale com um administrador se precisar
        deste acesso.
      </p>
      <Button asChild className="mt-4">
        <Link to="/painel">Voltar ao painel</Link>
      </Button>
    </div>
  );
}
