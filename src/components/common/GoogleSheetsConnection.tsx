import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link2, Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import {
  disconnectGoogleSheets,
  getGoogleSheetsStatus,
  startGoogleSheetsOAuth,
} from "@/lib/sheets.functions";
import { Button } from "@/components/ui/button";

type Props = {
  onConnectedChange?: (connected: boolean) => void;
};

export function GoogleSheetsConnection({ onConnectedChange }: Props) {
  const getStatus = useServerFn(getGoogleSheetsStatus);
  const startOAuth = useServerFn(startGoogleSheetsOAuth);
  const disconnect = useServerFn(disconnectGoogleSheets);
  const [status, setStatus] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      const result = await getStatus();
      setStatus(result);
      onConnectedChange?.(result.connected);
    } catch {
      setStatus({ configured: true, connected: false, connection: null });
      onConnectedChange?.(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function connect() {
    setBusy(true);
    try {
      const result = await startOAuth({ data: { returnPath: window.location.pathname } });
      window.location.assign(result.url);
    } catch (error: any) {
      toast.error(error?.message ?? "Não foi possível conectar o Google Planilhas.");
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await disconnect();
      toast.success("Google Planilhas desconectado.");
      await refresh();
    } catch (error: any) {
      toast.error(error?.message ?? "Não foi possível desconectar o Google Planilhas.");
    } finally {
      setBusy(false);
    }
  }

  if (!status) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Verificando Google Planilhas…
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {status.connected ? "Google Planilhas conectado" : "Conecte o Google Planilhas"}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {status.connected
            ? status.connection?.google_email || "Conta Google autorizada"
            : "Esta autorização é independente do Google Calendar."}
        </p>
      </div>
      {status.connected ? (
        <Button type="button" size="sm" variant="ghost" onClick={remove} disabled={busy}>
          {busy ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <LogOut className="mr-2 size-4" />
          )}
          Desconectar
        </Button>
      ) : (
        <Button type="button" size="sm" onClick={connect} disabled={busy || !status.configured}>
          {busy ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Link2 className="mr-2 size-4" />
          )}
          Conectar Google Planilhas
        </Button>
      )}
    </div>
  );
}
