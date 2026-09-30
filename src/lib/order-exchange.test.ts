import { describe, expect, it } from "vitest";
import { manualExchange, exchangeConvert, isPix } from "./order-exchange";
describe("Cotação do pedido", () => {
  it("converte Pix em reais e abate corretamente no pedido em dólar", () => {
    const rates = manualExchange("USD", 5, 7000);
    expect(exchangeConvert(500, "BRL", "USD", rates)).toBe(100);
    expect(exchangeConvert(100, "USD", "BRL", rates)).toBe(500);
  });
  it("mantém taxas recíprocas entre as três moedas", () => {
    const rates = manualExchange("PYG", 5, 7000);
    expect(exchangeConvert(10, "USD", "PYG", rates)).toBe(70000);
    expect(exchangeConvert(50, "BRL", "USD", rates)).toBeCloseTo(10, 10);
  });
  it("não aceita taxa vazia, zero, negativa ou infinita", () => {
    for (const n of [0, -1, NaN, Infinity]) expect(manualExchange("USD", n, 7000)).toBeNull();
    expect(isPix(" PIX ")).toBe(true);
  });
});
