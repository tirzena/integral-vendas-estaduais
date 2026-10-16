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
  const groups = useMemo(
    () => groupCatalogSelection(items, categories, subcategories),
    [items, categories, subcategories],
  );
  const term = normalizeCatalogSearch(search.trim());
  const visible = groups
    .map((group) => ({
      ...group,
      subcategories: group.subcategories
        .map((sub) => ({
          ...sub,
          visible: sub.items.filter(
            (item) =>
              !term ||
              normalizeCatalogSearch([group.name, sub.name, item.name].join(" ")).includes(term),
          ),
        }))
        .filter((sub) => sub.visible.length),
    }))
    .filter((group) => group.subcategories.length);
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
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange([])}>
            Limpar
          </Button>
        </div>
      </div>
      <Input
        aria-label="Buscar categoria, subcategoria ou produto"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar categoria, subcategoria ou produto…"
      />
      <p className="text-xs text-muted-foreground">
        Marque uma categoria ou subcategoria para selecionar o grupo inteiro. A busca não remove
        seleções já feitas.
      </p>
      <div className="max-h-80 space-y-3 overflow-y-auto rounded-xl border p-2 sm:p-3">
        {visible.map((group) => (
          <section key={group.id} className="overflow-hidden rounded-lg border">
            <div className="flex items-center gap-3 bg-muted/60 p-3">
              <Checkbox
                aria-label={"Selecionar categoria inteira: " + group.name}
                checked={catalogSelectionState(
                  selected,
                  group.items.map((i) => i.id),
                )}
                onCheckedChange={() => toggle(group.items.map((i) => i.id))}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Categoria
                </p>
                <h3 className="break-words text-sm font-semibold">{group.name}</h3>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {group.items.filter((i) => selected.includes(i.id)).length}/{group.items.length}
              </span>
            </div>
            <div className="space-y-2 p-2">
              {group.subcategories.map((sub) => (
                <div key={sub.id} className="rounded-lg border">
                  <div className="flex items-center gap-3 border-b bg-muted/20 p-2.5">
                    <Checkbox
                      aria-label={"Selecionar subcategoria: " + group.name + " / " + sub.name}
                      checked={catalogSelectionState(
                        selected,
                        sub.items.map((i) => i.id),
                      )}
                      onCheckedChange={() => toggle(sub.items.map((i) => i.id))}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] uppercase text-muted-foreground">Subcategoria</p>
                      <h4 className="break-words text-sm font-medium">{sub.name}</h4>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {sub.items.filter((i) => selected.includes(i.id)).length}/{sub.items.length}
                    </span>
                  </div>
                  <div className="space-y-1 p-1">
                    {sub.visible.map((item) => (
                      <label
                        key={item.id}
                        className="flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-muted"
                      >
                        <Checkbox
                          aria-label={"Selecionar produto: " + item.name}
                          checked={selected.includes(item.id)}
                          onCheckedChange={() => toggle([item.id])}
                        />
                        <span className="min-w-0 flex-1 text-sm">
                          <span className="block break-words font-medium">{item.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {Number(item.price) > 0
                              ? formatMoney(
                                  Number(item.price),
                                  item.price_currency ?? item.currency ?? "USD",
                                )
                              : "Sob consulta"}{" "}
                            · {item.quantity} disponíveis
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
        {!visible.length && (
          <p className="p-3 text-sm text-muted-foreground">
            Nenhuma categoria, subcategoria ou produto encontrado.
          </p>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Selecione de 1 a {selectionLimit} produtos. Os marcadores parciais indicam grupos com apenas
        alguns produtos selecionados.
      </p>
    </div>
  );
}
