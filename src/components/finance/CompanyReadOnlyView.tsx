/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { formatMoney, type Currency } from "@/lib/format";
import { LogisticsConsole } from "@/components/orders/LogisticsConsole";

const sections = {
  dashboard: "Visão geral",
  orders: "Pedidos",
  receivable: "A receber",
  payable: "A pagar",
  payroll: "Folha",
  stock: "Estoque",
  purchases: "Compras",
  members: "Membros",
  customers: "Clientes",
  policies: "Políticas",
  logistics: "Logística",
};
const labels: Record<string, string> = {
  pending: "Aguardando aprovação",
  approved: "Aprovado",
  rejected: "Devolvido",
  legacy: "Sem revisão pendente",
  faturado: "Faturado",
  entregue: "Entregue",
  cancelado: "Cancelado",
  pre_pedido: "Pré-pedido",
  pago: "Pago",
  aberto: "Em aberto",
  pendente: "Pendente",
  commission: "Comissão",
  fixed: "Fixo",
  bonus: "Bonificação",
  prolabore: "Pró-labore",
};
export function CompanyReadOnlyView({
  initialSection = "dashboard",
}: {
  initialSection?: keyof typeof sections;
}) {
  const { userId } = useCurrentUser();
  const [section, setSection] = useState<keyof typeof sections>(initialSection);
  const [page, setPage] = useState(0);
  const query = useQuery({
    queryKey: ["company-readonly-view", userId, section, page],
    enabled: section !== "logistics",
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("integral_company_read", {
        p_section: section,
        p_offset: page * 50,
        p_limit: 50,
      });
      if (error) throw error;
      return data as { rows: Record<string, any>[]; has_more: boolean };
    },
  });
  const columns = Object.keys(query.data?.rows[0] ?? {});
  function value(row: Record<string, any>, key: string) {
    const raw = row[key];
    if (raw === null || raw === undefined) return "—";
    if (["Valor", "Total", "Pago", "A receber", "Custo", "Preço"].includes(key) && row["Moeda"])
      return formatMoney(Number(raw), row["Moeda"] as Currency);
    if (
      ["Data", "Início", "Fim", "Pagamento", "Vencimento"].includes(key) &&
      typeof raw === "string"
    )
      return new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        dateStyle: "short",
      }).format(new Date(raw.length === 10 ? raw + "T12:00:00Z" : raw));
    return typeof raw === "number"
      ? raw.toLocaleString("pt-BR")
      : (labels[String(raw)] ?? String(raw));
  }
  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Visão da empresa</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Consulta da operação, sem permissão de alteração financeira ou administrativa. As
          operações de transporte ficam na aba Logística.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {Object.entries(sections).map(([key, label]) => (
          <Button
            key={key}
            size="sm"
            variant={section === key ? "default" : "outline"}
            onClick={() => {
              setSection(key as keyof typeof sections);
              setPage(0);
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      {section === "logistics" ? (
        <LogisticsConsole />
      ) : query.isLoading ? (
        <p>Carregando {sections[section].toLowerCase()}…</p>
      ) : query.error ? (
        <p role="alert" className="text-destructive">
          Não foi possível carregar esta consulta: {(query.error as Error).message}
        </p>
      ) : (
        <>
          <div className="surface-card overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  {columns.map((key) => (
                    <th key={key} className="whitespace-nowrap px-4 py-3 font-semibold">
                      {key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {query.data?.rows.map((row, i) => (
                  <tr key={i} className="border-b last:border-0">
                    {columns.map((key) => (
                      <td key={key} className="px-4 py-3">
                        {value(row, key)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {!query.data?.rows.length && (
              <p className="p-6 text-muted-foreground">Nenhum registro nesta consulta.</p>
            )}
          </div>
          <div className="flex items-center justify-between">
            <Button variant="outline" disabled={!page} onClick={() => setPage(page - 1)}>
              Anterior
            </Button>
            <span className="text-sm text-muted-foreground">Página {page + 1}</span>
            <Button
              variant="outline"
              disabled={!query.data?.has_more}
              onClick={() => setPage(page + 1)}
            >
              Próxima
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
