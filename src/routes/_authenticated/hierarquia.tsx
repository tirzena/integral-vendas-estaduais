import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/hierarquia")({
  beforeLoad: () => {
    throw redirect({ to: "/equipe/hierarquia" });
  },
});
