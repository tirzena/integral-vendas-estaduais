/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { changePasswordAndSignOut } from "@/lib/password-session";
import { useCurrentUser, ROLE_LABELS } from "@/hooks/useAuth";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
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
  const { profile, email, roles, userId, isAdmin, viewAs } = useCurrentUser();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [whatsapp, setWhatsapp] = useState("");
  const [savingWhatsapp, setSavingWhatsapp] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview(null);
      return;
    }
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);
  const [newEmail, setNewEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  useEffect(() => {
    setNewEmail(email ?? "");
  }, [email]);

  const whatsappQuery = useQuery({
    queryKey: ["my-whatsapp", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return typeof data.user.user_metadata?.["whatsapp"] === "string"
        ? data.user.user_metadata["whatsapp"]
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
    if (viewAs || !userId) return void toast.error("Saia do modo espelho para alterar seu perfil.");
    if (!form.full_name?.trim()) return void toast.error("Informe seu nome completo.");
    setSaving(true);
    let uploadedPath: string | null = null;
    try {
      let avatar = form.avatar_url ?? null;
      if (avatarFile) {
        const bitmap = await createImageBitmap(avatarFile);
        const canvas = document.createElement("canvas");
        canvas.width = 512;
        canvas.height = 512;
        const edge = Math.min(bitmap.width, bitmap.height);
        canvas
          .getContext("2d")!
          .drawImage(
            bitmap,
            (bitmap.width - edge) / 2,
            (bitmap.height - edge) / 2,
            edge,
            edge,
            0,
            0,
            512,
            512,
          );
        bitmap.close();
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (value) =>
              value ? resolve(value) : reject(new Error("Não foi possível preparar a foto.")),
            "image/jpeg",
            0.85,
          ),
        );
        uploadedPath = userId + "/" + crypto.randomUUID() + ".jpg";
        const upload = await supabase.storage
          .from("profile-avatars")
          .upload(uploadedPath, blob, { contentType: "image/jpeg", upsert: false });
        if (upload.error) throw upload.error;
        avatar = "storage://profile-avatars/" + uploadedPath;
      }
      const { error } = await (supabase as any).rpc("integral_update_my_profile", {
        p_profile: {
          full_name: form.full_name.trim(),
          phone: form.phone || null,
          avatar_url: avatar,
        },
      });
      if (error) throw error;
      setAvatarFile(null);
      toast.success("Perfil atualizado.");
      await queryClient.invalidateQueries({ queryKey: ["me", userId] });
      await queryClient.invalidateQueries({ queryKey: ["members"] });
    } catch (error) {
      if (uploadedPath) await supabase.storage.from("profile-avatars").remove([uploadedPath]);
      toast.error((error as Error).message || "Não foi possível salvar seus dados.");
    } finally {
      setSaving(false);
    }
  }

  async function changePassword() {
    if (viewAs) return void toast.error("Saia do modo espelho para alterar suas credenciais.");
    if (password.length < 6) {
      toast.error("A nova senha precisa ter ao menos 6 caracteres.");
      return;
    }
    if (password !== confirmPassword)
      return void toast.error("A confirmação da senha não confere.");
    setSavingPassword(true);
    try {
      await changePasswordAndSignOut(supabase.auth, password);
      setPassword("");
      setConfirmPassword("");
      toast.success("Senha alterada. Entre novamente com a nova senha.");
      window.location.replace("/auth");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSavingPassword(false);
    }
  }

  async function changeEmail() {
    if (viewAs) return void toast.error("Saia do modo espelho para alterar seu e-mail.");
    if (!/^\S+@\S+\.\S+$/.test(newEmail)) return void toast.error("Informe um e-mail válido.");
    setSavingEmail(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail.trim().toLowerCase() });
      if (error) throw error;
      toast.success("Alteração solicitada. Confira as instruções enviadas por e-mail.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSavingEmail(false);
    }
  }

  async function saveWhatsapp() {
    if (viewAs) return void toast.error("Saia do modo espelho para alterar seu WhatsApp.");
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

      <Card>
        <CardHeader>
          <CardTitle>E-mail de acesso</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label htmlFor="access-email">E-mail que você utiliza para entrar no sistema</Label>
          <Input
            id="access-email"
            type="email"
            value={newEmail}
            disabled={!!viewAs}
            onChange={(e) => setNewEmail(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            A alteração segue a confirmação de e-mail da sua conta. Sua identificação e seu
            histórico no sistema são preservados.
          </p>
          <Button
            disabled={savingEmail || !!viewAs || !newEmail || newEmail === email}
            onClick={changeEmail}
          >
            {savingEmail ? "Solicitando…" : "Alterar meu e-mail"}
          </Button>
        </CardContent>
      </Card>
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Meu perfil</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 flex flex-wrap items-center gap-4">
            <Avatar className="size-20">
              <AvatarImage src={avatarPreview ?? form.avatar_url ?? undefined} />
              <AvatarFallback>
                {String(form.full_name ?? "?")
                  .slice(0, 2)
                  .toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-2">
              <Label htmlFor="profile-photo">Foto do perfil</Label>
              <Input
                id="profile-photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={saving || !!viewAs}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  if (
                    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
                    file.size > 5 * 1024 * 1024
                  )
                    return void toast.error("Escolha uma imagem JPG, PNG ou WebP de até 5 MB.");
                  setAvatarFile(file);
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={saving || !!viewAs || (!form.avatar_url && !avatarFile)}
                onClick={() => {
                  setAvatarFile(null);
                  setForm((current: any) => ({ ...current, avatar_url: null }));
                }}
              >
                Remover foto
              </Button>
              <p className="text-xs text-muted-foreground">
                A foto será salva junto com as alterações do perfil.
              </p>
            </div>
          </div>

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
            <Input id="cargo" className="mt-1.5" value={form.cargo ?? ""} readOnly />
          </div>
          <div>
            <Label htmlFor="setor">Setor</Label>
            <Input id="setor" className="mt-1.5" value={form.setor ?? ""} readOnly />
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
            <Button onClick={save} disabled={saving || !!viewAs}>
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
          <Button
            onClick={saveWhatsapp}
            disabled={savingWhatsapp || whatsappQuery.isLoading || !!viewAs}
          >
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
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              disabled={savingPassword || !!viewAs}
              className="mt-1.5"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="confirm-password">Confirmar nova senha</Label>
            <Input
              id="confirm-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              disabled={savingPassword || !!viewAs}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(event) => setShowPassword(event.target.checked)}
            />
            Mostrar senha
          </label>
          <Button variant="outline" onClick={changePassword} disabled={savingPassword || !!viewAs}>
            Alterar senha
          </Button>
        </CardContent>
      </Card>
      {isAdmin && <CompanySettingsCard />}
    </div>
  );
}
