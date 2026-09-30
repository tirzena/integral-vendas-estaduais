/* eslint-disable @typescript-eslint/no-explicit-any */

export type EvolutionAction =
  | "status"
  | "create"
  | "qr"
  | "check"
  | "sync"
  | "disconnect"
  | "remove"
  | "send"
  | "delete"
  | "profile";

/**
 * Calls the Supabase Edge Function that owns the Evolution credentials.
 * The authenticated Supabase client forwards the current user's JWT, while
 * the Evolution URL and API key stay inside Supabase secrets.
 */
export async function invokeEvolution(
  context: any,
  action: EvolutionAction,
  payload: Record<string, unknown> = {},
): Promise<any> {
  const { data, error } = await context.supabase.functions.invoke("whatsapp-evolution", {
    body: { action, ...payload },
  });

  if (error) {
    let message = "Não foi possível acessar a integração do WhatsApp.";
    const response = (error as any)?.context as Response | undefined;
    if (response && typeof response.clone === "function") {
      try {
        const body = await response.clone().json();
        if (typeof body?.error === "string") message = body.error;
      } catch {
        // Mantém a mensagem segura quando a função não devolve JSON.
      }
    }
    throw new Error(message);
  }

  if (!data?.ok) throw new Error(data?.error ?? "A integração do WhatsApp recusou a operação.");
  return data;
}

/** Nome aleatório sem telefone, nome de cliente ou outro dado pessoal. */
export function newWhatsappInstanceName() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const id = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `erp-${id}`;
}
