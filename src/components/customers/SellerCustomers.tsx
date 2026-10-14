/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useAuth";
import { useEstadualAccess } from "@/hooks/useEstadualAccess";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/common/PageHeader";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";

type Customer = {
  id: string; name: string; phone: string | null; email: string | null;
  document: string | null; city: string | null; state: string | null;
  status: string | null;
};
export function SellerCustomers() {
  const { userId } = useCurrentUser();
  const access = useEstadualAccess();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["estadual-seller-customers", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("estadual_seller_customers");
      if (error) throw error;
      return (data ?? []) as Customer[];
    },
  });
  const rows = (data ?? []).filter((c) =>
    [c.name, c.phone, c.email, c.document, c.city]
      .some((v) => String(v ?? "").toLocaleLowerCase().includes(search.toLocaleLowerCase())),
  );
  const create = async () => {
    if (!access.canWrite || saving) return;
    if (!name.trim()) return void toast.error("Informe o nome do cliente.");
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc("estadual_seller_create_customer", {
        p_name: name.trim(), p_phone: phone.trim() || null, p_email: email.trim() || null,
      });
      if (error) throw error;
      toast.success("Cliente cadastrado.");
      setShowForm(false); setName(""); setPhone(""); setEmail("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["estadual-seller-customers"] }),
        qc.invalidateQueries({ queryKey: ["estadual-seller-pdv"] }),
      ]);
    } catch (e: any) { toast.error(e?.message ?? "Não foi possível cadastrar o cliente."); }
    finally { setSaving(false); }
  };
  return <div className="space-y-4">
    <PageHeader title="Clientes" description="Clientes cadastrados por você e clientes dos seus pedidos vigentes."
      actions={access.canWrite ? <Button onClick={() => setShowForm((v) => !v)}>
        {showForm ? "Fechar cadastro" : "Novo cliente"}
      </Button> : undefined} />
    {showForm && <div className="grid gap-3 rounded-lg border p-4 md:grid-cols-3">
      <div className="space-y-2"><Label>Nome</Label>
        <Input value={name} maxLength={150} onChange={(e) => setName(e.target.value)} /></div>
      <div className="space-y-2"><Label>Telefone</Label>
        <Input value={phone} maxLength={80} onChange={(e) => setPhone(e.target.value)} /></div>
      <div className="space-y-2"><Label>E-mail</Label>
        <Input value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} /></div>
      <Button disabled={saving} onClick={() => void create()}>{saving ? "Salvando…" : "Salvar cliente"}</Button>
    </div>}
    <div className="flex items-center gap-3">
      <Input value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder="Pesquisar nome, telefone, documento ou cidade" aria-label="Pesquisar clientes" />
      <span className="whitespace-nowrap text-sm text-muted-foreground">{rows.length} clientes</span>
    </div>
    {isLoading ? <p>Carregando clientes…</p> : error ?
      <div role="alert" className="space-y-2">
        <p>Não foi possível carregar os clientes: {(error as any)?.message}</p>
        <Button variant="outline" onClick={() => void refetch()}>Tentar novamente</Button>
      </div> : rows.length === 0 ?
      <p className="text-sm text-muted-foreground">Nenhum cliente encontrado. Cadastre um cliente ou gere o primeiro pedido.</p> :
      <div className="overflow-x-auto rounded-lg border">
        <Table><TableHeader><TableRow>
          <TableHead>Cliente</TableHead><TableHead>Telefone</TableHead>
          <TableHead>E-mail</TableHead><TableHead>Cidade / UF</TableHead>
          <TableHead>Situação</TableHead>
        </TableRow></TableHeader>
        <TableBody>{rows.map((c) => <TableRow key={c.id}>
          <TableCell className="font-medium">{c.name}</TableCell>
          <TableCell>{c.phone ?? "—"}</TableCell>
          <TableCell>{c.email ?? "—"}</TableCell>
          <TableCell>{[c.city, c.state].filter(Boolean).join(" / ") || "—"}</TableCell>
          <TableCell>{c.status ?? "ativo"}</TableCell>
        </TableRow>)}</TableBody></Table>
      </div>}
  </div>;
}
