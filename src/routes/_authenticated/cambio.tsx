import { createFileRoute } from "@tanstack/react-router";
import { StocksBoard } from "@/components/common/StocksBoard";
import { BaseCurrencyCard } from "@/components/common/BaseCurrencyCard";



export const Route = createFileRoute("/_authenticated/cambio")({
  head: () => ({
    meta: [
      { title: "Cotações e câmbio — OS" },
      {
        name: "description",
        content: "Cotações de dólar, real e guarani atualizadas pelo Yahoo Finanças.",
      },
      { property: "og:title", content: "Cotações e câmbio — OS" },
      { property: "og:description", content: "Cotações ao vivo entre real, dólar e guarani." },
    ],
  }),
  component: Cambio,
});

function Cambio() {
  return (
    <div className="space-y-8">
      <BaseCurrencyCard />
      <StocksBoard />
    </div>

  );
}
