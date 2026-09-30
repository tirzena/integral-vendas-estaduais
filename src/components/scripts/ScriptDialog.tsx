/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useRows, useSaveRow } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type Kind = "script" | "treinamento";

export const SCRIPT_TYPES = [
  { value: "script", label: "Script de abordagem" },
  { value: "objecao", label: "Resposta a objeção" },
  { value: "faq", label: "Perguntas frequentes" },
];

export const TRAINING_TYPES = [
  { value: "treinamento", label: "Treinamento" },
  { value: "curso", label: "Curso" },
];

export function kindOf(row: any): Kind {
  return row?.script_type === "treinamento" || row?.script_type === "curso"
    ? "treinamento"
    : "script";
}

type LinkItem = { label: string; url: string };
type CredItem = { label: string; login: string; password: string; url: string };

function asArray<T>(value: any): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function ScriptDialog({
  open,
  onOpenChange,
  kind,
  editing,
  productId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: Kind;
  editing?: any | null;
  productId?: string | null;
}) {
  const isTraining = kind === "treinamento";
  const [values, setValues] = useState<Record<string, any>>({});
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [creds, setCreds] = useState<CredItem[]>([]);
  const save = useSaveRow("sales_scripts", () => onOpenChange(false));
  const teams = useRows<any>("teams", { orderBy: { column: "name", ascending: true } });

  useEffect(() => {
    if (!open) return;
    setValues({
      title: editing?.title ?? "",
      category: editing?.category ?? "",
      script_type: editing?.script_type ?? (isTraining ? "treinamento" : "script"),
      status: editing?.status ?? "ativo",
      description: editing?.description ?? "",
      video_url: editing?.video_url ?? "",
      image_url: editing?.image_url ?? "",
      content: editing?.content ?? "",
      visibility_scope: editing?.visibility_scope ?? "geral",
      team_id: editing?.team_id ?? "",
    });
    setLinks(asArray<LinkItem>(editing?.links));
    setCreds(asArray<CredItem>(editing?.credentials));
  }, [open, editing, isTraining]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!String(values["title"] ?? "").trim()) return;
    const payload: Record<string, any> = {
      ...values,
      links: links.filter((l) => l.url?.trim()),
      credentials: creds.filter((c) => c.login?.trim() || c.password?.trim() || c.url?.trim()),
    };
    if (payload["visibility_scope"] === "geral") payload["team_id"] = null;
    if (payload["visibility_scope"] === "equipe" && !payload["team_id"]) return;
    Object.keys(payload).forEach((k) => {
      if (payload[k] === "") payload[k] = null;
    });
    if (editing?.id) payload["id"] = editing.id;
    else if (productId && productId !== "todos") payload["product_id"] = productId;
    save.mutate(payload);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Editar" : isTraining ? "Novo treinamento ou curso" : "Novo script"}
          </DialogTitle>
          <DialogDescription>
            Adicione o conteúdo, links de vídeo ou imagem, materiais e acessos da equipe.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="title">Título *</Label>
            <Input
              id="title"
              className="mt-1.5"
              value={values["title"] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
            />
          </div>

          <div>
            <Label htmlFor="category">Categoria</Label>
            <Input
              id="category"
              className="mt-1.5"
              value={values["category"] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, category: e.target.value }))}
            />
          </div>

          <div>
            <Label htmlFor="script_type">Tipo</Label>
            <Select
              value={values["script_type"] ?? ""}
              onValueChange={(val) => setValues((v) => ({ ...v, script_type: val }))}
            >
              <SelectTrigger id="script_type" className="mt-1.5">
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                {(isTraining ? TRAINING_TYPES : SCRIPT_TYPES).map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="status">Situação</Label>
            <Select
              value={values["status"] ?? ""}
              onValueChange={(val) => setValues((v) => ({ ...v, status: val }))}
            >
              <SelectTrigger id="status" className="mt-1.5">
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="arquivado">Arquivado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="visibility_scope">Quem pode visualizar</Label>
            <Select
              value={values["visibility_scope"] ?? "geral"}
              onValueChange={(val) => setValues((v) => ({ ...v, visibility_scope: val, team_id: val === "geral" ? "" : v.team_id }))}
            >
              <SelectTrigger id="visibility_scope" className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="geral">Todos os membros</SelectItem>
                <SelectItem value="equipe">Somente uma equipe</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {values["visibility_scope"] === "equipe" && (
            <div>
              <Label htmlFor="team_id">Equipe</Label>
              <Select value={values["team_id"] ?? ""} onValueChange={(val) => setValues((v) => ({ ...v, team_id: val }))}>
                <SelectTrigger id="team_id" className="mt-1.5"><SelectValue placeholder="Escolha a equipe" /></SelectTrigger>
                <SelectContent>{(teams.data ?? []).map((team: any) => <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label htmlFor="video_url">Link do vídeo (YouTube, Instagram…)</Label>
            <Input
              id="video_url"
              className="mt-1.5"
              placeholder="https://youtu.be/…"
              value={values["video_url"] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, video_url: e.target.value }))}
            />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="image_url">Link da imagem de capa</Label>
            <Input
              id="image_url"
              className="mt-1.5"
              placeholder="https://…/imagem.jpg"
              value={values["image_url"] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, image_url: e.target.value }))}
            />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="description">Resumo</Label>
            <Textarea
              id="description"
              className="mt-1.5"
              value={values["description"] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
            />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="content">Conteúdo</Label>
            <Textarea
              id="content"
              rows={6}
              className="mt-1.5"
              value={values["content"] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, content: e.target.value }))}
            />
          </div>

          <div className="sm:col-span-2">
            <div className="flex items-center justify-between">
              <Label>Materiais e links</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLinks((l) => [...l, { label: "", url: "" }])}
              >
                <Plus className="mr-1 size-3.5" /> Adicionar
              </Button>
            </div>
            <div className="mt-2 space-y-2">
              {links.map((l, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    placeholder="Nome do material"
                    value={l.label}
                    onChange={(e) =>
                      setLinks((arr) =>
                        arr.map((it, idx) => (idx === i ? { ...it, label: e.target.value } : it)),
                      )
                    }
                  />
                  <Input
                    placeholder="https://…"
                    value={l.url}
                    onChange={(e) =>
                      setLinks((arr) =>
                        arr.map((it, idx) => (idx === i ? { ...it, url: e.target.value } : it)),
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remover material"
                    onClick={() => setLinks((arr) => arr.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              ))}
              {links.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Cole aqui links de PDFs, planilhas, pastas ou vídeos extras.
                </p>
              )}
            </div>
          </div>

          <div className="sm:col-span-2">
            <div className="flex items-center justify-between">
              <Label>Acessos (login e senha)</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setCreds((c) => [...c, { label: "", login: "", password: "", url: "" }])
                }
              >
                <Plus className="mr-1 size-3.5" /> Adicionar
              </Button>
            </div>
            <div className="mt-2 space-y-2">
              {creds.map((c, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
                  <Input
                    placeholder="Plataforma"
                    value={c.label}
                    onChange={(e) =>
                      setCreds((arr) =>
                        arr.map((it, idx) => (idx === i ? { ...it, label: e.target.value } : it)),
                      )
                    }
                  />
                  <Input
                    placeholder="Endereço de acesso"
                    value={c.url}
                    onChange={(e) =>
                      setCreds((arr) =>
                        arr.map((it, idx) => (idx === i ? { ...it, url: e.target.value } : it)),
                      )
                    }
                  />
                  <Input
                    placeholder="Login"
                    value={c.login}
                    onChange={(e) =>
                      setCreds((arr) =>
                        arr.map((it, idx) => (idx === i ? { ...it, login: e.target.value } : it)),
                      )
                    }
                  />
                  <Input
                    placeholder="Senha"
                    value={c.password}
                    onChange={(e) =>
                      setCreds((arr) =>
                        arr.map((it, idx) =>
                          idx === i ? { ...it, password: e.target.value } : it,
                        ),
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remover acesso"
                    onClick={() => setCreds((arr) => arr.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              ))}
              {creds.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Guarde aqui os acessos que a equipe precisa usar nesse material.
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
