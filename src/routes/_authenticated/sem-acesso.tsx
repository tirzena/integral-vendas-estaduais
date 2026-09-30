import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ShieldX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/sem-acesso")({
  component: SemAcesso,
});

function SemAcesso() {
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-lg py-16">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldX className="size-5" /> Acesso estadual não concedido
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            Sua conta está autenticada, mas ainda não possui uma concessão ativa para Vendas
            Estaduais. Região, UF, município, produtos e permissão de escrita são definidos pela
            Direção Geral.
          </p>
          <Button
            variant="outline"
            onClick={async () => {
              await supabase.auth.signOut({ scope: "local" });
              navigate({ to: "/auth" });
            }}
          >
            Sair
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
