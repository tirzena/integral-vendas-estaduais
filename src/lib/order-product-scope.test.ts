import { describe, expect, it, vi } from "vitest";
import { scopeOrdersByProduct } from "./order-product-scope";
describe("mixed order category filters", () => {
 it("keeps all authorized documents without a category filter", async () => {
  const db={rpc:vi.fn()}, query={in:vi.fn()};
  expect(await scopeOrdersByProduct(db,query,"todos")).toBe(query);
  expect(db.rpc).not.toHaveBeenCalled();
 });
 it("filters by authorized IDs from order lines, even with an empty header", async () => {
  const db={rpc:vi.fn().mockResolvedValue({data:[{id:"65"},{id:"76"},{id:"65"}],error:null})};
  const query={in:vi.fn().mockReturnValue({data:[{id:"65"},{id:"76"}]})};
  await scopeOrdersByProduct(db,query,"peptides");
  expect(query.in).toHaveBeenCalledWith("id",["65","76"]);
 });
 it("does not fall back to all orders when category has no matches", async () => {
  const db={rpc:vi.fn().mockResolvedValue({data:[],error:null})},query={in:vi.fn()};
  await scopeOrdersByProduct(db,query,"other");
  expect(query.in).toHaveBeenCalledWith("id",["00000000-0000-0000-0000-000000000000"]);
 });
 it("surfaces a lookup failure", async () => {
  const db={rpc:vi.fn().mockResolvedValue({data:null,error:new Error("lookup failed")})};
  await expect(scopeOrdersByProduct(db,{},"peptides")).rejects.toThrow("lookup failed");
 });
});
