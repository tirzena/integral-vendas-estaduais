import { afterEach, describe, expect, it, vi } from "vitest";
import { changePasswordAndSignOut, watchSessionRevocation } from "./password-session";

afterEach(() => { vi.useRealTimers(); });

describe("troca de senha encerra sessões", () => {
  it("altera a senha antes de encerrar todos os dispositivos", async () => {
    const calls: string[] = [];
    const auth = {
      updateUser: vi.fn(async () => { calls.push("password"); return { error: null }; }),
      signOut: vi.fn(async ({ scope }: { scope: string }) => { calls.push(scope); return { error: null }; }),
    };
    await changePasswordAndSignOut(auth as any, "new-password");
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "new-password" });
    expect(calls).toEqual(["password", "global"]);
  });
  it("não encerra sessões quando a senha é recusada", async () => {
    const auth = { updateUser: vi.fn(async () => ({ error: new Error("recusada") })), signOut: vi.fn() };
    await expect(changePasswordAndSignOut(auth as any, "bad")).rejects.toThrow("recusada");
    expect(auth.signOut).not.toHaveBeenCalled();
  });
  it("limpa a sessão local e informa falha se logout global não for confirmado", async () => {
    const auth = {
      updateUser: vi.fn(async () => ({ error: null })),
      signOut: vi.fn().mockResolvedValueOnce({ error: new Error("offline") }).mockResolvedValueOnce({ error: null }),
    };
    await expect(changePasswordAndSignOut(auth as any, "new-password")).rejects.toThrow("Senha alterada");
    expect(auth.signOut.mock.calls).toEqual([[{ scope: "global" }], [{ scope: "local" }]]);
  });
});

describe("detecção de sessão revogada em outro navegador", () => {
  it("detecta revogação sem esperar expirar o token", async () => {
    vi.useFakeTimers();
    const check = vi.fn().mockResolvedValueOnce(true).mockResolvedValue(false);
    const onRevoked = vi.fn();
    const watcher = watchSessionRevocation({ check, onRevoked, isVisible: () => true });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(onRevoked).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(onRevoked).toHaveBeenCalledTimes(1);
    watcher.stop();
  });
  it("verifica imediatamente ao retornar a uma aba oculta", async () => {
    let visible = false;
    const check = vi.fn(async () => false);
    const onRevoked = vi.fn();
    const watcher = watchSessionRevocation({ check, onRevoked, isVisible: () => visible });
    expect(check).not.toHaveBeenCalled();
    visible = true;
    await watcher.check();
    expect(onRevoked).toHaveBeenCalledOnce();
    watcher.stop();
  });
  it("não trata erro de rede como revogação", async () => {
    vi.useFakeTimers();
    const onRevoked = vi.fn();
    const watcher = watchSessionRevocation({ check: vi.fn().mockRejectedValue(new Error("offline")), onRevoked, isVisible: () => true });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(onRevoked).not.toHaveBeenCalled();
    watcher.stop();
  });
  it("ignora resposta atrasada de uma sessão que já foi desmontada", async () => {
    let resolve!: (valid: boolean) => void;
    const onRevoked = vi.fn();
    const watcher = watchSessionRevocation({ check: () => new Promise<boolean>((r) => { resolve = r; }), onRevoked, isVisible: () => true });
    watcher.stop();
    resolve(false);
    await Promise.resolve();
    expect(onRevoked).not.toHaveBeenCalled();
  });
  it("não inicia verificações simultâneas em eventos repetidos de foco", async () => {
    let resolve!: (valid: boolean) => void;
    const check = vi.fn(() => new Promise<boolean>((r) => { resolve = r; }));
    const watcher = watchSessionRevocation({ check, onRevoked: vi.fn(), isVisible: () => true });
    await watcher.check();
    await watcher.check();
    expect(check).toHaveBeenCalledTimes(1);
    resolve(true);
    watcher.stop();
  });
});
