/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");

/** A Direção Geral define os vínculos; as divisões precisam consultar estes vínculos no backend. */
export function DivisionAccessPanel() {
  const { roles } = useCurrentUser();
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState("");
  const [systemCodes, setSystemCodes] = useState<string[]>([]);
  const [regionCode, setRegionCode] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [municipalityId, setMunicipalityId] = useState("");
  const [productId, setProductId] = useState("");
  const [canWrite, setCanWrite] = useState(false);
  const [ownRecordsOnly, setOwnRecordsOnly] = useState(false);
  const [saving, setSaving] = useState(false);
  const canManage = roles.includes("superadmin") || roles.includes("admin");

  const { data, isLoading, error } = useQuery({
    queryKey: ["integral-division-access"],
    enabled: canManage,
    queryFn: async () => {
      const [members, products, grants, systems] = await Promise.all([
        supabase.from("profiles").select("id,full_name").order("full_name"),
        supabase.from("products").select("id,name").order("name"),
        (supabase as any).from("integral_division_access").select("id,user_id,system_code,region_code,territory_uf,municipality_ibge_id,product_id,can_view,can_write,own_records_only").order("created_at", { ascending: false }),
        (supabase as any).from("integral_system_connections").select("code,name,active").order("name"),
      ]);
      if (members.error || products.error || grants.error || systems.error) throw members.error || products.error || grants.error || systems.error;
      return { members: members.data ?? [], products: products.data ?? [], grants: grants.data ?? [], systems: systems.data ?? [] };
    },
  });
  const municipalities = useQuery({
    queryKey: ["ibge-division-municipalities", stateCode],
    enabled: canManage && !!stateCode,
    queryFn: async () => {
      const response = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${stateCode}/municipios`);
      if (!response.ok) throw new Error("Municípios indisponíveis");
      return (await response.json()) as { id: number; nome: string }[];
    },
    staleTime: 24 * 60 * 60 * 1000,
  });

  if (!canManage) return null;
  const memberName = new Map((data?.members ?? []).map((m: any) => [m.id, m.full_name]));
  const productName = new Map((data?.products ?? []).map((p: any) => [p.id, p.name]));
  const systemName = new Map<string, string>((data?.systems ?? []).map((s: any) => [s.code, s.name]));
  const field = "min-h-10 rounded-md border border-input bg-background px-3 text-sm";

  async function addAccess() {
    if (!userId || !systemCodes.length) { toast.error("Selecione um membro e pelo menos um sistema."); return; }
    setSaving(true);
    const { error } = await (supabase as any).from("integral_division_access").insert(systemCodes.map((systemCode) => ({
      user_id: userId,
      system_code: systemCode,
      region_code: regionCode || null,
      territory_uf: stateCode || null,
      municipality_ibge_id: municipalityId ? Number(municipalityId) : null,
      product_id: productId || null,
      can_view: true,
      can_write: canWrite,
      own_records_only: ownRecordsOnly,
    })));
    setSaving(false);
    if (error) { toast.error(error.code === "23505" ? "Este acesso já está cadastrado." : "Não foi possível salvar o acesso."); return; }
    toast.success("Acesso salvo na Direção Geral.");
    queryClient.invalidateQueries({ queryKey: ["integral-division-access"] });
  }

  async function removeAccess(id: string) {
    const { error } = await (supabase as any).from("integral_division_access").delete().eq("id", id);
    if (error) { toast.error("Não foi possível remover o acesso."); return; }
    toast.success("Acesso removido.");
    queryClient.invalidateQueries({ queryKey: ["integral-division-access"] });
  }

  async function changeAccess(id: string, patch: { can_write?: boolean; own_records_only?: boolean }) {
    const { error } = await (supabase as any).from("integral_division_access").update(patch).eq("id", id);
    if (error) { toast.error("Não foi possível alterar a concessão."); return; }
    queryClient.invalidateQueries({ queryKey: ["integral-division-access"] });
  }

  return (
    <Card className="mb-5">
      <CardHeader><CardTitle>Acesso aos sistemas divisionais</CardTitle>
        <p className="text-sm text-muted-foreground">Marque todos os sistemas desejados para o membro. Cada vínculo mantém o recorte de região, estado, município e produto definido abaixo.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="grid gap-1 text-xs">Membro
            <select className={field} value={userId} onChange={(e) => setUserId(e.target.value)} aria-label="Membro"><option value="">Selecione</option>{data?.members.map((m: any) => <option key={m.id} value={m.id}>{m.full_name || m.id}</option>)}</select>
          </label>
          <fieldset className="grid gap-1 text-xs"><legend>Sistemas (selecione vários)</legend>
            <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border border-input p-2">{data?.systems.filter((s: any) => s.active).map((s: any) => <label key={s.code} className="flex items-center gap-2"><input type="checkbox" checked={systemCodes.includes(s.code)} onChange={(e) => setSystemCodes((previous) => e.target.checked ? [...previous,s.code] : previous.filter((code) => code !== s.code))} />{s.name}</label>)}</div>
          </fieldset>
          <label className="grid gap-1 text-xs">Região
            <select className={field} value={regionCode} onChange={(e) => { setRegionCode(e.target.value); if (e.target.value) { setStateCode(""); setMunicipalityId(""); } }}><option value="">Todas / selecionar estado</option><option value="norte">Norte</option><option value="nordeste">Nordeste</option><option value="centro-oeste">Centro-Oeste</option><option value="sudeste">Sudeste</option><option value="sul">Sul</option></select>
          </label>
          <label className="grid gap-1 text-xs">Estado
            <select className={field} value={stateCode} onChange={(e) => { setStateCode(e.target.value); setMunicipalityId(""); if (e.target.value) setRegionCode(""); }}><option value="">Todos os estados</option>{UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}</select>
          </label>
          <label className="grid gap-1 text-xs">Município
            <select className={field} value={municipalityId} disabled={!stateCode || municipalities.isLoading || !!municipalities.error} onChange={(e) => setMunicipalityId(e.target.value)}><option value="">Todos no estado</option>{municipalities.data?.map((city) => <option key={city.id} value={city.id}>{city.nome}</option>)}</select>
          </label>
          <label className="grid gap-1 text-xs">Produto
            <select className={field} value={productId} onChange={(e) => setProductId(e.target.value)}><option value="">Todos os produtos</option>{data?.products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          </label>
          <div className="flex items-end gap-3"><label className="flex items-center gap-2 pb-2 text-xs"><input type="checkbox" checked={canWrite} onChange={(e) => setCanWrite(e.target.checked)} />Pode registrar/alterar</label></div>
          <div className="flex items-end gap-3"><label className="flex items-center gap-2 pb-2 text-xs"><input type="checkbox" checked={ownRecordsOnly} onChange={(e) => setOwnRecordsOnly(e.target.checked)} />Somente registros próprios</label></div>
        </div>
        <Button onClick={addAccess} disabled={saving || isLoading}>{saving ? "Salvando…" : "Adicionar acesso"}</Button>
        {error && <p className="text-sm text-destructive">Não foi possível consultar os acessos.</p>}
        <div className="max-h-64 space-y-2 overflow-y-auto" aria-label="Acessos cadastrados">
          {data?.grants.map((grant: any) => <div key={grant.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm">
            <span><b>{memberName.get(grant.user_id) || "Membro"}</b> · {systemName.get(grant.system_code) || grant.system_code} · {grant.own_records_only ? "Registros próprios" : grant.municipality_ibge_id ? `${grant.territory_uf} / município IBGE ${grant.municipality_ibge_id}` : grant.territory_uf || grant.region_code || "Brasil"} · {productName.get(grant.product_id) || "Todos os produtos"} · {grant.can_write ? "Visualizar e alterar" : "Somente visualizar"}</span>
            <div className="flex flex-wrap gap-1">
              <Button variant="outline" size="sm" onClick={() => changeAccess(grant.id, { can_write: !grant.can_write })}>{grant.can_write ? "Tornar leitura" : "Permitir edição"}</Button>
              <Button variant="outline" size="sm" onClick={() => changeAccess(grant.id, { own_records_only: !grant.own_records_only })}>{grant.own_records_only ? "Ampliar escopo" : "Só próprios"}</Button>
              <Button variant="ghost" size="sm" onClick={() => removeAccess(grant.id)}>Remover</Button>
            </div>
          </div>)}
          {!isLoading && data?.grants.length === 0 && <p className="text-sm text-muted-foreground">Nenhum acesso divisional cadastrado.</p>}
        </div>
      </CardContent>
    </Card>
  );
}
