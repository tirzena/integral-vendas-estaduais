import { useMemo, useState } from "react";
import { toast } from "sonner";
import { formatMoney } from "@/lib/format";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  groupCatalogSelection,
  toggleCatalogSelection,
  catalogSelectionState,
  normalizeCatalogSearch,
  type CatalogCategory,
  type CatalogSubcategory,
  type CatalogSelectionItem,
} from "@/lib/catalog-selection";
export type MaterialSelectionItem = CatalogSelectionItem & {
  price: number;
  price_currency?: "BRL" | "USD" | "PYG";
  currency?: "BRL" | "USD" | "PYG";
  quantity: number;
};
export function CatalogProductPicker({
  items,
  categories,
  subcategories,
  selected,
  onChange,
  selectionLimit = 500,
}: {
  items: MaterialSelectionItem[];
  categories: CatalogCategory[];
  subcategories: CatalogSubcategory[];
  selected: string[];
  onChange: (ids: string[]) => void;
  selectionLimit?: number;
}) {
  const [search, setSearch] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
  const groups = useMemo(
    () => groupCatalogSelection(items, categories, subcategories),
    [items, categories, subcategories],
  );
  const term = normalizeCatalogSearch(search.trim());
  const activeGroups = groups.filter(
    (group) =>
      expandedCategories.includes(group.id) ||
      group.items.some((item) => selected.includes(item.id)),
  );
  const visibleItems = items.filter((item) =>
    term ? normalizeCatalogSearch(item.name).includes(term) : selected.includes(item.id),
  );
  function toggle(ids: string[]) {
    try {
      onChange(toggleCatalogSelection(selected, ids, selectionLimit));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  function selectAll() {
    if (items.length > selectionLimit) {
      toast.error(
        `O limite é de ${selectionLimit} produtos por material. Selecione categorias ou produtos até esse limite.`,
      );
      return;
    }
    onChange([...new Set(items.map((i) => i.id))]);
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium" role="status">
          Produtos ({selected.length} selecionados)
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={selectAll}>
            Selecionar todos
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange([]);
              setExpandedCategories([]);
            }}
          >
            Limpar
          </Button>
        </div>
      </div>
      <section className="space-y-3 rounded-xl border p-3">
        <h3 className="text-sm font-semibold">1. Categorias</h3>
        <p className="text-xs text-muted-foreground">
          Selecionar uma categoria inclui suas subcategorias e todos os produtos delas.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {groups.map((group) => (
            <label
              key={group.id}
              className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 hover:bg-muted"
            >
              <Checkbox
                aria-label={"Selecionar categoria inteira: " + group.name}
                checked={catalogSelectionState(
                  selected,
                  group.items.map((i) => i.id),
                )}
                onCheckedChange={() => {
                  setExpandedCategories((previous) => [...new Set([...previous, group.id])]);
                  toggle(group.items.map((i) => i.id));
                }}
              />
              <span className="min-w-0 flex-1 text-sm">{group.name}</span>
              <span className="text-xs text-muted-foreground">
                {group.items.filter((i) => selected.includes(i.id)).length}/{group.items.length}
              </span>
            </label>
          ))}
        </div>
      </section>
      <section className="space-y-3 rounded-xl border p-3">
        <h3 className="text-sm font-semibold">2. Subcategorias</h3>
        <p className="text-xs text-muted-foreground">
          Já vêm selecionadas com a categoria. Desmarque as que não deseja incluir.
        </p>
        {!activeGroups.length && (
          <p className="text-sm text-muted-foreground">
            Selecione uma categoria ou busque um produto abaixo.
          </p>
        )}
        <div className="max-h-56 space-y-3 overflow-y-auto">
          {activeGroups.map((group) => (
            <div key={group.id} className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground">{group.name}</h4>
              <div className="grid gap-2 sm:grid-cols-2">
                {group.subcategories.map((sub) => (
                  <label
                    key={sub.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 hover:bg-muted"
                  >
                    <Checkbox
                      aria-label={"Selecionar subcategoria: " + group.name + " / " + sub.name}
                      checked={catalogSelectionState(
                        selected,
                        sub.items.map((i) => i.id),
                      )}
                      onCheckedChange={() => toggle(sub.items.map((i) => i.id))}
                    />
                    <span className="min-w-0 flex-1 text-sm">{sub.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {sub.items.filter((i) => selected.includes(i.id)).length}/{sub.items.length}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="space-y-3 rounded-xl border p-3">
        <h3 className="text-sm font-semibold">3. Produtos da lista</h3>
        <Input
          aria-label="Buscar produto pelo nome"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Digite o nome para adicionar um produto…"
        />
        <p className="text-xs text-muted-foreground">
          A busca encontra produtos de qualquer categoria sem apagar a seleção. Limpe a busca para
          ver todos os selecionados.
        </p>
        <div className="max-h-72 overflow-y-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-muted">
              <tr>
                <th className="p-2">Produto</th>
                <th className="p-2 text-right">Valor de venda</th>
                <th className="p-2 text-right">Disponível</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((item) => (
                <tr key={item.id} className="border-t hover:bg-muted/40">
                  <td className="p-2">
                    <label className="flex cursor-pointer items-center gap-3">
                      <Checkbox
                        aria-label={"Selecionar produto: " + item.name}
                        checked={selected.includes(item.id)}
                        onCheckedChange={() => toggle([item.id])}
                      />
                      <span>{item.name}</span>
                    </label>
                  </td>
                  <td className="p-2 text-right whitespace-nowrap">
                    {Number(item.price) > 0
                      ? formatMoney(
                          Number(item.price),
                          item.price_currency ?? item.currency ?? "USD",
                        )
                      : "Sob consulta"}
                  </td>
                  <td className="p-2 text-right">{item.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!visibleItems.length && (
            <p className="p-3 text-sm text-muted-foreground">
              {term
                ? "Nenhum produto encontrado."
                : "Nenhum produto selecionado. Escolha uma categoria ou busque pelo nome."}
            </p>
          )}
        </div>
      </section>
      <p className="text-xs text-muted-foreground">
        Selecione de 1 a {selectionLimit} produtos. Os marcadores parciais indicam grupos com apenas
        alguns produtos selecionados.
      </p>
    </div>
  );
}
