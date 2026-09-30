/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useAuth";
import { PageHeader, EmptyState } from "@/components/common/PageHeader";
import { RouteGuard } from "@/components/common/RouteGuard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/acessos")({
  head: () => ({
    meta: [
      { title: "Acessos — OS" },
      { name: "description", content: "Cofre seguro de logins e senhas da empresa." },
    ],
  }),
  component: () => (
    <RouteGuard capability="manage_access_vault">
      <AccessVaultPage />
    </RouteGuard>
  ),
});

const emptyForm = {
  id: null as string | null,
  title: "",
  category: "Instagram",
  username: "",
  secret: "",
  page_url: "",
  notes: "",
  visibility_scope: "privado",
  team_id: "",
  viewers_can_reveal: false,
  viewers_can_edit: false,
};
const categories = [
  "Instagram",
  "TikTok",
  "Facebook",
  "Site",
  "Landing page",
  "E-mail",
  "Google",
  "Anúncios",
  "Financeiro",
  "Fornecedor",
  "Outro",
];

function AccessVaultPage() {
  const { userId, isAdmin } = useCurrentUser();
  const qc = useQueryClient();
  const [term, setTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [loadingSecret, setLoadingSecret] = useState<string | null>(null);

  const entries = useQuery({
    queryKey: ["company-access-vault"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("company_access_vault")
        .select(
          "id,title,category,username,page_url,notes,visibility_scope,team_id,viewers_can_reveal,viewers_can_edit,created_by,updated_at,teams(name)",
        )
        .order("title");
      if (error) throw error;
      return data ?? [];
    },
  });
  const teams = useQuery({
    queryKey: ["access-vault-teams"],
    queryFn: async () => {
      const { data, error } = await supabase.from("teams").select("id,name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo(
    () =>
      (entries.data ?? []).filter((row: any) =>
        [row.title, row.category, row.username, row.page_url].some((v) =>
          String(v ?? "")
            .toLowerCase()
            .includes(term.toLowerCase()),
        ),
      ),
    [entries.data, term],
  );
  const canEdit = (row: any) => isAdmin || row.created_by === userId || row.viewers_can_edit;

  function openNew() {
    setForm(emptyForm);
    setDialogOpen(true);
  }
  function openEdit(row: any) {
    setForm({
      id: row.id,
      title: row.title ?? "",
      category: row.category ?? "Outro",
      username: row.username ?? "",
      secret: "",
      page_url: row.page_url ?? "",
      notes: row.notes ?? "",
      visibility_scope: row.visibility_scope ?? "privado",
      team_id: row.team_id ?? "",
      viewers_can_reveal: !!row.viewers_can_reveal,
      viewers_can_edit: !!row.viewers_can_edit,
    });
    setDialogOpen(true);
  }

  async function save() {
    if (!form.title.trim()) return toast.error("Informe o nome do acesso.");
    if (form.visibility_scope === "equipe" && !form.team_id)
      return toast.error("Escolha a equipe.");
    setSaving(true);
    const { error } = await (supabase as any).rpc("save_company_access", {
      p_id: form.id,
      p_title: form.title,
      p_category: form.category,
      p_username: form.username,
      p_secret: form.secret,
      p_page_url: form.page_url,
      p_notes: form.notes,
      p_visibility_scope: form.visibility_scope,
      p_team_id: form.team_id || null,
      p_viewers_can_reveal: form.viewers_can_reveal,
      p_viewers_can_edit: form.viewers_can_edit,
    });
    setSaving(false);
    if (error) return toast.error(error.message ?? "Não foi possível salvar o acesso.");
    toast.success(form.id ? "Acesso atualizado." : "Acesso guardado com segurança.");
    setDialogOpen(false);
    setForm(emptyForm);
    qc.invalidateQueries({ queryKey: ["company-access-vault"] });
  }

  async function reveal(row: any) {
    if (revealed[row.id] !== undefined) {
      setRevealed((v) => {
        const n = { ...v };
        delete n[row.id];
        return n;
      });
      return;
    }
    setLoadingSecret(row.id);
    const { data, error } = await (supabase as any).rpc("reveal_company_access_secret", {
      p_access_id: row.id,
    });
    setLoadingSecret(null);
    if (error)
      return toast.error(error.message ?? "Você não tem permissão para revelar esta senha.");
    setRevealed((v) => ({ ...v, [row.id]: data ?? "" }));
  }

  async function copy(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copiado.`);
  }
  async function remove(row: any) {
    if (!window.confirm(`Excluir o acesso “${row.title}”?`)) return;
    const { error } = await (supabase as any).rpc("delete_company_access", { p_access_id: row.id });
    if (error) return toast.error(error.message ?? "Não foi possível excluir.");
    toast.success("Acesso excluído.");
    qc.invalidateQueries({ queryKey: ["company-access-vault"] });
  }

  return (
    <div>
      <PageHeader
        title="Acessos"
        description="Guarde logins, senhas e links importantes da empresa com controle de visualização e edição."
        action={
          <Button onClick={openNew}>
            <Plus className="mr-2 size-4" />
            Novo acesso
          </Button>
        }
      />
      <Card className="mb-5 border-emerald-200 bg-emerald-50/50">
        <CardContent className="flex gap-3 p-4 text-sm text-emerald-950">
          <ShieldCheck className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-medium">Cofre protegido</p>
            <p className="text-emerald-900/75">
              As senhas ficam cifradas. Cada revelação é registrada, e a permissão de revelar pode
              ser diferente da permissão de apenas visualizar a ficha.
            </p>
          </div>
        </CardContent>
      </Card>
      <div className="relative mb-5 max-w-md">
        <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar sistema, usuário ou categoria…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
      </div>
      {entries.isLoading ? (
        <div className="flex items-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Carregando acessos…
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nenhum acesso encontrado"
          description="Cadastre o primeiro login seguro da empresa."
          action={<Button onClick={openNew}>Cadastrar agora</Button>}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row: any) => {
            const secret = revealed[row.id];
            return (
              <Card key={row.id} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 gap-3">
                      <div className="rounded-xl bg-muted p-2.5">
                        <KeyRound className="size-5" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="truncate text-base">{row.title}</CardTitle>
                        <p className="mt-1 text-xs text-muted-foreground">{row.category}</p>
                      </div>
                    </div>
                    <Badge variant="outline">
                      {row.visibility_scope === "geral"
                        ? "Geral"
                        : row.visibility_scope === "equipe"
                          ? (row.teams?.name ?? "Equipe")
                          : "Privado"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Login ou usuário</p>
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-medium">
                        {row.username || "Não informado"}
                      </p>
                      {row.username && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          onClick={() => copy(row.username, "Login")}
                        >
                          <Copy className="size-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Senha</p>
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate font-mono text-sm">
                        {secret !== undefined ? secret || "Sem senha cadastrada" : "••••••••••••"}
                      </p>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        onClick={() => reveal(row)}
                        disabled={loadingSecret === row.id}
                      >
                        {loadingSecret === row.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : secret !== undefined ? (
                          <EyeOff className="size-4" />
                        ) : (
                          <Eye className="size-4" />
                        )}
                      </Button>
                      {secret && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          onClick={() => copy(secret, "Senha")}
                        >
                          <Copy className="size-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {row.page_url && (
                    <a
                      className="inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
                      href={row.page_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink className="size-4" />
                      Abrir página
                    </a>
                  )}
                  {row.notes && (
                    <p className="line-clamp-3 text-sm text-muted-foreground">{row.notes}</p>
                  )}
                  {canEdit(row) && (
                    <div className="flex gap-2 border-t pt-3">
                      <Button size="sm" variant="outline" onClick={() => openEdit(row)}>
                        <Pencil className="mr-1.5 size-4" />
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => remove(row)}
                      >
                        <Trash2 className="mr-1.5 size-4" />
                        Excluir
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar acesso" : "Novo acesso"}</DialogTitle>
            <DialogDescription>
              Defina quem pode ver a ficha, revelar a senha e fazer alterações.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Nome do sistema ou conta *</Label>
              <Input
                className="mt-1.5"
                placeholder="Ex.: Instagram comercial"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div>
              <Label>Categoria</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Link da página</Label>
              <Input
                className="mt-1.5"
                placeholder="https://…"
                value={form.page_url}
                onChange={(e) => setForm((f) => ({ ...f, page_url: e.target.value }))}
              />
            </div>
            <div>
              <Label>Login, e-mail ou usuário</Label>
              <Input
                className="mt-1.5"
                autoComplete="off"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              />
            </div>
            <div>
              <Label>{form.id ? "Nova senha (deixe vazia para manter)" : "Senha"}</Label>
              <Input
                className="mt-1.5"
                type="password"
                autoComplete="new-password"
                value={form.secret}
                onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Detalhes e observações</Label>
              <Textarea
                className="mt-1.5"
                placeholder="Recuperação, responsável, instruções…"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Quem pode visualizar</Label>
              <Select
                value={form.visibility_scope}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    visibility_scope: v,
                    team_id: v === "equipe" ? f.team_id : "",
                  }))
                }
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="privado">Somente eu e administradores</SelectItem>
                  <SelectItem value="equipe">Uma equipe</SelectItem>
                  <SelectItem value="geral">Todos os membros</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.visibility_scope === "equipe" && (
              <div className="sm:col-span-2">
                <Label>Equipe</Label>
                <Select
                  value={form.team_id}
                  onValueChange={(v) => setForm((f) => ({ ...f, team_id: v }))}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Escolha a equipe" />
                  </SelectTrigger>
                  <SelectContent>
                    {(teams.data ?? []).map((t: any) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {form.visibility_scope !== "privado" && (
              <>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">Podem revelar a senha</p>
                    <p className="text-xs text-muted-foreground">Permite ver e copiar a senha.</p>
                  </div>
                  <Switch
                    checked={form.viewers_can_reveal}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, viewers_can_reveal: v }))}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">Podem editar</p>
                    <p className="text-xs text-muted-foreground">Permite alterar ou excluir.</p>
                  </div>
                  <Switch
                    checked={form.viewers_can_edit}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, viewers_can_edit: v }))}
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}Salvar acesso
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
