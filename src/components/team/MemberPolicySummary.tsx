/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { readAllRows } from "@/lib/read-all-rows";

export function MemberPolicySummary({
  jobIds,
  roles,
  memberId,
}: {
  jobIds: string[];
  roles: string[];
  memberId?: string;
}) {
  const query = useQuery({
    queryKey: ["member-policy-preview", jobIds, roles, memberId],
    staleTime: 0,
    queryFn: async () => {
      const { data } = await readAllRows(
        (supabase as any)
          .from("remuneration_policies")
          .select(
            "id,series_id,version,name,job_role_ids,member_ids,app_roles,active,starts_at,ends_at,definition",
          ),
      );
      const now = Date.now();
      return data.filter(
        (p: any) =>
          p.active &&
          new Date(p.starts_at).getTime() <= now &&
          (!p.ends_at || new Date(p.ends_at).getTime() > now) &&
          !data.some(
            (n: any) =>
              n.series_id === p.series_id &&
              n.version > p.version &&
              new Date(n.starts_at).getTime() <= now,
          ) &&
          (p.job_role_ids.some((id: string) => jobIds.includes(id)) ||
            p.app_roles?.some((role: string) => roles.includes(role)) ||
            (memberId && p.member_ids.includes(memberId))),
      );
    },
  });
  return (
    <section className="space-y-3 rounded-lg border p-4 text-sm">
      <p className="font-semibold">Políticas vinculadas ao cargo e ao perfil</p>
      {query.isLoading ? (
        <p>Conferindo políticas…</p>
      ) : query.error ? (
        <p role="alert">Não foi possível conferir as políticas. Revise no Financeiro.</p>
      ) : query.data?.length ? (
        query.data.map((p: any) => (
          <div key={p.id}>
            <p className="font-medium">{p.name}</p>
            {p.definition.rules.map((r: any, i: number) => (
              <p key={i} className="text-muted-foreground">
                {r.amount}
                {r.type === "percent" ? "%" : ` ${r.currency}`} ·{" "}
                {r.period === "per_sale"
                  ? "por venda"
                  : r.period === "per_unit"
                    ? "por unidade"
                    : r.period === "month"
                      ? "mensal"
                      : r.period === "week"
                        ? "semanal"
                        : "diário"}
              </p>
            ))}
          </div>
        ))
      ) : (
        <p>
          Nenhuma política específica encontrada. Cadastre a política do cargo ou uma exceção
          individual no Financeiro.
        </p>
      )}
      <a
        href={`/financeiro${memberId ? `?politicaMembro=${memberId}` : ""}#politicas`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block font-medium text-primary underline"
      >
        Configurar política ou exceção individual
      </a>
      <p className="text-xs text-muted-foreground">
        A definição é única no Financeiro. O cadastro do membro apenas vincula os cargos e perfis
        escolhidos.
      </p>
    </section>
  );
}
