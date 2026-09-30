/**
 * Aceita apenas caminhos internos: uma única barra inicial, sem esquema,
 * sem host e sem barra invertida. Qualquer outra coisa cai no padrão.
 */
export function safeReturnPath(value: unknown, fallback = "/trafego-pago"): string {
  if (typeof value !== "string") return fallback;
  const path = value.trim();
  if (!path.startsWith("/")) return fallback;
  if (path.startsWith("//")) return fallback;
  if (path.includes("\\")) return fallback;
  if (path.includes("://")) return fallback;
  // controla caracteres de controle e tentativas de esquema colado
  if ([...path].some((char) => { const code = char.charCodeAt(0); return code < 32 || code === 127; })) return fallback;
  return path;
}
