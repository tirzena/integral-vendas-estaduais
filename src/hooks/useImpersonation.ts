import { useSyncExternalStore } from "react";
import type { AppRole } from "@/hooks/useAuth";

/**
 * Permite ao administrador ver o sistema exatamente como um membro vê.
 * Fica guardado só no navegador de quem está olhando.
 */
export type ViewAs = { userId: string; name: string; roles: AppRole[] } | null;

const KEY = "os:view-as";
const EVENT = "os:view-as-changed";

function read(): ViewAs {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ViewAs) : null;
  } catch {
    return null;
  }
}

let cache: ViewAs = null;
let cacheRaw: string | null = null;

function snapshot(): ViewAs {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(KEY);
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    cache = read();
  }
  return cache;
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function setViewAs(value: ViewAs) {
  if (value) window.localStorage.setItem(KEY, JSON.stringify(value));
  else window.localStorage.removeItem(KEY);
  window.dispatchEvent(new Event(EVENT));
}

export function useViewAs(): ViewAs {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}
