import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { OrderApprovals } from "@/components/admin/OrderApprovals";
vi.mock("@/hooks/useAuth", () => ({ useCurrentUser: () => ({ userId: "admin", viewAs: null }) }));
vi.mock("@/lib/order-review-flow", () => ({ useCanReviewOrders: () => ({ data: true }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: () => ({
    data: [{
      id: "request", order_id: "order", requested_by: "seller", current_seller_id: "seller",
      requester_name: "Renata Vitoria", seller_name: "Renata Vitoria",
      created_at: "2026-10-20T18:29:26.791642Z", reason: "Produto incluído",
      previous_snapshot: { number: 79 }, proposed_args: { p_items: [] },
    }], isFetching: false, isLoading: false, error: null, refetch: vi.fn(),
  }),
}));
describe("identificação da solicitação de alteração", () => {
  it("mostra solicitante, vendedor e horário de Brasília", () => {
    const html = renderToString(<OrderApprovals />).replace(/<!--.*?-->/g, "");
    expect(html).toContain("Renata Vitoria");
    expect(html).toContain("Solicitado por:");
    expect(html).toContain("Vendedor responsável:");
    expect(html).toContain("20/10/2026");
    expect(html).toContain("15:29:26");
    expect(html).toContain("Pedido 79");
    expect(html).toContain("Atualizar solicitações");
  });
});

