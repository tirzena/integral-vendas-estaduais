import { createFileRoute } from "@tanstack/react-router";
import { Catalogo } from "./produtos";

export const Route = createFileRoute("/_authenticated/categorias")({
  component: () => <Catalogo section="categorias" />,
});
