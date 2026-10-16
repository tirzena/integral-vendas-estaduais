import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/guia-de-estudo")({
  beforeLoad: () => {
    throw redirect({ to: "/produtos", hash: "guia-de-estudo", replace: true });
  },
  component: () => null,
});
