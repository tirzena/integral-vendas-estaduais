import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { PublicEntry } from "@/components/public/PublicEntry";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/painel" });
  },
  component: IntegralHome,
});

function IntegralHome() {
  const navigate = useNavigate();
  return <PublicEntry onLogin={() => navigate({ to: "/auth" })} />;
}
