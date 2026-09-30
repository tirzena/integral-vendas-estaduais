import { describe, expect, it } from "vitest";
import { isEstadualRoute } from "./estadual-routes";

describe("isEstadualRoute", () => {
  it("permite somente áreas operacionais estaduais", () => {
    for (const path of [
      "/painel", "/crm", "/crm/abc", "/clientes", "/produtos", "/pedidos",
      "/promocoes", "/entregas", "/financeiro", "/ranking", "/relatorios",
      "/equipe", "/tarefas/abc", "/avisos", "/chat", "/configuracoes",
    ]) expect(isEstadualRoute(path)).toBe(true);
  });

  it("bloqueia áreas centrais mesmo por URL direta", () => {
    for (const path of [
      "/admin", "/acessos", "/sos", "/compras", "/fornecedores",
      "/investimentos", "/integracoes", "/sistemas-divisionais",
      "/trafego-pago", "/autenticidade", "/estoque",
    ]) expect(isEstadualRoute(path)).toBe(false);
  });
});
