import { describe, it, expect } from "vitest";
import { memberCatalogSalePrice } from "./member-catalog-pricing";
describe("preço de venda da direção nos materiais dos membros", () => {
  it("preserva BRL mesmo quando a moeda de custo é USD", () =>
    expect(
      memberCatalogSalePrice(
        { name: "Produto", price: 380, price_currency: "BRL", currency: "USD" },
        "BRL",
        { "USD-BRL": 6 },
      ),
    ).toBe(380));
  it("converte a moeda de venda sem usar custo", () =>
    expect(
      memberCatalogSalePrice(
        { name: "Produto", price: 42, price_currency: "USD", currency: "BRL" },
        "BRL",
        { "USD-BRL": 5 },
      ),
    ).toBe(210));
  it("arredonda a moeda convertida", () =>
    expect(
      memberCatalogSalePrice({ name: "Produto", price: 37.8, currency: "USD" }, "BRL", {
        "USD-BRL": 5.237,
      }),
    ).toBe(197.96));
  it("mantém preço ausente ou zero sob consulta", () => {
    for (const price of [null, 0])
      expect(() => memberCatalogSalePrice({ name: "Produto", price }, "BRL", {})).toThrow(
        "sob consulta",
      );
  });
  it("recusa conversão sem cotação", () =>
    expect(() =>
      memberCatalogSalePrice({ name: "Produto", price: 10, currency: "USD" }, "BRL", {}),
    ).toThrow("Cotação"));
});
