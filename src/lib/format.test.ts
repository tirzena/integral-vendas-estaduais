import { describe, expect, it } from "vitest";
import { formatDate } from "./format";
describe("datas dos documentos", () => {
  it("preserva o dia informado sem converter data civil para UTC", () => {
    expect(formatDate("2026-09-08")).toBe("08/09/2026");
  });
  it("não quebra o relatório com uma data inválida", () => {
    expect(formatDate("data inválida")).toBe("—");
    expect(formatDate(null)).toBe("—");
  });
});
