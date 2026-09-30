export const ESTADUAL_ROUTE_PREFIXES = [
  "/painel",
  "/crm",
  "/clientes",
  "/produtos",
  "/pedidos",
  "/promocoes",
  "/entregas",
  "/financeiro",
  "/ranking",
  "/relatorios",
  "/equipe",
  "/tarefas",
  "/avisos",
  "/chat",
  "/configuracoes",
  "/confirmar-entrega",
] as const;

export function isEstadualRoute(pathname: string) {
  return ESTADUAL_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/"),
  );
}
