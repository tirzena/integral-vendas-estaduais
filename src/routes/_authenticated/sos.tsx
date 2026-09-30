/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { adminSosDisableAccess } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/sos")({ component: SosPage });

function SosPage() {
  const { roles, userId } = useCurrentUser();
  const canManage = roles.includes("admin") || roles.includes("superadmin");
  const [memberId, setMemberId] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const client = useQueryClient();
  const members = useQuery({ queryKey: ["sos-members"], enabled: canManage, queryFn: async () => {
    const { data, error } = await supabase.from("profiles").select("id,full_name,email,is_active").order("full_name");
    if (error) throw error;
    return data ?? [];
  }});
  const inventory = useQuery({ queryKey: ["sos-inventory",memberId], enabled: canManage && !!memberId, queryFn: async () => {
    const { data, error } = await (supabase as any).rpc("integral_sos_inventory", { p_user_id: memberId });
    if (error) throw error;
    return data as { table: string; column: string; count: number }[];
  }});
  const member = members.data?.find((item) => item.id === memberId);
  async function disable() {
    if (!member || confirmation !== "DESLIGAR" || member.id === userId || !inventory.data) return;
    setBusy(true);
    try {
      await adminSosDisableAccess({ data: { userId: member.id, confirmation: "DESLIGAR" } });
      toast.success("Login bloqueado, perfil desativado e acessos divisionais removidos.");
      setConfirmation("");
      client.invalidateQueries({ queryKey: ["sos-members"] });
      client.invalidateQueries({ queryKey: ["integral-division-access"] });
    } catch (error) { toast.error(error instanceof Error ? error.message : "Falha ao desligar acesso."); }
    finally { setBusy(false); }
  }
  if (!canManage) return <main className="p-6">Acesso restrito à administração.</main>;
  return <main className="space-y-5 p-4 md:p-6">
    <header><h1 className="text-2xl font-bold text-red-500">SOS de conta</h1>
      <p className="text-sm text-muted-foreground">Desligue o acesso de um membro em todos os sistemas ligados à Direção Geral. Confira os vínculos antes de agir.</p></header>
    <section className="rounded-lg border border-red-500/50 p-4">
      <label className="block text-sm font-medium" htmlFor="sos-member">Membro</label>
      <select id="sos-member" className="mt-1 w-full max-w-md rounded-md border bg-background p-2 text-sm" value={memberId} onChange={(event) => { setMemberId(event.target.value); setConfirmation(""); }}>
        <option value="">Selecione o membro</option>
        {members.data?.map((item) => <option key={item.id} value={item.id}>{item.full_name ?? item.email ?? item.id}{item.is_active === false ? " · desativado" : ""}</option>)}
      </select>
      {inventory.isLoading && <p className="mt-3 text-sm">Conferindo vínculos…</p>}
      {inventory.isError && <p className="mt-3 text-sm text-destructive">Não foi possível conferir os vínculos.</p>}
      {inventory.data && <div className="mt-4 text-sm">
        <p><strong>{inventory.data.length} tipos de vínculo</strong> com este membro.</p>
        <ul className="mt-2 max-h-56 list-disc overflow-y-auto pl-5">{inventory.data.map((row) => <li key={`${row.table}.${row.column}`}>{row.table}.{row.column}: {row.count}</li>)}</ul>
        <p className="mt-4">Desligar bloqueia novos logins, desativa o perfil e remove os acessos divisionais. Pedidos, pagamentos e arquivos permanecem registrados. Sessões já abertas podem continuar até o token expirar.</p>
        <label className="mt-4 block font-medium" htmlFor="sos-confirm">Digite DESLIGAR para confirmar</label>
        <input id="sos-confirm" className="mt-1 rounded-md border bg-background p-2" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" />
        <div><Button className="mt-3" variant="destructive" disabled={busy || confirmation !== "DESLIGAR" || memberId === userId || member?.is_active === false} onClick={disable}>Desligar acesso do membro</Button></div>
      </div>}
    </section>
    <section className="rounded-lg border p-4 text-sm"><h2 className="font-semibold">Transferência e exclusão</h2>
      <p className="mt-1 text-muted-foreground">A transferência dos registros a outro perfil, o backup criptografado e a exclusão não são executados pelo desligamento. Exigem conferência dos dados e arquivos antes de serem liberados.</p>
    </section>
  </main>;
}
