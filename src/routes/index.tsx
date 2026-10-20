import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    // AuthPage restores existing sessions; this entry must never wait on auth network calls.
    throw redirect({ to: "/auth", replace: true });
  },
});
