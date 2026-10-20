import { describe, expect, it, vi } from "vitest";
import { readAllRows } from "./read-all-rows";
describe("leitura completa das listas", () => {
  it("carrega registros além do limite da primeira página sem duplicar", async () => {
    const rows = Array.from({ length: 1_205 }, (_, id) => ({ id }));
    const query = { order: vi.fn(), range: vi.fn(async (from, through) => ({ data: rows.slice(from, through + 1), error: null })) };
    query.order.mockReturnValue(query);
    const result = await readAllRows(query);
    expect(result.data).toEqual(rows);
    expect(query.order).toHaveBeenCalledTimes(1);
    expect(query.range).toHaveBeenCalledTimes(3);
  });
  it("não devolve uma lista parcial como se estivesse completa", async () => {
    const error = new Error("falha de conexão");
    const query = { order: vi.fn(), range: vi.fn().mockResolvedValueOnce({ data: Array(500).fill({ id: 1 }), error: null }).mockResolvedValueOnce({ data: null, error }) };
    query.order.mockReturnValue(query);
    await expect(readAllRows(query)).rejects.toThrow(error);
  });
});
