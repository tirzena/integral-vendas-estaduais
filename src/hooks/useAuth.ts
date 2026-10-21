import { observeAuthSession } from "@/lib/auth-session-observer";
import { isIntegralSessionActive, watchSessionRevocation } from "@/lib/password-session";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { setViewAs, useViewAs } from "@/hooks/useImpersonation";

export type AppRole =
  | "superadmin"
  | "admin"
  | "gestor"
  | "vendedor"
  | "financeiro"
  | "estoque"
  | "fornecedor"
  | "entregador";

export const ROLE_LABELS: Record<AppRole, string> = {
  superadmin: "Superadministrador",
  admin: "Administrador",
  gestor: "Gestor",
  vendedor: "Vendedor",
  financeiro: "Financeiro",
  estoque: "Estoque",
  fornecedor: "Fornecedor",
  entregador: "Entregador",
};

const SessionContext = createContext<{
  session: Session | null;
  user: Session["user"] | null;
  loading: boolean;
} | null>(null);

/** Uma assinatura de autenticação para toda a aplicação. */
export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    // Mantém a página de instalação acessível quando a conexão ainda não foi configurada.
    let auth;
    try {
      auth = supabase.auth;
    } catch {
      setLoading(false);
      return;
    }
    let hadSession = false;
    return observeAuthSession(auth, {
      onSession: (next) => {
        setSession(next);
        setLoading(false);
        if (hadSession && !next) window.location.replace("/auth");
        hadSession = !!next;
      },
      onIdentityChange: () => { queryClient.clear(); setViewAs(null); },
      onUserUpdated: (userId) => { void queryClient.invalidateQueries({ queryKey: ["me", userId] }); },
      onInitialError: () => setLoading(false),
    });
  }, [queryClient]);

  useEffect(() => {
    if (!session?.access_token) return;
    const watcher = watchSessionRevocation({
      check: () => isIntegralSessionActive(supabase),
      isVisible: () => document.visibilityState !== "hidden",
      onRevoked: () => {
        queryClient.clear();
        setViewAs(null);
        setSession(null);
        void supabase.auth.signOut({ scope: "local" }).finally(() => {
          window.location.replace("/auth");
        });
      },
    });
    const onFocus = () => { void watcher.check(); };
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      watcher.stop();
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [session?.access_token, queryClient]);

  return createElement(SessionContext.Provider, {
    value: { session, user: session?.user ?? null, loading },
  }, children);
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession precisa estar dentro de AuthSessionProvider");
  return context;
}

export function useCurrentUser() {
  const { session, loading } = useSession();
  const viewAs = useViewAs();
  // Modo espelho: o administrador vê o sistema como o membro escolhido.
  const userId = viewAs ? viewAs.userId : session?.user.id;

  const profile = useQuery({
    queryKey: ["me", userId],
    enabled: !!userId,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      const [{ data: prof, error: profileError }, { data: roles, error: rolesError }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId!).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId!),
      ]);
      if (profileError) throw profileError;
      if (rolesError) throw rolesError;
      return {
        profile: prof,
        roles: (roles ?? []).map((r) => r.role as AppRole),
      };
    },
  });

  const roles = viewAs ? viewAs.roles : (profile.data?.roles ?? []);
  return {
    loading: loading || profile.isLoading,
    userId,
    email: viewAs ? undefined : session?.user.email,
    viewAs,
    profile: profile.data?.profile ?? null,
    roles,
    isAdmin: roles.includes("superadmin") || roles.includes("admin"),
    isManager: roles.includes("gestor"),
    primaryRole: (roles[0] ?? "vendedor") as AppRole,
  };
}
