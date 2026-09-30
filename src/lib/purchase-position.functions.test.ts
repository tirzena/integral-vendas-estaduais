import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: () => ({ handler: (handler: unknown) => handler }),
  }),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => {
  throw new Error("The authenticated read must not load the service-role client");
});

import { getPurchasePositions } from "./purchase-position.functions";

// Invoke the registered handler with the context supplied by auth middleware.
const handler = getPurchasePositions as unknown as
  (args: { context: { userId: string; supabase: unknown } }) => Promise<unknown>;

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
