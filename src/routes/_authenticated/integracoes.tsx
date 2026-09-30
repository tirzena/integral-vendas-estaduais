import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Página antiga de Integrações: agora tudo acontece em Tráfego pago.
 * Mantém os parâmetros de retorno do OAuth para as mensagens continuarem funcionando.
 */
export const Route = createFileRoute("/_authenticated/integracoes")({
  beforeLoad: ({ location }) => {
    throw redirect({ href: `/trafego-pago${location.searchStr ?? ""}` });
  },
  component: () => null,
});
