import { describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: any) => ({ options }),
  redirect: (options: any) => Object.assign(new Error("redirect"), options),
}));
import { Route } from "@/routes/index";
describe("entrada estadual sem tela vazia", () => {
  it("redireciona imediatamente para a tela de entrada", () => {
    let redirect: any;
    try { Route.options.beforeLoad!({} as any); } catch (error) { redirect = error; }
    expect(redirect).toMatchObject({ to: "/auth", replace: true });
    expect(Route.options.ssr).not.toBe(false);
  });
});

