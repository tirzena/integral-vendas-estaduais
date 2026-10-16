import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/useAuth";

export function InitialMemberAccessNotice() {
  const client = useQueryClient();
  const { userId } = useCurrentUser();
  const query = useQuery({
    queryKey: ["initial-member-access-notice", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) return null;
      return data.user;
    },
  });
  const user = query.data;
  if (!user?.app_metadata["initial_setup_suggested"] || user.user_metadata["initial_setup_seen"])
    return null;
  async function dismiss() {
    const { error } = await supabase.auth.updateUser({
      data: { ...user?.user_metadata, initial_setup_seen: true },
    });
    if (error) return void toast.error("Não foi possível registrar sua preferência.");
    await client.invalidateQueries({ queryKey: ["initial-member-access-notice"] });
  }
  return (
    <aside className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-muted/40 p-4 text-sm">
      <div>
        <p className="font-semibold">Bem-vindo ao sistema</p>
        <p>
          Seu acesso foi criado pelo administrador. Recomendamos atualizar seu e-mail e sua senha em
          Configurações.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <a className="font-medium text-primary underline" href="/configuracoes">
          Atualizar meus dados
        </a>
        <Button variant="ghost" size="sm" onClick={dismiss}>
          Fazer depois
        </Button>
      </div>
    </aside>
  );
}
