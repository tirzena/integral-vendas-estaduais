import type { AuthChangeEvent, Session, SupabaseClient } from "@supabase/supabase-js";

type AuthSource = Pick<SupabaseClient["auth"], "getSession" | "onAuthStateChange">;
type Callbacks = {
  onSession: (session: Session | null) => void;
  onIdentityChange: () => void;
  onUserUpdated: (userId: string | null) => void;
  onInitialError: () => void;
};

/** Never start queries inside the SDK's auth notification/refresh callback. */
export function observeAuthSession(auth: AuthSource, callbacks: Callbacks) {
  let active = true;
  let eventReceived = false;
  let previousUserId: string | null = null;
  const pending = new Set<ReturnType<typeof setTimeout>>();
  const defer = (action: () => void) => {
    const timer = setTimeout(() => {
      pending.delete(timer);
      if (active) action();
    }, 0);
    pending.add(timer);
  };
  const apply = (session: Session | null, event?: AuthChangeEvent) => {
    const nextUserId = session?.user.id ?? null;
    if (event === "SIGNED_OUT" || (previousUserId && previousUserId !== nextUserId))
      callbacks.onIdentityChange();
    previousUserId = nextUserId;
    callbacks.onSession(session);
    if (event === "USER_UPDATED") callbacks.onUserUpdated(nextUserId);
    // SIGNED_IN also fires when a tab regains focus. Same account != new login.
  };
  const { data } = auth.onAuthStateChange((event, session) => {
    eventReceived = true;
    defer(() => apply(session, event));
  });
  void auth.getSession().then(({ data, error }) => {
    if (!active || eventReceived) return;
    if (error) callbacks.onInitialError();
    else apply(data.session);
  }).catch(() => {
    if (active && !eventReceived) callbacks.onInitialError();
  });
  return () => {
    active = false;
    data.subscription.unsubscribe();
    pending.forEach(clearTimeout);
    pending.clear();
  };
}

