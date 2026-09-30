import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ResourcePage } from "@/components/common/ResourcePage";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes — OS" },
      {
        name: "description",
        content: "Cadastro único de clientes com histórico compartilhado entre produtos.",
      },
      { property: "og:title", content: "Clientes — OS" },
      { property: "og:description", content: "Cadastro único de clientes sem duplicidade." },
    ],
  }),
  component: Clientes,
});

const NONE = "00000000-0000-0000-0000-000000000000";

function Clientes() {
  const navigate = useNavigate();
  const [teamId, setTeamId] = useState("todos");
  const [sellerId, setSellerId] = useState("todos");

  const { data, isLoading } = useQuery({
    queryKey: ["clientes-compradores"],
    queryFn: async () => {
      const [orders, people, teams, members] = await Promise.all([
        (supabase as any).rpc("sales_visible_customer_ownership"),
        supabase.from("profiles").select("id,full_name").order("full_name"),
        supabase.from("teams").select("id,name,sellers_can_view_team_clients").order("name"),
        supabase.from("team_members").select("team_id,user_id"),
      ]);
      if (orders.error) throw orders.error;
      return {
        orders: orders.data ?? [],
        people: people.data ?? [],
        teams: teams.data ?? [],
        members: members.data ?? [],
      };
    },
  });

  const teamSellerIds = useMemo(
    () =>
      new Set(
        (data?.members ?? [])
          .filter((member) => teamId === "todos" || member.team_id === teamId)
          .map((member) => member.user_id),
      ),
    [data?.members, teamId],
  );
  const visiblePeople = (data?.people ?? []).filter(
    (person) => teamId === "todos" || teamSellerIds.has(person.id),
  );
  const filteredOrders = (data?.orders ?? []).filter(
    (order) =>
      (teamId === "todos" || (!!order.seller_id && teamSellerIds.has(order.seller_id))) &&
      (sellerId === "todos" || order.seller_id === sellerId),
  );
  const buyerIds = Array.from(
    new Set(filteredOrders.map((order) => order.customer_id).filter(Boolean) as string[]),
  );
  const customerCountByTeam = (selectedTeamId: string) => {
    const sellers = new Set(
      (data?.members ?? [])
        .filter((member) => member.team_id === selectedTeamId)
        .map((member) => member.user_id),
    );
    return new Set(
      (data?.orders ?? [])
        .filter((order) => !!order.seller_id && sellers.has(order.seller_id))
        .map((order) => order.customer_id)
        .filter(Boolean),
    ).size;
  };

  return (
    <ResourcePage
      title="Clientes"
      description="Aqui ficam apenas os contatos que já fizeram a primeira compra. Novos contatos são cadastrados no CRM como oportunidade."
      table="customers"
      canCreate={false}
      enabled={!isLoading}
      inFilter={{ column: "id", values: buyerIds.length ? buyerIds : [NONE] }}
      extraFilters={
        <>
          <div className="min-w-44">
            <Label>Equipe</Label>
            <Select
              value={teamId}
              onValueChange={(value) => {
                setTeamId(value);
                setSellerId("todos");
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as equipes</SelectItem>
                {(data?.teams ?? []).map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name} ({customerCountByTeam(team.id)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-44">
            <Label>Vendedor</Label>
            <Select value={sellerId} onValueChange={setSellerId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os vendedores</SelectItem>
                {visiblePeople.map((person) => (
                  <SelectItem key={person.id} value={person.id}>{person.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      }
      searchKeys={["name", "document", "phone", "email", "city"]}
      emptyTitle="Nenhum cliente ainda"
      emptyDescription="Assim que um contato do CRM fizer a primeira compra, ele aparece aqui automaticamente."
      columns={[
        { key: "name", label: "Nome" },
        { key: "document", label: "Documento" },
        { key: "phone", label: "Telefone" },
        { key: "city", label: "Cidade" },
        {
          key: "status",
          label: "Situação",
          render: (r) => <Badge variant="secondary">{r.status ?? "ativo"}</Badge>,
        },
      ]}
      rowActions={(row) => (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Abrir ficha"
          onClick={() => navigate({ to: "/clientes/$id", params: { id: row.id } })}
        >
          <ExternalLink className="size-4" />
        </Button>
      )}
      fields={[
        { name: "name", label: "Nome / Razão social", required: true },
        { name: "trade_name", label: "Nome fantasia" },
        {
          name: "person_type",
          label: "Tipo",
          type: "select",
          defaultValue: "fisica",
          options: [
            { value: "fisica", label: "Pessoa física" },
            { value: "juridica", label: "Pessoa jurídica" },
          ],
        },
        { name: "document", label: "CPF / CNPJ / RUC" },
        { name: "foreign_document", label: "Documento estrangeiro" },
        { name: "phone", label: "Telefone", type: "tel" },
        { name: "whatsapp", label: "WhatsApp", type: "tel" },
        { name: "email", label: "E-mail", type: "email" },
        { name: "country", label: "País", defaultValue: "Brasil" },
        { name: "state", label: "Estado" },
        { name: "city", label: "Cidade" },
        { name: "address", label: "Endereço", full: true },
        {
          name: "language",
          label: "Idioma",
          type: "select",
          defaultValue: "pt",
          options: [
            { value: "pt", label: "Português" },
            { value: "es", label: "Espanhol" },
            { value: "en", label: "Inglês" },
          ],
        },
        { name: "birth_date", label: "Data de nascimento", type: "date" },
        { name: "origin", label: "Origem do contato" },
        {
          name: "status",
          label: "Situação",
          type: "select",
          defaultValue: "ativo",
          options: [
            { value: "ativo", label: "Ativo" },
            { value: "inativo", label: "Inativo" },
            { value: "bloqueado", label: "Bloqueado" },
          ],
        },
        { name: "notes", label: "Observações", type: "textarea" },
      ]}
    />
  );
}
