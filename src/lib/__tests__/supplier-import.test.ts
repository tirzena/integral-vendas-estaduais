import { describe, expect, it } from "vitest";
import {
  matchRows,
  parseNumber,
  parseSupplierList,
  type MatchItem,
} from "../supplier-import";

const items: MatchItem[] = [
  { id: "a", name: "iPhone 14 128GB", sku: "SKU-100", barcode: "7891234567895", variation: null, quantity: 5, cost: 500, price: 700, currency: "USD", product_id: "p1" },
  { id: "b", name: "iPhone 14 Pro Max", sku: "SKU-200", barcode: null, variation: null, quantity: 2, cost: 900, price: 1200, currency: "USD", product_id: "p1" },
  { id: "c", name: "Fone TWS", sku: "SKU-300", barcode: null, variation: null, quantity: 0, cost: 8, price: 15, currency: "USD", product_id: "p1" },
  { id: "d", name: "Fone TWS", sku: "SKU-301", barcode: null, variation: "preto", quantity: 0, cost: 8, price: 15, currency: "USD", product_id: "p1" },
];

describe("parseNumber", () => {
  it("lê formato brasileiro e americano", () => {
    expect(parseNumber("1.234,56")).toBe(1234.56);
    expect(parseNumber("1,234.56")).toBe(1234.56);
    expect(parseNumber("620")).toBe(620);
    expect(parseNumber("US$ 12,50")).toBe(12.5);
    expect(parseNumber("abc")).toBeNull();
  });
});

describe("parseSupplierList", () => {
  it("lê CSV com ponto e vírgula", () => {
    const rows = parseSupplierList("SKU-100;iPhone 14 128GB;10;620");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.code).toBe("SKU-100");
    expect(rows[0]!.qty).toBe(10);
    expect(rows[0]!.value).toBe(620);
  });

  it("lê texto livre de WhatsApp", () => {
    const rows = parseSupplierList("iPhone 14 Pro Max 5 un 950 dólares");
    expect(rows[0]!.qty).toBe(5);
    expect(rows[0]!.value).toBe(950);
    expect(rows[0]!.currency).toBe("USD");
    expect(rows[0]!.description.toLowerCase()).toContain("iphone 14 pro max");
  });

  it("lê colunas separadas por tabulação com código de barras", () => {
    const rows = parseSupplierList("7891234567895\tFone TWS\t24\tUS$ 12,50");
    expect(rows[0]!.barcode).toBe("7891234567895");
    expect(rows[0]!.qty).toBe(24);
    expect(rows[0]!.value).toBe(12.5);
  });

  it("ignora cabeçalho e linhas vazias, mas não perde linhas de produto", () => {
    const rows = parseSupplierList("Codigo;Descricao;Quantidade;Preco\n\nSKU-100;iPhone 14 128GB;3;600");
    expect(rows).toHaveLength(1);
  });
});

describe("matchRows", () => {
  it("prioriza SKU e código de barras", () => {
    const rows = matchRows(parseSupplierList("SKU-100;iPhone 14 128GB;10;620"), items);
    expect(rows[0]!.state).toBe("exata");
    expect(rows[0]!.itemId).toBe("a");
  });

  it("marca ambígua quando dois produtos têm o mesmo nome", () => {
    const rows = matchRows(parseSupplierList("Fone TWS 10 un 12"), items);
    expect(rows[0]!.state).toBe("ambigua");
    expect(rows[0]!.itemId).toBeNull();
  });

  it("nunca aplica sozinho uma correspondência aproximada", () => {
    const rows = matchRows(parseSupplierList("iPhone 14 Pro Max Lacrado 2 un 900"), items);
    expect(rows[0]!.state).toBe("sugestao");
    expect(rows[0]!.itemId).toBeNull();
  });

  it("marca duplicidade dentro da própria lista", () => {
    const rows = matchRows(parseSupplierList("SKU-100;iPhone 14;1;600\nSKU-100;iPhone 14;2;610"), items);
    expect(rows[1]!.state).toBe("duplicada");
  });

  it("usa alias confirmado do fornecedor", () => {
    const rows = matchRows(parseSupplierList("IP14-FORN 4 un 640"), items, [
      { supplier_code: null, alias_normalized: "ip14-forn", inventory_item_id: "a" },
    ]);
    expect(rows[0]!.itemId).toBe("a");
  });

  it("marca produto desconhecido como não encontrado", () => {
    const rows = matchRows(parseSupplierList("Geladeira Brastemp 1 un 3000"), items);
    expect(rows[0]!.state).toBe("nao_encontrada");
  });

  it("marca linha sem quantidade e sem valor", () => {
    const rows = matchRows(parseSupplierList("SKU-100;iPhone 14 128GB;;"), items);
    expect(rows[0]!.state).toBe("sem_valor");
  });

  it("processa lote grande", () => {
    const text = Array.from({ length: 500 }, (_, i) => `SKU-100;iPhone 14 128GB;${i + 1};620`).join("\n");
    const rows = matchRows(parseSupplierList(text), items);
    expect(rows).toHaveLength(500);
    expect(rows.filter((r) => r.state === "duplicada")).toHaveLength(499);
  });
});
