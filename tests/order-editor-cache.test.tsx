import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { OrderEditDialog } from "@/components/orders/OrderEditDialog";

const fixture = vi.hoisted(() => ({
  slots: [] as any[],
  index: 0,
  actor: { userId: "seller", isAdmin: false, loading: false, viewAs: null as any },
  data: {
    can_edit: true,
    requires_approval: false,
    order: { id: "order-a", number: 12, customer_id: null, approval_status: "approved" },
    items: [{ id: "line", item_id: "item", description: "Produto", quantity: 1, unit_price: 100 }],
    customers: [{ id: "customer", name: "Cliente identificado" }],
    catalog: [],
    warehouses: [],
  },
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: any) => {
    const slot = fixture.index++;
    if (!(slot in fixture.slots))
      fixture.slots[slot] = typeof initial === "function" ? initial() : initial;
    return [
      fixture.slots[slot],
      (next: any) => {
        fixture.slots[slot] = typeof next === "function" ? next(fixture.slots[slot]) : next;
      },
    ];
  },
  useEffect: (effect: () => void) => effect(),
}));
vi.mock("@tanstack/react-query", () => ({
  // Deliberately do not execute queryFn: reproduces reopening cached orders.
  useQuery: () => ({ data: fixture.data, isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ loading: false, seesCompanySales: false }),
}));
vi.mock("@/hooks/useAuth", () => ({ useCurrentUser: () => fixture.actor }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: any) => <div>{children}</div>,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogFooter: ({ children }: any) => <footer>{children}</footer>,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));
vi.mock("@/components/ui/input", () => ({ Input: (props: any) => <input {...props} /> }));
function render() {
  fixture.index = 0;
  return renderToString(<OrderEditDialog orderId="order-a" onClose={() => {}} />);
}
describe("reabrir editor de pedido em cache", () => {
  beforeEach(() => {
    fixture.slots = [];
    fixture.actor.viewAs = null;
  });
  it("preenche o formulário sem repetir a consulta e copia os itens", () => {
    render();
    expect(fixture.slots[0].id).toBe("order-a");
    expect(fixture.slots[0].items[0]).not.toBe(fixture.data.items[0]);
    const html = render();
    expect(html).toContain("Venda balcão");
    expect(html).toContain("Cliente identificado");
    expect(html).toContain("Transportadora");
    expect(html).toContain("Código de rastreio");
    expect(html).toContain("Prazo de entrega");
    expect(html).toContain("Enviar solicitação");
  });
  it("preserva o rascunho durante atualização em segundo plano", () => {
    render();
    fixture.slots[0].notes = "Alteração ainda não salva";
    render();
    expect(fixture.slots[0].notes).toBe("Alteração ainda não salva");
    expect(fixture.data.order).not.toHaveProperty("notes");
  });
  it("bloqueia alteração durante modo espelho", () => {
    fixture.actor.viewAs = { userId: "other" };
    render();
    expect(render()).toContain("Saia do modo espelho");
  });
});
