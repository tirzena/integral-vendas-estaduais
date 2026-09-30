import { createFileRoute } from "@tanstack/react-router";
import { Dispatcher } from "@/components/campaigns/Dispatcher";

export const Route = createFileRoute("/_authenticated/disparador")({
  head: () => ({
    meta: [
      { title: "Disparador de mensagens — OS" },
      {
        name: "description",
        content:
          "Campanhas de vendas por WhatsApp, e-mail e SMS com segmentação de clientes, consentimento e relatórios.",
      },
      { property: "og:title", content: "Disparador de mensagens — OS" },
      {
        property: "og:description",
        content: "Campanhas segmentadas com consentimento por canal e relatórios de entrega.",
      },
    ],
  }),
  component: () => <Dispatcher />,
});
