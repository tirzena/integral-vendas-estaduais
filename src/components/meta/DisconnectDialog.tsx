import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { disconnectMeta, getMetaStatus, setAccountsActive } from "@/lib/meta.functions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * Remoção seletiva: escolhe contas (ou uma autorização inteira) e confirma dentro do modal.
 * O que não for escolhido continua conectado, com os vínculos intactos.
 */
export function DisconnectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [accounts, setAccounts] = useState<Record<string, boolean>>({});
  const [connections, setConnections] = useState<Record<string, boolean>>({});
  const [confirming, setConfirming] = useState(false);

  const deactivate = useServerFn(setAccountsActive);
  const disconnect = useServerFn(disconnectMeta);

  const status = useQuery({
    queryKey: ["meta-status"],
    queryFn: () => getMetaStatus(),
    retry: false,
    enabled: open,
  });

  useEffect(() => {
    if (!open) {
      setAccounts({});
      setConnections({});
      setConfirming(false);
    }
  }, [open]);

  const active = useMemo(
    () =>
      (status.data?.connections ?? [])
        .filter((c) => c.status !== "desconectado")
        .map((c) => ({ ...c, accounts: c.accounts.filter((a) => a.is_active) }))
        .filter((c) => c.accounts.length > 0 || c.status === "conectado"),
    [status.data],
  );

  const chosenAccounts = Object.entries(accounts)
    .filter(([, v]) => v)
    .map(([k]) => k);
  const chosenConnections = Object.entries(connections)
    .filter(([, v]) => v)
    .map(([k]) => k);
  const nothingChosen = chosenAccounts.length === 0 && chosenConnections.length === 0;

  const remove = useMutation({
    mutationFn: async () => {
      if (chosenAccounts.length) {
        await deactivate({ data: { accountIds: chosenAccounts, active: false } });
      }
      for (const id of chosenConnections) {
        await disconnect({ data: { connectionId: id } });
      }
    },
    onSuccess: async () => {
      toast.success("Remoção concluída. As demais contas continuam conectadas.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["meta-status"] }),
        queryClient.invalidateQueries({ queryKey: ["meta-ad-accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["ad-metrics-meta"] }),
      ]);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Desconectar</DialogTitle>
          <DialogDescription>
            Escolha o que deseja remover. Nada é removido até você confirmar aqui dentro.
          </DialogDescription>
        </DialogHeader>

        {status.isLoading ? (
          <p className="text-muted-foreground text-sm">Carregando…</p>
        ) : active.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhuma conta conectada.</p>
        ) : (
          <div className="space-y-3">
            {active.map((c) => (
              <div key={c.id} className="rounded-lg border p-3">
                <p className="text-sm font-medium">
                  Autorização de {c.meta_user_name ?? "conta Meta"}
                </p>
                <div className="mt-2 space-y-2">
                  {c.accounts.map((a) => (
                    <label key={a.id} className="flex items-start gap-3">
                      <Checkbox
                        checked={!!accounts[a.id] || !!connections[c.id]}
                        disabled={!!connections[c.id]}
                        onCheckedChange={(v) =>
                          setAccounts((prev) => ({ ...prev, [a.id]: Boolean(v) }))
                        }
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm">
                          {a.name ?? `Conta ${a.ad_account_id}`}
                        </span>
                        <span className="text-muted-foreground block truncate text-xs">
                          {a.ad_account_id}
                          {a.currency ? ` · ${a.currency}` : ""}
                        </span>
                      </span>
                    </label>
                  ))}
                  {c.accounts.length === 0 && (
                    <p className="text-muted-foreground text-xs">
                      Sem contas ativas nesta autorização.
                    </p>
                  )}
                </div>
                <label className="mt-3 flex items-center gap-3 border-t pt-3">
                  <Checkbox
                    checked={!!connections[c.id]}
                    onCheckedChange={(v) =>
                      setConnections((prev) => ({ ...prev, [c.id]: Boolean(v) }))
                    }
                  />
                  <span className="text-sm">
                    Remover a autorização inteira desta conta Meta (todas as contas dela)
                  </span>
                </label>
              </div>
            ))}
          </div>
        )}

        {confirming && !nothingChosen && (
          <Alert variant="destructive">
            <AlertDescription>
              Confirmar a remoção de {chosenAccounts.length} conta(s)
              {chosenConnections.length
                ? ` e ${chosenConnections.length} autorização(ões)`
                : ""}
              ? Os resultados já sincronizados continuam guardados e as demais contas seguem
              conectadas.
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          {confirming ? (
            <Button
              variant="destructive"
              onClick={() => remove.mutate()}
              disabled={nothingChosen || remove.isPending}
            >
              {remove.isPending && <Loader2 className="size-4 animate-spin" />}
              Confirmar remoção
            </Button>
          ) : (
            <Button
              variant="destructive"
              onClick={() => setConfirming(true)}
              disabled={nothingChosen}
            >
              Remover selecionadas
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
