import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoginNoticesCard } from "@/components/auth/LoginNoticesCard";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Vendas Estaduais" },
      { name: "description", content: "Acesse o portal de Vendas Estaduais do Sistema Integral." },
      { property: "og:title", content: "Entrar — Vendas Estaduais" },
      { property: "og:description", content: "Acesse o portal de Vendas Estaduais do Sistema Integral." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [mode, setMode] = useState("entrar");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    let recovery = window.location.hash.includes("type=recovery") || new URLSearchParams(window.location.search).has("recuperar");
    if (recovery) setMode("recuperar");
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        recovery = true;
        setMode("recuperar");
      }
    });
    supabase.auth.getUser().then(({ data }) => {
      if (data.user && !recovery) navigate({ to: "/painel" });
    });
    return () => listener.subscription.unsubscribe();
  }, [navigate]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const normalizedEmail = email.trim().toLocaleLowerCase();
    const { error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });
    setLoading(false);
    if (error) {
      toast.error(
        error.message.includes("Invalid")
          ? "E-mail ou senha inválidos."
          : "Não foi possível entrar: " + error.message,
      );
      return;
    }
    await supabase
      .from("profiles")
      .update({ last_access: new Date().toISOString() })
      .eq("email", normalizedEmail);
    navigate({ to: "/painel" });
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("A senha precisa ter ao menos 6 caracteres.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName },
      },
    });
    setLoading(false);
    if (error) {
      toast.error(
        error.message.includes("already")
          ? "Este e-mail já está cadastrado."
          : "Não foi possível criar a conta: " + error.message,
      );
      return;
    }
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session) {
      toast.success("Conta criada. Bem-vindo!");
      navigate({ to: "/painel" });
    } else {
      toast.success("Conta criada. Confirme o link enviado ao seu e-mail para entrar.");
      setMode("entrar");
    }
  }

  async function signInWithGoogle() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/painel` },
    });
    if (error) {
      setLoading(false);
      toast.error("Não foi possível entrar com o Google.");
    }
  }

  async function resetPassword() {
    const normalizedEmail = email.trim().toLocaleLowerCase();
    if (!normalizedEmail) {
      toast.error("Informe seu e-mail para receber o link de recuperação.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: window.location.origin + "/auth?recuperar=1",
    });
    if (error) toast.error("Não foi possível enviar o e-mail de recuperação.");
    else toast.success("Enviamos um link de recuperação para o seu e-mail.");
  }

  async function saveRecoveredPassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) return void toast.error("Use ao menos 8 caracteres.");
    if (newPassword !== confirmPassword) return void toast.error("As senhas não conferem.");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);
    if (error) return void toast.error("Não foi possível atualizar a senha: " + error.message);
    setNewPassword("");
    setConfirmPassword("");
    toast.success("Senha atualizada. Você já pode entrar.");
    navigate({ to: "/painel" });
  }

  return (
    <main className="integral-auth flex min-h-screen">
      <section className="integral-auth-brand hidden flex-1 flex-col justify-between bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-3">
          <div>
            <p className="integral-brand-word">sistemaintegral</p>
            <span className="integral-brand-rule" />
            <p className="integral-brand-subtitle">Vendas Estaduais</p>
          </div>
        </div>
        <div className="max-w-md space-y-4">
          <h1 className="font-display text-4xl leading-tight font-semibold">
            Sua operação comercial estadual, integrada.
          </h1>
          <p className="opacity-80">
            Gerencie vendedores, clientes, CRM, catálogo, pedidos, entregas, metas e resultados dentro dos territórios autorizados.
          </p>
        </div>
        <p className="text-xs opacity-60">
          Os dados e permissões são sincronizados com o Sistema Integral.
        </p>
      </section>

      <section className="integral-auth-form relative flex flex-1 items-center justify-center px-5 py-12">
        <div className="absolute right-4 top-4">
          <LanguageSwitcher />
        </div>
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <p className="integral-brand-word">sistemaintegral</p>
            <span className="integral-brand-rule" />
            <p className="integral-brand-subtitle">Vendas Estaduais</p>
          </div>

          {mode === "recuperar" ? (
            <form onSubmit={saveRecoveredPassword} className="space-y-4 rounded-lg border bg-card p-6">
              <h2 className="text-xl font-semibold">Definir nova senha</h2>
              <p className="text-sm text-muted-foreground">Escolha uma nova senha para sua conta.</p>
              <div className="space-y-2">
                <Label htmlFor="nova-senha">Nova senha</Label>
                <Input id="nova-senha" type="password" autoComplete="new-password" minLength={8} required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmar-senha">Confirmar nova senha</Label>
                <Input id="confirmar-senha" type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>Salvar nova senha</Button>
            </form>
          ) : (
          <Tabs value={mode} onValueChange={setMode}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="entrar">Entrar</TabsTrigger>
              <TabsTrigger value="criar">Criar conta</TabsTrigger>
            </TabsList>

            <TabsContent value="entrar">
              <form onSubmit={signIn} className="space-y-4 pt-6">
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@empresa.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="senha">Senha</Label>
                  <Input
                    id="senha"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Entrar
                </Button>
                <div className="relative py-1">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <span className="relative mx-auto block w-fit bg-background px-3 text-xs text-muted-foreground">
                    ou
                  </span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={loading}
                  onClick={signInWithGoogle}
                >
                  Entrar com o Google
                </Button>
                <button
                  type="button"
                  onClick={resetPassword}
                  className="w-full text-sm text-muted-foreground underline-offset-4 hover:underline"
                >
                  Esqueci minha senha
                </button>
              </form>
            </TabsContent>

            <TabsContent value="criar">
              <form onSubmit={signUp} className="space-y-4 pt-6">
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome completo</Label>
                  <Input
                    id="nome"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email2">E-mail</Label>
                  <Input
                    id="email2"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="senha2">Senha</Label>
                  <Input
                    id="senha2"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Criar conta
                </Button>
                <p className="text-xs text-muted-foreground">
                  A primeira conta criada recebe o perfil de Superadministrador. As demais entram
                  como Vendedor até que um administrador altere o perfil.
                </p>
              </form>
            </TabsContent>
          </Tabs>
          )}
          <LoginNoticesCard />
        </div>
      </section>
    </main>
  );
}
