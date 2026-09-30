import { describe, expect, it, vi } from "vitest";

import { getPurchasePositionsForContext } from "./purchase-position.functions";

const handler = ({ context }: { context: { userId: string; supabase: unknown } }) =>
  getPurchasePositionsForContext(context as { userId: string; supabase: any });

function client(active = true, financial = true, queryError = false) {
  const tables: string[] = [];
  return {
    tables,
    rpc: vi.fn(async () => ({ data: financial, error: null })),
    from: vi.fn((table: string) => {
      tables.push(table);
      const query = {
        select: () => query,
        eq: () => query,
        single: async () => ({ data: { is_active: active }, error: null }),
        order: () => query,
        range: async () => ({ data: [], error: queryError ? new Error("Unavailable") : null }),
      };
      return query;
    }),
  };
}

describe("authenticated purchase-position read", () => {
  it("uses the authenticated client without a service-role environment key", async () => {
    const db = client();
    await expect(handler({ context: { userId: "member", supabase: db } })).resolves.toEqual([]);
    expect(db.tables).toEqual(["profiles", "purchase_orders", "stock_lot_receipts"]);
    expect(db.rpc).toHaveBeenCalledWith("app_has_cap", { _uid: "member", _cap: "company_finance" });
  });

  it.each([[false, true], [true, false]])("rejects inactive or non-financial members", async (active, financial) => {
    const db = client(active, financial);
    await expect(handler({ context: { userId: "member", supabase: db } })).rejects.toThrow("Sem permissão");
    expect(db.tables).toEqual(["profiles"]);
  });

  it("reports failed reads instead of returning empty financial indicators", async () => {
    const db = client(true, true, true);
    await expect(handler({ context: { userId: "member", supabase: db } })).rejects.toThrow("Não foi possível");
  });
});
