/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PeriodFilter } from "./PeriodFilter";
import { defaultOperationalFilter, type OperationalFilter } from "@/lib/operational-filters";
export function useOperationalFilters() {
  const [filters, setFilters] = useState(defaultOperationalFilter);
  useEffect(() => {
    try {
      const stored = new URLSearchParams(window.location.search).get("filtros");
      if (!stored) return;
      const parsed = JSON.parse(stored);
      const next = { ...defaultOperationalFilter };
      for (const key of Object.keys(next) as (keyof OperationalFilter)[])
        if (typeof parsed[key] === "string") (next as any)[key] = parsed[key];
      if (!["tudo", "hoje", "7d", "mes", "ano"].includes(next.period)) next.period = "tudo";
      if (!["numero_asc", "numero_desc", "antigos", "recentes"].includes(next.sort))
        next.sort = "numero_asc";
      setFilters(next);
    } catch {
      toast.error("Não foi possível carregar os filtros do link.");
    }
  }, []);
  return [filters, setFilters] as const;
}
export function OperationalFilters({
  rows,
  value,
  onChange,
  statuses,
  actions,
  phase,
}: {
  rows: any[];
  value: OperationalFilter;
  onChange: (v: OperationalFilter) => void;
  statuses: Record<string, string>;
  actions?: React.ReactNode;
  phase?: string;
}) {
  const itemOptions = useQuery({
    queryKey: ["operational-selectable-inventory-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_items")
        .select("id,name")
        .eq("is_active", true);
      if (error) throw error;
      return data ?? [];
    },
  });
  const set = (key: keyof OperationalFilter, v: string) => onChange({ ...value, [key]: v });
  const fields = [
    { key: "seller", label: "Vendedor", source: "filterSeller" },
    { key: "team", label: "Equipe", source: "filterTeams" },
    { key: "item", label: "Produto", source: "filterItems" },
    { key: "supplier", label: "Fornecedor", source: "filterSuppliers" },
  ];
  const dropdown = (
    key: keyof OperationalFilter,
    label: string,
    choices: { id: string; name: string }[],
  ) => (
    <div key={key}>
      <Label>{label}</Label>
      <Select value={value[key]} onValueChange={(v) => set(key, v)}>
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {key !== "sort" && <SelectItem value="todos">Todos</SelectItem>}
          {choices.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
  return (
    <div className="mb-5 space-y-3 rounded-xl border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <Label>Buscar</Label>
          <Input
            aria-label="Buscar registros"
            value={value.search}
            onChange={(e) => set("search", e.target.value)}
            placeholder="Número, destinatário, produto ou fornecedor"
          />
        </div>
        {dropdown(
          "status",
          "Situação",
          Object.entries(statuses).map(([id, name]) => ({ id, name })),
        )}
        {fields.map((f) => {
          const options = new Map<string, any>();
          if (f.key === "item")
            for (const item of itemOptions.data ?? []) options.set(item.id, item);
          for (const r of rows) {
            const entries = Array.isArray(r[f.source]) ? r[f.source] : [r[f.source]];
            for (const e of entries) if (e?.id) options.set(e.id, e);
          }
          return dropdown(
            f.key as keyof OperationalFilter,
            f.label,
            [...options.values()].sort((a, b) =>
              String(a.name ?? "").localeCompare(String(b.name ?? ""), "pt-BR"),
            ),
          );
        })}
        {dropdown(
          "origin",
          "Origem",
          [...new Set(rows.map((r) => r.filterOrigin))].filter(Boolean).map((id) => ({
            id,
            name:
              (
                {
                  pdv: "Caixa",
                  manual: "Compra manual",
                  catalogo: "Catálogo",
                  planilha_onedrive: "Planilha importada",
                } as any
              )[id] ?? id,
          })),
        )}
        {dropdown("sort", "Ordenar por", [
          { id: "numero_asc", name: "Número: 01 ao maior" },
          { id: "numero_desc", name: "Número: maior ao 01" },
          { id: "recentes", name: "Mais recentes" },
          { id: "antigos", name: "Mais antigos" },
        ])}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label>Período</Label>
          <PeriodFilter value={value.period} onChange={(v) => set("period", v)} />
        </div>
        <p className="text-sm text-muted-foreground">Formato de impressão: A4 / PDF</p>
        <Button variant="outline" onClick={() => onChange(defaultOperationalFilter)}>
          Limpar filtros
        </Button>
        <Button
          variant="outline"
          onClick={async () => {
            try {
              const url = new URL(window.location.href);
              url.searchParams.set("filtros", JSON.stringify(value));
              if (phase) url.searchParams.set("fase", phase);
              url.searchParams.delete("entrega");
              url.searchParams.delete("pedido");
              await navigator.clipboard.writeText(url.toString());
              toast.success("Link protegido com os filtros copiado.");
            } catch {
              toast.error("Não foi possível copiar o link.");
            }
          }}
        >
          Gerar link
        </Button>
        {actions}
      </div>
    </div>
  );
}
