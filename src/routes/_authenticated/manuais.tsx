/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { BookOpen, Download, Upload } from "lucide-react";
import { useCurrentUser } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/manuais")({ component: ManualsPage });
const BUCKET = "onboarding-documents";
const MIME: Record<string,string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  odt: "application/vnd.oasis.opendocument.text",
};
type Material = { id: string; title: string; description: string; audience: "cliente" | "prestador"; status: "draft" | "published"; file_name: string; storage_path: string; created_at: string };

async function download(material: Material) {
  const { data, error } = await supabase.storage.from(BUCKET).download(material.storage_path);
  if (error || !data) throw error ?? new Error("Arquivo indisponível");
  const link = document.createElement("a");
  const url = URL.createObjectURL(data);
  link.href = url;
  link.download = material.file_name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function ManualsPage() {
  const { roles, userId } = useCurrentUser();
  const admin = roles.includes("admin") || roles.includes("superadmin");
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [audience, setAudience] = useState<"cliente" | "prestador">("cliente");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const query = useQuery({ queryKey: ["onboarding-materials"], queryFn: async () => {
    const { data, error } = await (supabase as any).from("onboarding_materials")
      .select("id,title,description,audience,status,file_name,storage_path,created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data as Material[];
  }});
  async function upload() {
    if (!admin || !userId || !file || title.trim().length < 3) { toast.error("Informe título e arquivo."); return; }
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!MIME[extension] || file.size < 1 || file.size > 20 * 1024 * 1024) { toast.error("Use PDF, DOCX ou ODT de até 20 MB."); return; }
    const path = `${audience}/${crypto.randomUUID()}.${extension}`;
    setSaving(true);
    const { data: row, error: insertError } = await (supabase as any).from("onboarding_materials").insert({
      title: title.trim(), description: description.trim(), audience, file_name: file.name,
      storage_path: path, mime_type: MIME[extension], file_size: file.size, created_by: userId,
    }).select("id").single();
    if (insertError) { setSaving(false); toast.error(insertError.message); return; }
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: MIME[extension], upsert: false });
    if (uploadError) {
      await (supabase as any).from("onboarding_materials").delete().eq("id", row.id);
      toast.error(`Upload não concluído: ${uploadError.message}`);
    } else {
      toast.success("Rascunho salvo. Publique depois de conferir o documento.");
      setTitle(""); setDescription(""); setFile(null);
      const input = document.getElementById("onboarding-file") as HTMLInputElement | null;
      if (input) input.value = "";
      queryClient.invalidateQueries({ queryKey: ["onboarding-materials"] });
    }
    setSaving(false);
  }
  async function setPublished(material: Material, publish: boolean) {
    const { error } = await (supabase as any).from("onboarding_materials")
      .update({ status: publish ? "published" : "draft", published_at: publish ? new Date().toISOString() : null })
      .eq("id", material.id);
    if (error) toast.error(error.message);
    else { toast.success(publish ? "Manual publicado." : "Manual retirado da publicação."); queryClient.invalidateQueries({ queryKey: ["onboarding-materials"] }); }
  }
  async function removeDraft(material: Material) {
    if (material.status !== "draft" || !window.confirm(`Remover o rascunho “${material.title}”?`)) return;
    const { error: fileError } = await supabase.storage.from(BUCKET).remove([material.storage_path]);
    if (fileError) { toast.error(fileError.message); return; }
    const { error } = await (supabase as any).from("onboarding_materials").delete().eq("id", material.id);
    if (error) toast.error(error.message);
    else queryClient.invalidateQueries({ queryKey: ["onboarding-materials"] });
  }
  return <main className="space-y-6 p-4 md:p-6">
    <header><div className="flex items-center gap-3"><BookOpen className="size-7 text-primary" /><h1 className="text-2xl font-bold">Manuais e onboarding</h1></div>
      <p className="mt-2 text-sm text-muted-foreground">Materiais sobre a empresa, seus princípios, processos e orientações para clientes e prestadores de serviço.</p></header>
    {admin && <section className="rounded-xl border bg-card p-5">
      <h2 className="text-lg font-semibold">Adicionar documento</h2>
      <p className="mt-1 text-sm text-muted-foreground">O arquivo entra como rascunho. Confira o conteúdo antes de publicar. O manual do cliente publicado pode ser compartilhado pelo endereço /onboarding/cliente; materiais de prestadores exigem conta autorizada.</p>
      <p className="mt-2 text-sm">Link para clientes: <a className="font-medium text-primary underline" href="/onboarding/cliente" target="_blank" rel="noopener noreferrer">Abrir página pública de onboarding ↗</a></p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm">Título<input className="rounded-md border bg-background p-2" value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Boas-vindas à empresa" /></label>
        <label className="grid gap-1 text-sm">Público<select className="rounded-md border bg-background p-2" value={audience} onChange={(event) => setAudience(event.target.value as typeof audience)}><option value="cliente">Cliente</option><option value="prestador">Prestador de serviço</option></select></label>
        <label className="grid gap-1 text-sm md:col-span-2">Descrição<textarea className="rounded-md border bg-background p-2" value={description} maxLength={1000} onChange={(event) => setDescription(event.target.value)} placeholder="O que a pessoa encontrará neste manual" /></label>
        <label className="grid gap-1 text-sm md:col-span-2">Documento PDF, DOCX ou ODT (até 20 MB)<input id="onboarding-file" type="file" accept=".pdf,.docx,.odt" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
      </div>
      <Button className="mt-4" onClick={upload} disabled={saving || !file || title.trim().length < 3}><Upload className="mr-2 size-4" />{saving ? "Enviando…" : "Salvar rascunho"}</Button>
    </section>}
    {admin && <section className="rounded-xl border p-5 text-sm">
      <h2 className="font-semibold">Estrutura sugerida para os documentos</h2>
      <p className="mt-2 text-muted-foreground">Apresente a história, o propósito, os princípios e os canais oficiais da empresa. No manual do cliente, inclua compra, pagamento, entrega, suporte e dúvidas. No manual do prestador, inclua responsabilidades, fluxo de trabalho, registros, prazos, segurança das informações e escalonamento de problemas. O conteúdo institucional deve ser aprovado antes da publicação.</p>
    </section>}
    {query.isError && <p className="text-destructive">Não foi possível carregar os manuais.</p>}
    {(["cliente", "prestador"] as const).map((group) => <section className="space-y-3" key={group}>
      <h2 className="text-lg font-semibold">{group === "cliente" ? "Para clientes" : "Para prestadores de serviço"}</h2>
      {(query.data ?? []).filter((item) => item.audience === group).map((item) => <article key={item.id} className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{item.title}</h3><p className="mt-1 text-sm text-muted-foreground">{item.description || item.file_name}</p><p className="mt-1 text-xs text-muted-foreground">{item.status === "draft" ? "Rascunho" : "Publicado"} · {item.file_name}</p></div>
          <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => download(item).catch((error) => toast.error(error.message))}><Download className="mr-1 size-4" />Baixar</Button>
            {admin && <><Button size="sm" variant={item.status === "published" ? "outline" : "default"} onClick={() => setPublished(item, item.status !== "published")}>{item.status === "published" ? "Retirar publicação" : "Publicar"}</Button>{item.status === "draft" && <Button size="sm" variant="ghost" onClick={() => removeDraft(item)}>Remover</Button>}</>}</div></div>
      </article>)}
      {!query.isLoading && !query.data?.some((item) => item.audience === group) && <p className="rounded-xl border p-4 text-sm text-muted-foreground">Nenhum documento disponível para este público.</p>}
    </section>)}
  </main>;
}
