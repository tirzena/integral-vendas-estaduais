import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

/**
 * Usa explicitamente o JWT atual nas operações com arquivos.
 * Assim Storage e a gravação do registro usam a mesma identidade autenticada.
 */
export async function authenticatedFileClient() {
  const { data, error } = await supabase.auth.getSession();
  const session = data.session;
  if (error || !session?.access_token) {
    throw new Error("Sua sessão expirou. Entre novamente para anexar o arquivo.");
  }

  const url = import.meta.env["VITE_SUPABASE_URL"];
  const key = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("A conexão com os arquivos não está configurada.");

  const client = createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { client, userId: session.user.id };
}
