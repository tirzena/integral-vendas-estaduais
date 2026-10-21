import type { SupabaseClient } from "@supabase/supabase-js";

type PasswordAuth = Pick<SupabaseClient["auth"], "updateUser" | "signOut">;

/** Supabase revokes the other sessions on password change; also close this one. */
export async function changePasswordAndSignOut(auth: PasswordAuth, password: string) {
  const { error } = await auth.updateUser({ password });
  if (error) throw error;
  const result = await auth.signOut({ scope: "global" });
  if (result.error) {
    await auth.signOut({ scope: "local" });
    throw new Error("Senha alterada. Não foi possível confirmar o encerramento global; entre novamente e tente sair de todos os dispositivos.");
  }
}

export async function isIntegralSessionActive(client: SupabaseClient): Promise<boolean> {
  const { data, error } = await client.rpc("integral_my_session_active").abortSignal(AbortSignal.timeout(10_000));
  if (error) throw error;
  return data === true;
}

/** Single lightweight check, without invalidating business queries on focus. */
export function watchSessionRevocation(options: {
  check: () => Promise<boolean>;
  onRevoked: () => void;
  isVisible: () => boolean;
  intervalMs?: number;
}) {
  let stopped = false;
  let checking = false;
  let revoked = false;
  const check = async () => {
    if (stopped || checking || revoked || !options.isVisible()) return;
    checking = true;
    try {
      const valid = await options.check();
      if (!stopped && !valid) {
        revoked = true;
        options.onRevoked();
      }
    } catch {
      // An unavailable network is not evidence that a session was revoked.
    } finally {
      checking = false;
    }
  };
  const timer = setInterval(() => void check(), options.intervalMs ?? 15_000);
  void check();
  return {
    check,
    stop: () => { stopped = true; clearInterval(timer); },
  };
}
