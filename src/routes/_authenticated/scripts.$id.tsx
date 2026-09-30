/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Copy, Eye, EyeOff, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useDeleteRow } from "@/lib/db";
import { PageHeader, EmptyState, DemoBadge } from "@/components/common/PageHeader";
import { MediaEmbed } from "@/components/scripts/MediaEmbed";
import { ScriptDialog, kindOf } from "@/components/scripts/ScriptDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/scripts/$id")({
  head: () => ({
    meta: [
      { title: "Material de treinamento — OS" },
      { name: "description", content: "Conteúdo, vídeos, materiais e acessos do treinamento." },
      { property: "og:title", content: "Material de treinamento — OS" },
      { property: "og:description", content: "Conteúdo completo do script ou treinamento." },
    ],
  }),
  component: ScriptDetail,
});

function ScriptDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [shown, setShown] = useState<Record<number, boolean>>({});
  const remove = useDeleteRow("sales_scripts");

  const { data, isLoading } = useQuery({
    queryKey: ["sales_script", id],
    queryFn: async () => {
      const { data } = await supabase.from("sales_scripts").select("*").eq("id", id).maybeSingle();
      return data as any;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Carregando…
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState
        title="Material não encontrado"
        description="Ele pode ter sido excluído."
        action={
          <Button asChild>
            <Link to="/scripts">Voltar</Link>
          </Button>
        }
      />
    );
  }

  const links: any[] = Array.isArray(data.links) ? data.links : [];
  const creds: any[] = Array.isArray(data.credentials) ? data.credentials : [];

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    toast.success("Copiado.");
  }

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-3" asChild>
        <Link to="/scripts">
          <ArrowLeft className="mr-1.5 size-4" /> Voltar
        </Link>
      </Button>

      <PageHeader
        title={data.title}
        {...(data.category ? { description: data.category } : {})}
        actions={
          <>
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="mr-1.5 size-4" /> Editar
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                remove.mutate(data.id);
                navigate({ to: "/scripts" });
              }}
            >
              <Trash2 className="mr-1.5 size-4 text-destructive" /> Excluir
            </Button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{data.script_type ?? "script"}</Badge>
        <Badge variant={data.status === "arquivado" ? "outline" : "secondary"}>
          {data.status ?? "ativo"}
        </Badge>
        {data.is_demo && <DemoBadge />}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {data.video_url && <MediaEmbed url={data.video_url} label={data.title} />}
          {data.image_url && !data.video_url && (
            <MediaEmbed url={data.image_url} label={data.title} />
          )}

          {data.description && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Resumo</CardTitle>
              </CardHeader>
              <CardContent className="text-sm whitespace-pre-wrap">{data.description}</CardContent>
            </Card>
          )}

          {data.content && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {kindOf(data) === "treinamento" ? "Conteúdo do treinamento" : "Script"}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm whitespace-pre-wrap">{data.content}</CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Materiais e links</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {links.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum material vinculado.</p>
              )}
              {links.map((l, i) => (
                <div key={i} className="space-y-2">
                  <p className="text-sm font-medium">{l.label || l.url}</p>
                  <MediaEmbed url={l.url} label={l.label} />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Acessos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {creds.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum acesso cadastrado.</p>
              )}
              {creds.map((c, i) => (
                <div key={i} className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">{c.label || "Acesso"}</p>
                  {c.url && (
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary underline underline-offset-4"
                    >
                      {c.url}
                    </a>
                  )}
                  {c.login && (
                    <p className="mt-2 flex items-center gap-2">
                      <span className="text-muted-foreground">Login:</span> {c.login}
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Copiar login"
                        onClick={() => copy(c.login)}
                      >
                        <Copy className="size-3.5" />
                      </Button>
                    </p>
                  )}
                  {c.password && (
                    <p className="flex items-center gap-2">
                      <span className="text-muted-foreground">Senha:</span>
                      {shown[i] ? c.password : "••••••••"}
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Mostrar senha"
                        onClick={() => setShown((s) => ({ ...s, [i]: !s[i] }))}
                      >
                        {shown[i] ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Copiar senha"
                        onClick={() => copy(c.password)}
                      >
                        <Copy className="size-3.5" />
                      </Button>
                    </p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <ScriptDialog
        open={editing}
        onOpenChange={setEditing}
        kind={kindOf(data)}
        editing={data}
        productId={data.product_id}
      />
    </div>
  );
}
