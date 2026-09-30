/* eslint-disable @typescript-eslint/no-explicit-any */
import { RouteGuard } from "@/components/common/RouteGuard";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ResourcePage } from "@/components/common/ResourcePage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/fornecedores/")({
  head: () => ({
    meta: [
      { title: "Fornecedores — OS" },
      { name: "description", content: "Cadastro de fornecedores, prazos, moedas e condições." },
      { property: "og:title", content: "Fornecedores — OS" },
      { property: "og:description", content: "Fornecedores, prazos e condições comerciais." },
    ],
  }),
  component: GuardedFornecedores,
});

/** Converte "BRL, USD" em lista para a coluna de moedas (tipo array no banco). */
function toCurrencyArray(value: any): string[] {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return String(value)
    .split(/[,;]/)
    .map((v) => v.trim().toUpperCase())
    .filter((v) => ["BRL", "USD", "PYG"].includes(v));
}

function Fornecedores() {
  return (
    <ResourcePage
      title="Fornecedores"
      description="Registre parceiros, prazos de entrega, moedas aceitas e condições comerciais. Clique em abrir para ver a ficha completa."
      table="suppliers"
      searchKeys={["name", "contact_name", "country", "document"]}
      emptyTitle="Nenhum fornecedor cadastrado"
      beforeSave={(values) => ({
        ...values,
        currencies: toCurrencyArray(values["currencies"]),
      })}
      rowActions={(row: any) => (
        <Button variant="ghost" size="icon" aria-label="Abrir ficha" asChild>
          <Link to="/fornecedores/$id" params={{ id: row.id }}>
            <ExternalLink className="size-4" />
          </Link>
        </Button>
      )}
      columns={[
        {
          key: "name",
          label: "Fornecedor",
          render: (r) => (
            <Link className="font-medium hover:underline" to="/fornecedores/$id" params={{ id: r.id }}>
              {r.name}
            </Link>
          ),
        },
        { key: "contact_name", label: "Contato" },
        { key: "phone", label: "Telefone" },
        { key: "country", label: "País" },
        {
          key: "currencies",
          label: "Moedas",
          render: (r) => (Array.isArray(r.currencies) && r.currencies.length ? r.currencies.join(", ") : "—"),
        },
        {
          key: "lead_time_days",
          label: "Prazo",
          render: (r) => (r.lead_time_days ? `${r.lead_time_days} dias` : "—"),
        },
        {
          key: "status",
          label: "Situação",
          render: (r) => <Badge variant="secondary">{r.status ?? "ativo"}</Badge>,
        },
      ]}
      fields={[
        { name: "name", label: "Nome do fornecedor", required: true },
        { name: "document", label: "Documento" },
        { name: "contact_name", label: "Pessoa de contato" },
        { name: "phone", label: "Telefone", type: "tel" },
        { name: "email", label: "E-mail", type: "email" },
        { name: "country", label: "País", defaultValue: "Brasil" },
        { name: "address", label: "Endereço", full: true },
        {
          name: "currencies",
          label: "Moedas aceitas",
          placeholder: "BRL, USD, PYG",
          help: "Separe por vírgula. Aceita BRL, USD e PYG.",
        },
        { name: "lead_time_days", label: "Prazo de entrega (dias)", type: "number" },
        { name: "rating", label: "Avaliação (0 a 5)", type: "number" },
        {
          name: "status",
          label: "Situação",
          type: "select",
          defaultValue: "ativo",
          options: [
            { value: "ativo", label: "Ativo" },
            { value: "inativo", label: "Inativo" },
          ],
        },
        { name: "commercial_terms", label: "Condições comerciais", type: "textarea" },
        { name: "bank_details", label: "Dados bancários", type: "textarea" },
        { name: "notes", label: "Observações", type: "textarea" },
      ]}
    />
  );
}

function GuardedFornecedores() {
  return (
    <RouteGuard capability="manage_suppliers">
      <Fornecedores />
    </RouteGuard>
  );
}
