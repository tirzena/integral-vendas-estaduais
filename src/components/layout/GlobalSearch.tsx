import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

type Result = { id: string; label: string; group: string; to: string };

export function GlobalSearch({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [term, setTerm] = useState("");
  const navigate = useNavigate();

  const { data, isFetching } = useQuery({
    queryKey: ["global-search", term],
    enabled: open && term.trim().length >= 2,
    queryFn: async (): Promise<Result[]> => {
      const like = `%${term.trim()}%`;
      const [customers, products, suppliers, orders, quotes, conversations, catalogs] =
        await Promise.all([
          supabase.from("customers").select("id,name").ilike("name", like).limit(5),
          supabase.from("products").select("id,name").ilike("name", like).limit(5),
          supabase.from("suppliers").select("id,name").ilike("name", like).limit(5),
          supabase.from("orders").select("id,number,status").limit(5),
          supabase.from("quotes").select("id,number,status").limit(5),
          supabase
            .from("whatsapp_conversations")
            .select("id,contact_name,contact_phone")
            .ilike("contact_name", like)
            .limit(5),
          supabase.from("catalogs").select("id,title").ilike("title", like).limit(5),
        ]);

      const out: Result[] = [];
      (customers.data ?? []).forEach((c) =>
        out.push({ id: c.id, label: c.name, group: "Clientes", to: `/clientes/${c.id}` }),
      );
      (products.data ?? []).forEach((p) =>
        out.push({ id: p.id, label: p.name, group: "Produtos", to: "/produtos" }),
      );
      (suppliers.data ?? []).forEach((s) =>
        out.push({ id: s.id, label: s.name, group: "Fornecedores", to: "/fornecedores" }),
      );
      (orders.data ?? []).forEach((o) =>
        out.push({ id: o.id, label: `Pedido #${o.number}`, group: "Pedidos", to: "/pedidos" }),
      );
      (quotes.data ?? []).forEach((q) =>
        out.push({ id: q.id, label: `Orçamento #${q.number}`, group: "Orçamentos", to: "/pedidos" }),
      );
      (conversations.data ?? []).forEach((c) =>
        out.push({
          id: c.id,
          label: c.contact_name || c.contact_phone,
          group: "Conversas",
          to: "/atendimentos",
        }),
      );
      (catalogs.data ?? []).forEach((c) =>
        out.push({ id: c.id, label: c.title, group: "Documentos", to: "/biblioteca" }),
      );
      return out;
    },
  });

  const results = data ?? [];
  const groups = Array.from(new Set(results.map((r) => r.group)));

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Buscar clientes, produtos, pedidos, conversas…"
        value={term}
        onValueChange={setTerm}
      />
      <CommandList>
        {term.trim().length < 2 && (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            Digite ao menos 2 caracteres para buscar.
          </div>
        )}
        {term.trim().length >= 2 && !isFetching && results.length === 0 && (
          <CommandEmpty>Nada encontrado para “{term}”.</CommandEmpty>
        )}
        {groups.map((group) => (
          <CommandGroup key={group} heading={group}>
            {results
              .filter((r) => r.group === group)
              .map((r) => (
                <CommandItem
                  key={group + r.id}
                  value={group + r.label + r.id}
                  onSelect={() => {
                    onOpenChange(false);
                    setTerm("");
                    navigate({ to: r.to });
                  }}
                >
                  {r.label}
                </CommandItem>
              ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
