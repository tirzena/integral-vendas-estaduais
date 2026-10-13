import { describe, expect, it } from "vitest";
import { activeRankingSellerIds, rankingOrderScope } from "../src/lib/ranking-scope";

describe("ranking category scope", () => {
  const lines = [{item_id: "a", quantity: 10, total: 100}, {item_id: "b", quantity: 20, total: 400}];
  const categories = new Map([["a", "peptides"], ["b", "aesthetics"]]);
  it("includes a mixed order without a header category and counts only its matching lines", () => {
    expect(rankingOrderScope({product_id: null, total: 500}, lines, "peptides", categories)).toEqual({matches: true, lines: [lines[0]], total: 100});
  });
  it("preserves whole-order totals when all categories are selected", () => {
    expect(rankingOrderScope({total: 500}, lines, "todos", categories)).toEqual({matches: true, lines, total: 500});
  });
  it("does not count an unrelated category even if the header is stale", () => {
    expect(rankingOrderScope({product_id: "other", total: 500}, lines, "other", categories).matches).toBe(false);
  });
  it("supports historical header-only orders", () => {
    expect(rankingOrderScope({product_id: "peptides", total: 50}, [], "peptides", categories)).toEqual({matches: true, lines: [], total: 50});
  });
  it("keeps active sellers with no orders and excludes inactive test accounts", () => {
    expect([...activeRankingSellerIds([{user_id: "active"}, {user_id: "inactive"}], [{id: "active",is_active: true},{id: "inactive",is_active: false}])]).toEqual(["active"]);
  });
});
