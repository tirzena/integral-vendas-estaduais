import { describe, expect, it } from "vitest";
import { activeRankingSellerIds, rankingOrderScope } from "./ranking-scope";

describe("participação no ranking", () => {
  it("inclui vendedores ativos e exclui membros que podem vender sem competir", () => {
    const nonCompeting = [
      "cf25abd8-ed9d-438d-8b09-85e27a71e808",
      "90a39e4e-4529-4929-b682-33377cf34080",
      "2046cc11-d5f8-4e23-b813-222b3e56a662",
      "28d111b5-1d7d-4555-8c9d-4b5d04fea4b8",
      "60f8d872-1e03-4fa3-bd85-f50dd17140cd",
    ];
    const ids = ["enzo", "renata", "inativo", ...nonCompeting];
    expect([...activeRankingSellerIds(ids.map(user_id => ({user_id})), ids.map(id => ({id,is_active:id!=="inativo"})))])
      .toEqual(["enzo", "renata"]);
  });
  it("considera somente as linhas da categoria escolhida em pedidos mistos", () => {
    const lines = [{item_id:"a",quantity:2,total:200},{item_id:"b",quantity:3,total:600}];
    expect(rankingOrderScope({total:800},lines,"categoria-a",new Map([["a","categoria-a"],["b","categoria-b"]])))
      .toEqual({matches:true,lines:[lines[0]],total:200});
  });
});
