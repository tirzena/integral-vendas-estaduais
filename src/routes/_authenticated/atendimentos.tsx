import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { PageHeader } from "@/components/common/PageHeader";
import { useCurrentUser } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/atendimentos")({
  head: () => ({
    meta: [
      { title: "Atendimentos — OS" },
      {
        name: "description",
        content:
          "Caixa de entrada de atendimento por produto e disparador de campanhas por WhatsApp, e-mail e SMS.",
      },
      { property: "og:title", content: "Atendimentos — OS" },
      {
        property: "og:description",
        content: "Conversas e campanhas de vendas em um só lugar.",
      },
    ],
  }),
  component: AtendimentosLayout,
});

const TABS = [
  { to: "/atendimentos", label: "Caixa de entrada", exact: true, manager: false },
  
  { to: "/atendimentos/contas", label: "Contas WhatsApp", exact: false, manager: true },
];

function AtendimentosLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isAdmin, roles } = useCurrentUser();
  const canManage = isAdmin || roles.includes("gestor");
  const tabs = TABS.filter((t) => !t.manager || canManage);


  return (
    <div>
      <PageHeader
        title="Atendimentos"
        description="Conversas de WhatsApp por produto e campanhas de vendas para a sua base de clientes."
      />
      <nav className="mb-4 flex flex-wrap gap-1 rounded-lg bg-muted p-1" aria-label="Seções de atendimento">
        {tabs.map((t) => {
          const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
          return (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                active ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      <Outlet />
    </div>
  );
}
