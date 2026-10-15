import { createFileRoute } from "@tanstack/react-router";
import { RouteGuard } from "@/components/common/RouteGuard";
import { PageHeader } from "@/components/common/PageHeader";
import { MembersList } from "@/components/team/MembersList";

export const Route = createFileRoute("/_authenticated/equipe/")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab:
      search["tab"] === "equipes" ||
      search["tab"] === "cargos" ||
      search["tab"] === "pessoas"
        ? search["tab"]
        : "pessoas",
  }),
  head: () => ({
    meta: [
      { title: "Membros — OS" },
      {
        name: "description",
        content:
          "Perfis de acesso, equipes e vínculo de vendedores a produtos.",
      },
      { property: "og:title", content: "Membros — OS" },
      {
        property: "og:description",
        content: "Perfis de acesso, equipes e produtos por vendedor.",
      },
    ],
  }),
  component: GuardedEquipe,
});

function GuardedEquipe() {
  return (
    <RouteGuard capability="manage_team">
      <PageHeader
        title="Membros"
        description="Consulte membros, cargos, níveis, categorias e situação. Cadastro e permissões ficam na Visão Interna."
      />
      <MembersList />
    </RouteGuard>
  );
}
