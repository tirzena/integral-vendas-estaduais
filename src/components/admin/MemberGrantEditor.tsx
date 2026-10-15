/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useRows } from "@/lib/db";
export function MemberGrantEditor({ userId }: { userId: string }) {
  const client = useQueryClient(),
    [form, setForm] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [expanded, setExpanded] = useState(false);
  const categories = useRows<any>("products", {
      enabled: expanded,
      filter: { is_active: true },
    }),
    sub = useRows<any>("product_categories", {
      enabled: expanded,
      limit: 10000,
    }),
    items = useRows<any>("inventory_items", {
      enabled: expanded,
      filter: { is_active: true },
      limit: 10000,
    }),
    stocks = useRows<any>("warehouses", {
      enabled: expanded,
      filter: { is_active: true },
    }),
    catalog = useRows<any>("permission_catalog", {
      enabled: expanded,
      orderBy: { column: "sort_order", ascending: true },
    });
  const query = useQuery({
    queryKey: ["admin-member-grants", userId],
    enabled: expanded,
    queryFn: async () => {
      const db = supabase as any;
      const [rules, products, warehouses, categoryGrants, itemGrants, categoryRows, itemRows] =
        await Promise.all([
          db.from("integral_member_rules").select("*").eq("user_id", userId).maybeSingle(),
          db.from("product_users").select("product_id").eq("user_id", userId),
          db.from("warehouse_user_assignments").select("warehouse_id").eq("user_id", userId),
          db.from("product_category_users").select("category_id").eq("user_id", userId),
          db.from("inventory_item_users").select("item_id").eq("user_id", userId),
          db.from("product_categories").select("id,product_id"),
          db.from("inventory_items").select("id,product_id").eq("is_active", true),
        ]);
      for (const r of [
        rules,
        products,
        warehouses,
        categoryGrants,
        itemGrants,
        categoryRows,
        itemRows,
      ])
        if (r.error) throw r.error;
      const next = {
        excluded_category_ids: (categoryRows.data ?? [])
          .filter(
            (c: any) =>
              products.data.some((p: any) => p.product_id === c.product_id) &&
              !categoryGrants.data.some((g: any) => g.category_id === c.id),
          )
          .map((c: any) => c.id),
        excluded_item_ids: (itemRows.data ?? [])
          .filter(
            (i: any) =>
              products.data.some((p: any) => p.product_id === i.product_id) &&
              !itemGrants.data.some((g: any) => g.item_id === i.id),
          )
          .map((i: any) => i.id),
        permission_overrides: {},
        inherit_new_products: true,
        ...rules.data,
        product_ids: products.data.map((p: any) => p.product_id),
        warehouse_ids: [
          ...new Set(warehouses.data.map((w: any) => w.warehouse_id).filter(Boolean)),
        ],
      };
      setForm(next);
      return next;
    },
  });
  const toggle = (key: string, id: string, on: boolean) =>
    setForm({
      ...form,
      [key]: on
        ? [...new Set([...form[key], id])]
        : form[key].filter((value: string) => value !== id),
    });
  async function save() {
    setBusy(true);
    try {
      const r = await (supabase as any).rpc("integral_update_member_grants", {
        p_user: userId,
        p_payload: form,
      });
      if (r.error) throw r.error;
      toast.success("Concessões atualizadas manualmente e auditadas.");
      await client.invalidateQueries();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      className="my-4 rounded-lg border p-4"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary className="cursor-pointer font-semibold">
        Categorias, produtos, estoques e operações do membro
      </summary>
      {query.isLoading ? (
        <p>Carregando…</p>
      ) : query.error ? (
        <p role="alert">{(query.error as Error).message}</p>
      ) : (
        form && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Nenhuma concessão será alterada até salvar. Exclusões manuais permanecem válidas para
              novos produtos.
            </p>
            {(categories.data ?? []).map((p) => (
              <div className="rounded border p-3" key={p.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={form.product_ids.includes(p.id)}
                    onChange={(e) => toggle("product_ids", p.id, e.target.checked)}
                  />{" "}
                  {p.name}
                </label>
                {form.product_ids.includes(p.id) && (
                  <div className="ml-4">
                    {(sub.data ?? [])
                      .filter((c) => c.product_id === p.id)
                      .map((c) => (
                        <label className="block" key={c.id}>
                          <input
                            type="checkbox"
                            checked={!form.excluded_category_ids.includes(c.id)}
                            onChange={(e) =>
                              toggle("excluded_category_ids", c.id, !e.target.checked)
                            }
                          />{" "}
                          {c.name}
                        </label>
                      ))}
                    {(items.data ?? [])
                      .filter((i) => i.product_id === p.id)
                      .map((i) => (
                        <label className="block text-sm" key={i.id}>
                          <input
                            type="checkbox"
                            disabled={form.excluded_category_ids.includes(i.category_id)}
                            checked={
                              !form.excluded_item_ids.includes(i.id) &&
                              !form.excluded_category_ids.includes(i.category_id)
                            }
                            onChange={(e) => toggle("excluded_item_ids", i.id, !e.target.checked)}
                          />{" "}
                          {i.name}
                        </label>
                      ))}
                  </div>
                )}
              </div>
            ))}
            <label className="block">
              <input
                type="checkbox"
                checked={form.inherit_new_products}
                onChange={(e) => setForm({ ...form, inherit_new_products: e.target.checked })}
              />{" "}
              Herdar novos produtos, respeitando exclusões
            </label>
            <label className="block rounded border p-3">
              <input
                type="checkbox"
                checked={form.general_access !== false}
                onChange={(e) => setForm({ ...form, general_access: e.target.checked })}
              />{" "}
              Acessar Direção Geral
            </label>
            <p className="font-medium">Estoques autorizados</p>
            {(stocks.data ?? []).map((w) => (
              <label className="block" key={w.id}>
                <input
                  type="checkbox"
                  checked={form.warehouse_ids.includes(w.id)}
                  onChange={(e) => toggle("warehouse_ids", w.id, e.target.checked)}
                />{" "}
                {w.name}
              </label>
            ))}
            <p className="font-medium">Operações específicas</p>
            {(catalog.data ?? [])
              .filter((p) => p.key.includes("."))
              .map((p) => (
                <label className="flex items-center justify-between gap-2 text-sm" key={p.key}>
                  {p.label}
                  <select
                    className="rounded border bg-background p-2"
                    value={
                      p.key in form.permission_overrides
                        ? String(form.permission_overrides[p.key])
                        : "inherit"
                    }
                    onChange={(e) => {
                      const overrides = { ...form.permission_overrides };
                      if (e.target.value === "inherit") delete overrides[p.key];
                      else overrides[p.key] = e.target.value === "true";
                      setForm({ ...form, permission_overrides: overrides });
                    }}
                  >
                    <option value="inherit">Herdar cargos</option>
                    <option value="true">Permitir</option>
                    <option value="false">Bloquear</option>
                  </select>
                </label>
              ))}
            <Button disabled={busy} onClick={save}>
              {busy ? "Salvando…" : "Salvar concessões manualmente"}
            </Button>
          </div>
        )
      )}
    </details>
  );
}
