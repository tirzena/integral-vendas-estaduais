import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { observeAuthSession } from "./auth-session-observer";

function setup(initial: any = null) {
  let handler: any;
  const callbacks = { onSession: vi.fn(), onIdentityChange: vi.fn(), onUserUpdated: vi.fn(), onInitialError: vi.fn() };
  const unsubscribe = vi.fn();
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: initial }, error: null })),
    onAuthStateChange: vi.fn((callback: any) => {
      handler = callback;
      return { data: { subscription: { unsubscribe } } };
    }),
  };
  const stop = observeAuthSession(auth as any, callbacks);
  return { auth, callbacks, stop, unsubscribe, emit: (event: string, session: any) => handler(event, session) };
}
const session = (id: string, token = "token") => ({ user: { id }, access_token: token });

describe("sessão ao retornar à aba", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it("não inicia consultas enquanto o callback do SDK está executando", () => {
    const f = setup();
    expect(f.emit("USER_UPDATED", session("seller"))).toBeUndefined();
    expect(f.callbacks.onSession).not.toHaveBeenCalled();
    expect(f.callbacks.onUserUpdated).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(f.callbacks.onUserUpdated).toHaveBeenCalledWith("seller");
    f.stop();
  });
  it("retornos repetidos ao foco e renovação não limpam cache nem atualizam perfil", async () => {
    const f = setup(session("seller"));
    await Promise.resolve();
    for (let i = 0; i < 20; i++) f.emit("SIGNED_IN", session("seller"));
    f.emit("TOKEN_REFRESHED", session("seller", "new-token"));
    vi.runAllTimers();
    expect(f.auth.getSession).toHaveBeenCalledTimes(1);
    expect(f.callbacks.onIdentityChange).not.toHaveBeenCalled();
    expect(f.callbacks.onUserUpdated).not.toHaveBeenCalled();
    expect(f.callbacks.onSession).toHaveBeenLastCalledWith(session("seller", "new-token"));
    f.stop();
  });
  it("limpa os dados antes de publicar sessão de outra conta", async () => {
    const f = setup(session("first"));
    await Promise.resolve();
    const sequence: string[] = [];
    f.callbacks.onIdentityChange.mockImplementation(() => { sequence.push("clear"); });
    f.callbacks.onSession.mockImplementation(() => { sequence.push("session"); });
    f.emit("SIGNED_IN", session("second"));
    vi.runAllTimers();
    expect(sequence).toEqual(["clear", "session"]);
    f.stop();
  });
  it("descarte cancela callbacks pendentes e remove assinatura", () => {
    const f = setup();
    f.emit("SIGNED_IN", session("seller"));
    f.stop();
    vi.runAllTimers();
    expect(f.callbacks.onSession).not.toHaveBeenCalled();
    expect(f.unsubscribe).toHaveBeenCalledOnce();
  });
  it("evento mais recente prevalece sobre leitura inicial atrasada", async () => {
    const f = setup(session("old"));
    f.emit("SIGNED_IN", session("new"));
    await Promise.resolve();
    vi.runAllTimers();
    expect(f.callbacks.onSession).toHaveBeenCalledTimes(1);
    expect(f.callbacks.onSession).toHaveBeenCalledWith(session("new"));
    f.stop();
  });
  it("logout limpa cache e publica ausência de sessão", async () => {
    const f = setup(session("seller"));
    await Promise.resolve();
    f.emit("SIGNED_OUT", null);
    vi.runAllTimers();
    expect(f.callbacks.onIdentityChange).toHaveBeenCalledOnce();
    expect(f.callbacks.onSession).toHaveBeenLastCalledWith(null);
    f.stop();
  });
});

