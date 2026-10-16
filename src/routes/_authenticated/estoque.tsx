import { createFileRoute } from "@tanstack/react-router";
import { RouteGuard } from "@/components/common/RouteGuard";
import { Catalogo } from "./produtos";

export const Route = createFileRoute("/_authenticated/estoque")({
  component: () => (
    <RouteGuard capability="inventory_view">
      <Catalogo section="estoque" />
    </RouteGuard>
  ),
});
