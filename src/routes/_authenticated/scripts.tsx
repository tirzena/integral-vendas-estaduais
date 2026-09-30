/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { GraduationCap, KeyRound, Link2, Loader2, PlayCircle, Plus, Search } from "lucide-react";
import { useRows } from "@/lib/db";
import { useProductScope } from "@/hooks/useProductScope";
import { PageHeader, EmptyState, DemoBadge } from "@/components/common/PageHeader";
import { ScriptDialog, kindOf, type Kind } from "@/components/scripts/ScriptDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/scripts")({
  head: () => ({
    meta: [
      { title: "Scripts e treinamentos — OS" },
      { name: "description", content: "Scripts de venda, objeções e materiais de treinamento." },
      { property: "og:title", content: "Scripts e treinamentos — OS" },
      { property: "og:description", content: "Scripts de venda e treinamentos por produto." },
    ],
  }),
  component: Scripts,
});

function Scripts() {
  const { productId } = useProductScope();
  const filter = productId === "todos" ? {} : { product_id: productId };
  const [term, setTerm] = useState("");
  const [dialog, setDialog] = useState<Kind | null>(null);

  const query = useRows("sales_scripts", { filter, orderBy: { column: "created_at", ascending: false } });

  const { scripts, trainings } = useMemo(() => {
    const t = term.trim().toLowerCase();
    const list = ((query.data ?? []) as any[]).filter((r) =>
      t
        ? [r.title, r.category, r.description].some((v) =>
            String(v ?? "").toLowerCase().includes(t),
          )
        : true,
    );
    return {
      scripts: list.filter((r) => kindOf(r) === "script"),
      trainings: list.filter((r) => kindOf(r) === "treinamento"),
    };
  }, [query.data, term]);

  return (
    <div>
      <PageHeader
        title="Scripts e treinamentos"
        description="Padronize a abordagem da equipe e centralize treinamentos, materiais e acessos."
      />

      <div className="mb-6 flex items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por título, categoria…"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </div>
      </div>

      {query.isLoading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Carregando…
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-2">
          <Section
            title="Scripts de venda"
            description="Abordagens, respostas a objeções e perguntas frequentes."
            rows={scripts}
            onNew={() => setDialog("script")}
            emptyText="Nenhum script cadastrado ainda."
          />
          <Section
            title="Treinamentos e cursos"
            description="Vídeos, materiais e acessos para capacitar a equipe."
            rows={trainings}
            onNew={() => setDialog("treinamento")}
            emptyText="Nenhum treinamento cadastrado ainda."
          />
        </div>
      )}

      <ScriptDialog
        open={!!dialog}
        onOpenChange={(v) => !v && setDialog(null)}
        kind={dialog ?? "script"}
        productId={productId}
      />
    </div>
  );
}

function Section({
  title,
  description,
  rows,
  onNew,
  emptyText,
}: {
  title: string;
  description: string;
  rows: any[];
  onNew: () => void;
  emptyText: string;
}) {
  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button size="sm" onClick={onNew}>
          <Plus className="mr-1.5 size-4" /> Novo
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={emptyText}
          description="Crie o primeiro item com vídeo, materiais e acessos."
          action={<Button onClick={onNew}>Cadastrar agora</Button>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((row) => (
            <Link
              key={row.id}
              to="/scripts/$id"
              params={{ id: row.id }}
              className="surface-card block overflow-hidden p-0 transition hover:shadow-md"
            >
              {row.image_url ? (
                <img
                  src={row.image_url}
                  alt={row.title}
                  loading="lazy"
                  className="h-32 w-full object-cover"
                />
              ) : null}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{row.title}</p>
                  {row.is_demo && <DemoBadge />}
                </div>
                {row.category && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{row.category}</p>
                )}
                {row.description && (
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {row.description}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary">{row.script_type ?? "script"}</Badge>
                  <Badge variant={row.status === "arquivado" ? "outline" : "secondary"}>
                    {row.status ?? "ativo"}
                  </Badge>
                  <Badge variant="outline">
                    {row.visibility_scope === "equipe" ? "Somente equipe" : "Geral"}
                  </Badge>
                  {row.video_url && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <PlayCircle className="size-3.5" /> vídeo
                    </span>
                  )}
                  {Array.isArray(row.links) && row.links.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Link2 className="size-3.5" /> {row.links.length}
                    </span>
                  )}
                  {Array.isArray(row.credentials) && row.credentials.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <KeyRound className="size-3.5" /> acessos
                    </span>
                  )}
                  {kindOf(row) === "treinamento" && (
                    <GraduationCap className="ml-auto size-4 text-muted-foreground" />
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
