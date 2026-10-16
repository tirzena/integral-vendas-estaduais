/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useAuth";
import { usePeople } from "@/hooks/usePeople";
import { formatDate, formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const kindNames: Record<string, string> = {
  salary: "Salário",
  bonus: "Bonificação",
  prolabore: "Pró-labore",
  other: "Outro pagamento",
};

export function PeriodPolicyAccruals() {
  const { userId, isAdmin, roles, viewAs } = useCurrentUser();
  const reviewer = isAdmin || roles.includes("financeiro");
  const { people } = usePeople();
  const client = useQueryClient();
  const [member, setMember] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ["period-policy-proposals", userId],
    enabled: !!userId && !viewAs,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("remuneration_period_proposals");
      if (error) throw error;
      return data as any[];
    },
  });
  async function refresh() {
    if (!member) return void toast.error("Selecione o membro para conferir a prévia.");
    setBusy(true);
    try {
      const { error } = await (supabase as any).rpc("remuneration_refresh_member_periods", {
        p_member: member,
      });
      if (error) throw error;
      await client.invalidateQueries({ queryKey: ["period-policy-proposals"] });
      toast.success("Prévia atualizada conforme os períodos encerrados e as políticas aplicáveis.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function authorize(proposal: any) {
    const reason = notes[proposal.id]?.trim() ?? "";
    if (reason.length < 5) return void toast.error("Descreva a conferência realizada.");
    setBusy(true);
    try {
      const { error } = await (supabase as any).rpc("remuneration_approve_period_accrual", {
        p_accrual: proposal.id,
        p_expected_updated_at: proposal.updated_at,
        p_reason: reason,
      });
      if (error) throw error;
      await client.invalidateQueries();
      toast.success(
        "Valor autorizado e lançado. O pagamento e o recibo serão registrados na folha.",
      );
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (viewAs) return null;
  return (
    <section className="my-5 space-y-3 rounded-lg border p-4">
      <h2 className="font-semibold">Valores de políticas por período</h2>
      <p className="text-sm text-muted-foreground">
        Os valores fixos são apurados após o encerramento de cada dia, semana ou mês, com a política
        vigente no fechamento e sem rateio automático. O financeiro confere cada prévia antes do
        lançamento. Comissões e bonificações por venda acompanham os recebimentos dos pedidos.
      </p>
      {reviewer && (
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Membro para conferir prévia"
            className="h-10 rounded-md border bg-background px-3"
            value={member}
            disabled={busy}
            onChange={(event) => setMember(event.target.value)}
          >
            <option value="">Selecione o membro</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
          <Button variant="outline" disabled={busy || !member} onClick={refresh}>
            Atualizar prévia do membro
          </Button>
        </div>
      )}
      {query.isLoading ? (
        <p>Carregando prévias…</p>
      ) : query.error ? (
        <p role="alert">Não foi possível consultar as prévias.</p>
      ) : !query.data?.length ? (
        <p className="text-sm text-muted-foreground">
          Nenhum valor por período aguardando conferência.
        </p>
      ) : (
        query.data.map((proposal) => (
          <article key={proposal.id} className="space-y-3 rounded-md bg-muted/30 p-3">
            <p className="font-medium">
              {proposal.full_name} · {kindNames[proposal.kind] ?? proposal.kind} ·{" "}
              {proposal.policy_name}
            </p>
            <p className="text-sm">
              Período: {formatDate(proposal.period_start)} a {formatDate(proposal.period_end)} ·
              Pagamento previsto: {formatDate(proposal.payment_due_date)}
            </p>
            <p className="text-sm">
              Total apurado: {formatMoney(Number(proposal.target_amount), proposal.currency)} · Já
              autorizado: {formatMoney(Number(proposal.posted_amount), proposal.currency)} · Ajuste
              para conferir:{" "}
              <strong>{formatMoney(Number(proposal.adjustment), proposal.currency)}</strong>
            </p>
            {proposal.can_review && (
              <>
                <label className="grid gap-1 text-sm">
                  Conferência realizada
                  <Input
                    value={notes[proposal.id] ?? ""}
                    disabled={busy}
                    onChange={(event) => setNotes({ ...notes, [proposal.id]: event.target.value })}
                  />
                </label>
                <Button disabled={busy} onClick={() => authorize(proposal)}>
                  Autorizar lançamento na folha
                </Button>
              </>
            )}
          </article>
        ))
      )}
    </section>
  );
}
