/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser, ROLE_LABELS } from "@/hooks/useAuth";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CompanySettingsCard } from "@/components/settings/CompanySettingsCard";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações — OS" },
      { name: "description", content: "Dados do seu perfil, senha e informações de acesso." },
      { property: "og:title", content: "Configurações — OS" },
      { property: "og:description", content: "Perfil, senha e informações de acesso." },
    ],
  }),
  component: Configuracoes,
});

function Configuracoes() {
  const { profile, email, roles, userId, isAdmin } = useCurrentUser();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [whatsapp, setWhatsapp] = useState("");
  const [savingWhatsapp, setSavingWhatsapp] = useState(false);
  const [password, setPassword] = useState("");

  const whatsappQuery = useQuery({
    queryKey: ["my-whatsapp", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return typeof data.user.user_metadata?.whatsapp === "string"
        ? data.user.user_metadata.whatsapp
        : "";
    },
  });

  useEffect(() => {
    if (profile) setForm(profile);
  }, [profile]);

  useEffect(() => {
    if (whatsappQuery.data !== undefined) setWhatsapp(whatsappQuery.data);
  }, [whatsappQuery.data]);

  async function save() {
    if (!form.full_name?.trim()) {
      toast.error("Informe seu nome completo.");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: form.full_name,
        phone: form.phone,
        cargo: form.cargo,
        setor: form.setor,
        avatar_url: form.avatar_url,
      })
      .eq("id", userId!);
    setSaving(false);
    if (error) toast.error("Não foi possível salvar seus dados.");
    else {
      toast.success("Perfil atualizado.");
      queryClient.invalidateQueries({ queryKey: ["me", userId] });
    }
  }

  async function changePassword() {
    if (password.length < 6) {
      toast.error("A nova senha precisa ter ao menos 6 caracteres.");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) toast.error("Não foi possível alterar a senha.");
    else {
      setPassword("");
      toast.success("Senha alterada.");
    }
  }

  async function saveWhatsapp() {
    const normalized = whatsapp.replace(/\D/g, "");
    if (normalized.length < 10 || normalized.length > 15) {
      toast.error("Informe um WhatsApp válido, com DDI e DDD.");
      return;
    }
    setSavingWhatsapp(true);
    const { data: current, error: userError } = await supabase.auth.getUser();
    const { error } = userError
      ? { error: userError }
      : await supabase.auth.updateUser({
          data: {
            ...(current.user.user_metadata ?? {}),
            whatsapp: normalized,
          },
        });
    setSavingWhatsapp(false);
    if (error) toast.error("Não foi possível salvar seu WhatsApp.");
    else {
      setWhatsapp(normalized);
      toast.success("Seu WhatsApp foi atualizado.");
      queryClient.invalidateQueries({ queryKey: ["my-whatsapp", userId] });
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="Configurações" description="Ajuste seus dados de perfil e sua senha." />

      {isAdmin && <CompanySettingsCard />}

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Meu perfil</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="full_name">Nome completo *</Label>
            <Input
              id="full_name"
              className="mt-1.5"
              value={form.full_name ?? ""}
              onChange={(e) => setForm((f: any) => ({ ...f, full_name: e.target.value }))}
            />
          </div>
          <div>
            <Label>E-mail</Label>
            <Input className="mt-1.5" value={email ?? ""} disabled />
          </div>
          <div>
            <Label htmlFor="phone">Telefone interno</Label>
            <Input
              id="phone"
              className="mt-1.5"
              value={form.phone ?? ""}
              onChange={(e) => setForm((f: any) => ({ ...f, phone: e.target.value }))}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Este telefone não é usado como WhatsApp no catálogo.
            </p>
          </div>
          <div>
            <Label htmlFor="cargo">Cargo</Label>
            <Input
              id="cargo"
              className="mt-1.5"
              value={form.cargo ?? ""}
              onChange={(e) => setForm((f: any) => ({ ...f, cargo: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="setor">Setor</Label>
            <Input
              id="setor"
              className="mt-1.5"
              value={form.setor ?? ""}
              onChange={(e) => setForm((f: any) => ({ ...f, setor: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Perfis de acesso</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {roles.length === 0 && (
                <span className="text-sm text-muted-foreground">Nenhum perfil atribuído.</span>
              )}
              {roles.map((r) => (
                <Badge key={r} variant="secondary">
                  {ROLE_LABELS[r]}
                </Badge>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Somente um administrador pode alterar perfis de acesso.
            </p>
          </div>
          <div className="sm:col-span-2">
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />} Salvar alterações
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Meu WhatsApp</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Cadastre o número que será usado quando um cliente escolher você como vendedor. Este
            número fica visível somente para você dentro do sistema.
          </p>
          <div>
            <Label htmlFor="my-whatsapp">WhatsApp com DDI e DDD</Label>
            <Input
              id="my-whatsapp"
              className="mt-1.5"
              inputMode="tel"
              autoComplete="tel"
              placeholder="55 45 99999-9999"
              value={whatsapp}
              onChange={(event) => setWhatsapp(event.target.value)}
            />
          </div>
          <Button onClick={saveWhatsapp} disabled={savingWhatsapp || whatsappQuery.isLoading}>
            {savingWhatsapp && <Loader2 className="mr-2 size-4 animate-spin" />} Salvar meu WhatsApp
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alterar senha</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="nova-senha">Nova senha</Label>
            <Input
              id="nova-senha"
              type="password"
              className="mt-1.5"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button variant="outline" onClick={changePassword}>
            Alterar senha
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
