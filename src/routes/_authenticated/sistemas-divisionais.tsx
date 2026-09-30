/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { DivisionAccessPanel } from "@/components/admin/DivisionAccessPanel";
import { SystemConnectionsPanel } from "@/components/admin/SystemConnectionsPanel";

export const Route = createFileRoute("/_authenticated/sistemas-divisionais")({
  component: DivisionSystemsPage,
});

type SyncEvent = { source_code: string; entity_type: string; status: string; created_at: string; updated_at: string };

function DivisionSystemsPage() {
  const { roles } = useCurrentUser();
  const canManage = roles.includes("superadmin") || roles.includes("admin");
  const sync = useQuery({
    queryKey: ["division-sync-events"],
    enabled: canManage,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("integral_sync_log")
        .select("source_code,entity_type,status,created_at,updated_at")
        .order("updated_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as SyncEvent[];
    },
    refetchInterval: 60_000,
  });
  const connections = useQuery({ queryKey: ["integral-system-connections"], enabled: canManage,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("integral_system_connections")
        .select("code,name,base_url,active,token_rotated_at").order("name");
      if (error) throw error;
      return data as { code: string; name: string; base_url: string; active: boolean; token_rotated_at: string | null }[];
    },
  });
  if (!canManage) return <div className="p-6">Acesso restrito à Direção Geral.</div>;
  return <main className="space-y-5 p-4 md:p-6">
    <div>
      <h1 className="text-2xl font-bold">Integrações e APIs</h1>
      <p className="text-sm text-muted-foreground">
        Conceda acessos aos membros e acompanhe a ligação real de cada divisão ao Supabase da Direção Geral.
        A chave pública identifica o projeto; cada consulta exige a sessão do membro e verifica suas permissões.
      </p>
    </div>
    <section className="rounded-lg border p-4 text-sm">
      <h2 className="font-semibold">Fonte central de dados</h2>
      <p className="mt-1 text-muted-foreground">Projeto Supabase: wyutdvttldxkaqqysiuv. Os sites divisionais usam o mesmo projeto para consultar dados autorizados. Chaves de serviço ficam somente no servidor e nunca são exibidas neste painel.</p>
      <p className="mt-2 text-muted-foreground">Para vincular um membro, use os acessos abaixo. Para confirmar a identidade de uma divisão, entre no site com a conta concedida e confira a verificação registrada aqui. Um acesso autenticado não significa que todas as operações estejam sincronizadas.</p>
    </section>
    <SystemConnectionsPanel />
    <DivisionAccessPanel />
    <section className="rounded-lg border p-4">
      <h2 className="mb-3 text-lg font-semibold">Estado das conexões</h2>
      {sync.isError && <p className="text-sm text-destructive">Não foi possível consultar o histórico de conexões.</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {connections.data?.map(({ code, name, base_url, active, token_rotated_at }) => {
          const events = sync.data?.filter((item) => item.source_code === code) ?? [];
          const identity = events.find((item) => item.entity_type === "identity" && item.status === "identity_connected");
          const verified = events.find((item) => item.entity_type === "connection" && item.status === "connection_verified");
          const operation = events.find((item) => item.entity_type !== "identity" && item.status === "completed");
          return <article key={code} className="rounded-md border p-4 text-sm">
            <a className="font-semibold underline" href={base_url} target="_blank" rel="noopener noreferrer">{name} ↗</a>
            <p className="mt-2">Cadastro: <strong>{active ? "ativo" : "desativado"}</strong> · API: <strong>{token_rotated_at ? "credencial gerada" : "sem credencial"}</strong></p>
            <p>Verificação da API: <strong>{verified ? "confirmada" : "pendente"}</strong></p>
            <p className="mt-2">Identidade: <strong>{identity ? "verificada" : "ainda não verificada"}</strong></p>
            {identity && <p className="text-xs text-muted-foreground">Último acesso em {new Date(identity.updated_at ?? identity.created_at).toLocaleString("pt-BR")}.</p>}
            <p className="mt-2">Dados operacionais: <strong>{operation ? "evento confirmado" : "integração pendente"}</strong></p>
            {code === "vendas_estaduais" && <p className="mt-2 text-xs text-muted-foreground">Pedidos em leitura direta do Supabase central. Escrita e demais entidades ainda requerem validação.</p>}
            {code === "captacao" && <p className="mt-2 text-xs text-muted-foreground">Portal público; não utiliza o login das divisões.</p>}
          </article>;
        })}
      </div>
    </section>
  </main>;
}
