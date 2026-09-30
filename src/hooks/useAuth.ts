import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useViewAs } from "@/hooks/useImpersonation";

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

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [queryClient]);

  return { session, user: session?.user ?? null, loading };
}

export function useCurrentUser() {
  const { session, loading } = useSession();
  const viewAs = useViewAs();
  // Modo espelho: o administrador vê o sistema como o membro escolhido.
  const userId = viewAs ? viewAs.userId : session?.user.id;

  const profile = useQuery({
    queryKey: ["me", userId],
    enabled: !!userId,
    queryFn: async () => {
      const [{ data: prof }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId!).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId!),
      ]);
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
