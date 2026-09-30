import { describe, it, expect } from "vitest";
import {
  defaultOperationalFilter,
  filterOperationalRows,
  enrichOperationalRow,
} from "./operational-filters";
const row = {
  number: 2,
  filterDate: "2026-09-01",
  filterStatus: "entregue",
  filterSeller: { id: "s", name: "José" },
  filterTeams: [{ id: "t", name: "Equipe" }],
  filterItems: [{ id: "i", name: "Produto" }],
  filterSuppliers: [{ id: "p", name: "Farmácia" }],
  filterOrigin: "pdv",
  filterSearch: "José Farmácia Produto",
};
describe("operational filters", () => {
  it("combines supplier, actual item, seller, team, origin and accent insensitive search", () => {
    const f = {
      ...defaultOperationalFilter,
      search: "farmacia",
      supplier: "p",
      item: "i",
      seller: "s",
      team: "t",
      origin: "pdv",
      status: "entregue",
    };
    expect(filterOperationalRows([row], f)).toHaveLength(1);
    expect(filterOperationalRows([row], { ...f, item: "different" })).toHaveLength(0);
    expect(filterOperationalRows([row], { ...f, supplier: "other" })).toHaveLength(0);
  });
  it("sorts numerically, clears to all periods, and recognizes payment plus delivery phases", () => {
    const r = { ...row, number: 10, filterStatus: "pago", filterStatuses: ["pago", "entregue"] };
    expect(filterOperationalRows([r, row], defaultOperationalFilter).map((r) => r.number)).toEqual([
      2, 10,
    ]);
    expect(
      filterOperationalRows([r], { ...defaultOperationalFilter, status: "entregue" }),
    ).toHaveLength(1);
    expect(
      filterOperationalRows([row], { ...defaultOperationalFilter, period: "hoje" }),
    ).toHaveLength(0);
  });
  it("links a purchase to its order seller and item, not its category or purchaser", () => {
    const r = enrichOperationalRow(
      {
        number: 1,
        buyer: { id: "buyer", name: "Admin" },
        supplier: { id: "p", name: "Farmácia" },
        source_order: { seller_id: "s", origin: "pdv" },
      },
      {
        people: [{ id: "s", full_name: "José" }],
        items: [{ id: "i", name: "Produto", supplier_id: "p" }],
        teamMembers: [{ user_id: "s", team_id: "t" }],
        teams: [{ id: "t", name: "Equipe" }],
      },
      [{ item_id: "i", quantity: 100 }],
      true,
    );
    expect(r.filterSeller.id).toBe("s");
    expect(r.filterItems[0].id).toBe("i");
    expect(r.filterTeams[0].id).toBe("t");
    expect(r.filterSuppliers[0].id).toBe("p");
  });
});
