/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type Connection = { code: string; name: string; base_url: string; active: boolean; token_rotated_at: string | null };

export function SystemConnectionsPanel() {
  const client = useQueryClient();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [issued, setIssued] = useState<{ code: string; token: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const query = useQuery({ queryKey: ["integral-system-connections"], queryFn: async () => {
    const { data, error } = await (supabase as any).from("integral_system_connections")
      .select("code,name,base_url,active,token_rotated_at").order("name");
    if (error) throw error;
    return data as Connection[];
  }});
  const field = "min-h-10 rounded-md border border-input bg-background px-3 text-sm";
  async function add() {
    if (!/^[a-z][a-z0-9_]{2,48}$/.test(code) || !/^https:\/\/[^ /?#]+\/?$/.test(url) || !name.trim()) {
      toast.error("Informe código (letras, números e _), nome e endereço HTTPS válido."); return;
    }
    setBusy(true);
    const { error } = await (supabase as any).from("integral_system_connections").insert({ code, name: name.trim(), base_url: url, active: true });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setCode(""); setName(""); setUrl("");
    client.invalidateQueries({ queryKey: ["integral-system-connections"] });
    client.invalidateQueries({ queryKey: ["integral-division-access"] });
  }
  async function update(row: Connection, patch: Partial<Connection>) {
    const { error } = await (supabase as any).from("integral_system_connections").update(patch).eq("code", row.code);
    if (error) { toast.error(error.message); return; }
    client.invalidateQueries({ queryKey: ["integral-system-connections"] });
    client.invalidateQueries({ queryKey: ["integral-division-access"] });
  }
  async function rotate(row: Connection) {
    if (row.token_rotated_at && !window.confirm(`Trocar a credencial de ${row.name}? A anterior deixará de funcionar imediatamente.`)) return;
    const { data, error } = await (supabase as any).rpc("integral_rotate_connection_token", { p_code: row.code });
    if (error) { toast.error(error.message); return; }
    setIssued({ code: row.code, token: data });
    client.invalidateQueries({ queryKey: ["integral-system-connections"] });
  }
  return <section className="rounded-lg border p-4">
    <h2 className="text-lg font-semibold">Conexões por API</h2>
    <p className="mt-1 text-sm text-muted-foreground">Cadastre cada sistema, altere seu endereço, desative o vínculo e gere uma credencial própria. A credencial identifica o sistema na verificação da conexão; os dados de membros continuam exigindo login e permissões.</p>
    <p className="mt-1 text-sm text-muted-foreground">Nos seis portais PHP, crie <code>integral-secrets.php</code> ao lado da pasta <code>public_html</code> do respectivo site, com a credencial <code>INTEGRAL_CONNECTION_TOKEN</code>. Se a hospedagem fornecer variável de ambiente PHP, ela também funciona. Entre novamente no portal para verificar. Um sistema novo ainda precisa implementar o contrato de login, permissões e chamada à API.</p>
    <div className="mt-3 grid gap-2 sm:grid-cols-3">
      <input className={field} aria-label="Código do sistema" placeholder="codigo_do_sistema" value={code} onChange={(e) => setCode(e.target.value.toLowerCase())} />
      <input className={field} aria-label="Nome do sistema" placeholder="Nome do sistema" value={name} onChange={(e) => setName(e.target.value)} />
      <input className={field} aria-label="URL HTTPS do sistema" placeholder="https://sistema.exemplo.com" value={url} onChange={(e) => setUrl(e.target.value)} />
    </div>
    <Button className="mt-2" disabled={busy} onClick={add}>Adicionar sistema</Button>
    {query.isError && <p className="mt-2 text-sm text-destructive">Não foi possível carregar as conexões.</p>}
    <div className="mt-4 space-y-2">{query.data?.map((row) => <div key={row.code} className="rounded-md border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2"><strong>{row.name} <span className="font-normal text-muted-foreground">({row.code})</span></strong><span>{row.active ? "Ativo" : "Desativado"}</span></div>
      <div className="mt-2 flex flex-wrap gap-2">
        <input className={`${field} min-w-56 flex-1`} aria-label={`Endereço de ${row.name}`} defaultValue={row.base_url} key={`${row.code}-${row.base_url}`} onBlur={(e) => { if (e.target.value !== row.base_url) { if (/^https:\/\/[^ /?#]+\/?$/.test(e.target.value)) update(row, { base_url: e.target.value }); else { e.target.value = row.base_url; toast.error("Informe uma URL HTTPS válida."); } } }} />
        <Button variant="outline" onClick={() => rotate(row)}>{row.token_rotated_at ? "Trocar credencial" : "Gerar credencial"}</Button>
        <Button variant={row.active ? "destructive" : "outline"} onClick={() => update(row, { active: !row.active })}>{row.active ? "Desativar" : "Ativar"}</Button>
      </div>
      {issued?.code === row.code && <div className="mt-2 rounded border border-amber-500 p-2"><p>Copie agora: esta credencial não será exibida novamente.</p><code className="break-all select-all">{issued.token}</code><Button variant="ghost" size="sm" onClick={() => setIssued(null)}>Ocultar</Button></div>}
    </div>)}</div>
  </section>;
}
