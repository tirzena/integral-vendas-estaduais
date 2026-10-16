import { describe, it, expect } from "vitest";
import {
  groupCatalogSelection,
  toggleCatalogSelection,
  catalogSelectionState,
  normalizeCatalogSearch,
} from "./catalog-selection";
const items = [
  { id: "a", name: "Produto A", product_id: "c1", category_id: "s1" },
  { id: "b", name: "Produto B", product_id: "c1", category_id: "s2" },
  { id: "c", name: "Produto C", product_id: "c2", category_id: "s1" },
  { id: "d", name: "Sem grupo", product_id: null, category_id: null },
];
describe("seleção de catálogo por grupos", () => {
  it("separa categoria, subcategoria e produtos sem misturar subcategorias com o mesmo id", () => {
    const groups = groupCatalogSelection(
      items,
      [
        { id: "c1", name: "Categoria 1" },
        { id: "c2", name: "Categoria 2" },
      ],
      [
        { id: "s1", name: "Laboratório" },
        { id: "s2", name: "Outro" },
      ],
    );
    expect(groups.find((g) => g.id === "c1")?.items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(groups.find((g) => g.id === "c2")?.subcategories[0]?.items.map((i) => i.id)).toEqual([
      "c",
    ]);
    expect(groups.find((g) => g.id === "uncategorized")?.subcategories[0]?.name).toBe(
      "Sem subcategoria",
    );
  });
  it("preserva a seleção de outras categorias ao selecionar e desmarcar um grupo", () => {
    expect(toggleCatalogSelection(["c"], ["a", "b"])).toEqual(["c", "a", "b"]);
    expect(toggleCatalogSelection(["c", "a", "b"], ["a", "b"])).toEqual(["c"]);
  });
  it("completa a seleção parcial sem duplicar produtos", () => {
    expect(catalogSelectionState(["a"], ["a", "b"])).toBe("indeterminate");
    expect(toggleCatalogSelection(["a"], ["a", "b", "a"])).toEqual(["a", "b"]);
    expect(catalogSelectionState(["a", "b"], ["a", "b"])).toBe(true);
  });
  it("rejeita o grupo completo quando ultrapassa o limite sem perder a seleção anterior", () => {
    const selected = ["a"];
    expect(() => toggleCatalogSelection(selected, ["b", "c"], 2)).toThrow("limite");
    expect(selected).toEqual(["a"]);
  });
  it("busca com acentos e não duplica itens recebidos mais de uma vez", () => {
    expect(normalizeCatalogSearch("ESTÉTICA")).toBe("estetica");
    expect(
      groupCatalogSelection([...items, items[0]!], [], []).flatMap((g) => g.items),
    ).toHaveLength(4);
  });
});
