import { describe, expect, it } from "vitest";
import { catalogAudience, catalogPublicUrl, catalogVisiblePrice } from "./catalog-views";
describe("links públicos centralizados", () => {
  it.each(["cliente", "vendedor"] as const)("preserva público %s", (audience) => {
    const url = new URL(catalogPublicUrl("material com espaço/#", audience));
    expect(url.origin).toBe("https://login.qrcodevalidacao.com");
    expect(url.searchParams.get("publico")).toBe(audience);
    expect(decodeURIComponent(url.pathname.slice("/catalogo/".length))).toBe("material com espaço/#");
    expect(url.hash).toBe("");
  });
  it("mantém os preços ocultos para cliente", () => {
    expect(catalogVisiblePrice(catalogAudience("cliente"), false, 100)).toBeNull();
    expect(catalogVisiblePrice(catalogAudience("vendedor"), false, 100)).toBe(100);
    expect(catalogVisiblePrice("vendedor", true, 100)).toBeNull();
  });
});
