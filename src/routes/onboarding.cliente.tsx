/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/onboarding/cliente")({
  head: () => ({ meta: [{ title: "Boas-vindas e manual do cliente — Sistema Integral" }, { name: "description", content: "Materiais oficiais de boas-vindas para clientes." }] }),
  component: ClientOnboarding,
});

function ClientOnboarding() {
  const query = useQuery({ queryKey: ["public-client-onboarding"], queryFn: async () => {
    const { data, error } = await (supabase as any).from("onboarding_materials")
      .select("id,title,description,file_name,storage_path")
      .eq("audience", "cliente").eq("status", "published").order("published_at", { ascending: false });
    if (error) throw error;
    return data as { id: string; title: string; description: string; file_name: string; storage_path: string }[];
  }});
  async function download(path: string, name: string) {
    const { data, error } = await supabase.storage.from("onboarding-documents").download(path);
    if (error || !data) { toast.error(error?.message ?? "Documento indisponível."); return; }
    const url = URL.createObjectURL(data);
    const link = document.createElement("a"); link.href = url; link.download = name;
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
  return <main className="min-h-screen bg-background px-4 py-12 text-foreground">
    <div className="mx-auto max-w-3xl"><header className="mb-8 border-b pb-6"><p className="text-sm font-semibold text-primary">SISTEMA INTEGRAL</p>
      <div className="mt-3 flex items-center gap-3"><BookOpen className="size-8 text-primary" /><h1 className="text-3xl font-bold">Boas-vindas</h1></div>
      <p className="mt-3 text-muted-foreground">Aqui ficam os manuais e documentos oficiais publicados para clientes.</p></header>
      {query.isLoading && <p>Carregando documentos…</p>}
      {query.isError && <p className="text-destructive">Não foi possível carregar os documentos.</p>}
      <div className="space-y-4">{query.data?.map((item) => <article key={item.id} className="rounded-xl border bg-card p-5">
        <h2 className="text-xl font-semibold">{item.title}</h2><p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
        <Button className="mt-4" variant="outline" onClick={() => download(item.storage_path,item.file_name)}><Download className="mr-2 size-4" />Baixar {item.file_name}</Button>
      </article>)}</div>
      {!query.isLoading && query.data?.length === 0 && <p className="rounded-xl border p-5 text-muted-foreground">Os materiais de boas-vindas serão publicados aqui em breve.</p>}
    </div>
  </main>;
}
