import { useEffect, useState } from "react";

export function RouteLoading() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 12_000);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6 text-foreground">
      <div className="max-w-md space-y-4 text-center">
        <p role="status" aria-live="polite">{slow ? "A conexão está demorando mais que o esperado." : "Carregando o Sistema Integral…"}</p>
        {slow && <div className="flex flex-wrap justify-center gap-4">
          <button className="rounded-md border px-4 py-2" onClick={() => window.location.reload()}>Tentar novamente</button>
          <a className="rounded-md border px-4 py-2" href="/auth">Ir para a entrada</a>
        </div>}
      </div>
    </main>
  );
}

