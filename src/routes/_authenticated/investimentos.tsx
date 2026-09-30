import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/investimentos")({
  beforeLoad: () => {
    throw redirect({ to: "/financeiro" });
  },
  component: () => null,
});
