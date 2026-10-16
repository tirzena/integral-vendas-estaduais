import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Search,
  ArrowRight,
  Printer,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Expand,
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { guideChapters, type GuideSystem } from "./system-guide-content";

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export function SystemUsageGuide({ system }: { system: GuideSystem }) {
  const { canOpen, loading } = usePermissions();
  const [term, setTerm] = useState("");
  const [topic, setTopic] = useState("inicio");
  const [enlarged, setEnlarged] = useState(false);
  const chapters = guideChapters.filter((c) => system === "general" || c.scope === "both");
  const search = normalize(term.trim());
  const filtered = useMemo(
    () =>
      chapters.filter(
        (c) =>
          !search ||
          normalize(
            [
              c.title,
              c.group,
              c.summary,
              ...c.steps.flatMap((s) => [s.title, s.text]),
              ...c.tips,
            ].join(" "),
          ).includes(search),
      ),
    [chapters, search],
  );
  const selected = filtered.find((c) => c.id === topic) ?? filtered[0];
  const index = selected ? filtered.findIndex((c) => c.id === selected.id) : -1;
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("topico");
    if (id) setTopic(id);
  }, []);
  function choose(id: string) {
    setTopic(id);
    setEnlarged(false);
    const url = new URL(window.location.href);
    url.searchParams.set("topico", id);
    window.history.replaceState(null, "", url);
  }
  const groups = [...new Set(filtered.map((c) => c.group))];
  return (
    <div className="space-y-5">
      <PageHeader
        title="Como usar o sistema"
        description={
          system === "general"
            ? "Manual ilustrado da Direção Geral: operação, revisões e administração."
            : "Manual ilustrado do Estadual: sua rotina de vendas, pedidos e recebimentos."
        }
        actions={
          <Button
            variant="outline"
            disabled={!selected}
            onClick={() => window.print()}
            className="print:hidden"
          >
            <Printer className="mr-2 size-4" />
            Imprimir instrução
          </Button>
        }
      />
      <div className="surface-card relative overflow-hidden border-primary/20 p-5">
        <div className="flex items-start gap-3">
          <BookOpen className="mt-1 size-6 shrink-0 text-primary" />
          <div>
            <p className="font-semibold">Encontre a tarefa. Siga os passos. Confira o resultado.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {chapters.length} assuntos ·{" "}
              {system === "general" ? "Direção Geral" : "Vendas Estaduais"} · Instruções conforme as
              funções do sistema.
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Os exemplos visuais são ilustrativos. Os botões e dados disponíveis na sua conta dependem
          dos cargos e concessões. Ler uma instrução não concede acesso para executar a ação.
        </p>
      </div>
      <div className="relative print:hidden">
        <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
        <Input
          className="pl-10"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="O que você quer fazer? Ex.: aprovar, pagamento, catálogo, crédito…"
          aria-label="Buscar instrução de uso"
        />
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[260px_minmax(0,1fr)] print:block">
        <aside
          aria-label="Assuntos do manual"
          className="surface-card max-h-72 overflow-y-auto p-3 lg:sticky lg:top-20 lg:max-h-[75vh] print:hidden"
        >
          <p role="status" className="mb-3 px-2 text-xs text-muted-foreground">
            {filtered.length} assunto(s) encontrado(s)
          </p>
          {groups.map((group) => (
            <div key={group} className="mb-3">
              <p className="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group}
              </p>
              {filtered
                .filter((c) => c.group === group)
                .map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-current={c.id === selected?.id ? "page" : undefined}
                    onClick={() => choose(c.id)}
                    className={
                      "block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors " +
                      (c.id === selected?.id
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted")
                    }
                  >
                    {c.title}
                  </button>
                ))}
            </div>
          ))}
        </aside>
        {selected ? (
          <article key={selected.id} className="surface-card min-w-0 space-y-6 p-4 sm:p-6">
            <header>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                {selected.group}
              </p>
              <h2 className="mt-2 text-2xl font-bold">{selected.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{selected.summary}</p>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                <span className="rounded-full bg-muted px-3 py-1">
                  {selected.steps.length} passos
                </span>
                <span className="text-muted-foreground">Caminho: {selected.route}</span>
                {!loading && canOpen(selected.route) && (
                  <a
                    href={selected.route}
                    className="inline-flex items-center gap-1 font-medium text-primary print:hidden"
                  >
                    Abrir área
                    <ArrowRight className="size-3" />
                  </a>
                )}
              </div>
            </header>
            <figure className="overflow-hidden rounded-xl border bg-muted/20">
              <button
                type="button"
                onClick={() => setEnlarged(true)}
                className="group relative block w-full text-left print:pointer-events-none"
                aria-label={"Ampliar ilustração: " + selected.title}
              >
                <img
                  src={"/help/usage/" + selected.id + ".svg"}
                  alt={"Ilustração dos primeiros passos de " + selected.title}
                  width={960}
                  height={620}
                  className="h-auto w-full"
                />
                <span className="absolute bottom-3 right-3 flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs group-hover:bg-muted print:hidden">
                  <Expand className="size-3" />
                  Ampliar
                </span>
              </button>
              <figcaption className="border-t p-3 text-xs text-muted-foreground">
                Ilustração de orientação com etapas numeradas. Consulte as instruções completas
                abaixo; a apresentação da sua tela pode variar conforme o perfil.
              </figcaption>
            </figure>
            <section aria-label="Passo a passo">
              <h3 className="mb-4 font-semibold">Passo a passo</h3>
              <ol className="space-y-5">
                {selected.steps.map((step, i) => (
                  <li key={step.title} className="flex gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                      {i + 1}
                    </span>
                    <div>
                      <h4 className="font-semibold">{step.title}</h4>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        {step.text}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
            <section className="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <h3 className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="size-4 text-primary" />
                Antes de concluir
              </h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
                {selected.checks.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </section>
            {!!selected.tips.length && (
              <section className="space-y-2 border-l-2 border-primary pl-4">
                <h3 className="font-semibold">Entenda esta regra</h3>
                {selected.tips.map((t) => (
                  <p key={t} className="text-sm leading-relaxed text-muted-foreground">
                    {t}
                  </p>
                ))}
              </section>
            )}
            <footer className="flex flex-wrap justify-between gap-2 border-t pt-4 print:hidden">
              <Button
                variant="outline"
                disabled={index < 1}
                onClick={() => filtered[index - 1] && choose(filtered[index - 1]!.id)}
              >
                <ChevronLeft className="mr-1 size-4" />
                Anterior
              </Button>
              <Button
                variant="outline"
                disabled={index >= filtered.length - 1}
                onClick={() => filtered[index + 1] && choose(filtered[index + 1]!.id)}
              >
                Próximo
                <ChevronRight className="ml-1 size-4" />
              </Button>
            </footer>
          </article>
        ) : (
          <div role="status" className="surface-card p-8">
            <h2 className="font-semibold">Nenhuma instrução encontrada</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Tente buscar por pedido, pagamento, comissão, catálogo ou perfil.
            </p>
            <Button variant="link" onClick={() => setTerm("")}>
              Limpar busca
            </Button>
          </div>
        )}
      </div>
      <Dialog open={enlarged} onOpenChange={setEnlarged}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{selected?.title}</DialogTitle>
          </DialogHeader>
          {selected && (
            <img
              src={"/help/usage/" + selected.id + ".svg"}
              alt={"Ilustração ampliada de " + selected.title}
              width={960}
              height={620}
              className="h-auto w-full"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
