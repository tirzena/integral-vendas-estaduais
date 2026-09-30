/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Plus, QrCode, RefreshCw, Trash2, Unplug } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useAuth";
import { useProductScope } from "@/hooks/useProductScope";
import { formatDateTime } from "@/lib/format";
import { CONNECTION_LABEL, maskPhone, type ConnectionStatus } from "@/lib/whatsapp";
import {
  checkWhatsappAccount,
  createWhatsappAccount,
  disconnectWhatsappAccount,
  getWhatsappIntegrationStatus,
  getWhatsappQrCode,
  removeWhatsappAccount,
  syncWhatsappConversations,
} from "@/lib/whatsapp.functions";
import { EmptyState } from "@/components/common/PageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/atendimentos/contas")({
  component: WhatsappAccounts,
});

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  conectado: "default",
  conectando: "secondary",
  aguardando_qr: "secondary",
  desconectado: "outline",
  erro: "destructive",
};

function WhatsappAccounts() {
  const { isAdmin, roles, loading } = useCurrentUser();
  const canManage = isAdmin || roles.includes("gestor");
  const { products } = useProductScope();
  const queryClient = useQueryClient();

  const status = useServerFn(getWhatsappIntegrationStatus);
  const create = useServerFn(createWhatsappAccount);
  const qrCode = useServerFn(getWhatsappQrCode);
  const check = useServerFn(checkWhatsappAccount);
  const disconnect = useServerFn(disconnectWhatsappAccount);
  const remove = useServerFn(removeWhatsappAccount);
  const sync = useServerFn(syncWhatsappConversations);

  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState("");
  const [productIds, setProductIds] = useState<string[]>([]);
  const [qrAccount, setQrAccount] = useState<{ id: string; qr: string | null } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "disconnect" | "remove"; id: string; name: string } | null>(null);

  const { data: integration } = useQuery({
    queryKey: ["wa-integration"],
    queryFn: () => status(),
    enabled: canManage,
  });

  const { data: accounts, isLoading } = useQuery({
    queryKey: ["wa-accounts"],
    enabled: canManage,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_accounts")
        .select("*, products(name)")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // enquanto o QR está aberto, acompanhamos o estado real da conta
  useQuery({
    queryKey: ["wa-qr-poll", qrAccount?.id],
    enabled: !!qrAccount?.id,
    refetchInterval: 5000,
    queryFn: async () => {
      const res = await check({ data: { accountId: qrAccount!.id, fixWebhook: false } });
      if (res.status === "conectado") {
        toast.success("WhatsApp conectado.");
        setQrAccount(null);
        queryClient.invalidateQueries({ queryKey: ["wa-accounts"] });
      } else {
        const fresh = await qrCode({ data: { accountId: qrAccount!.id } });
        if (fresh.qrBase64) setQrAccount((cur) => (cur ? { ...cur, qr: fresh.qrBase64 } : cur));
      }
      return res.status;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => create({ data: { displayName: name.trim(), productIds } }),
    onSuccess: (res: any) => {
      setNewOpen(false);
      setName("");
      setProductIds([]);
      setQrAccount({ id: res.accountId, qr: res.qrBase64 ?? null });
      queryClient.invalidateQueries({ queryKey: ["wa-accounts"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível criar a conta."),
  });

  const action = useMutation({
    mutationFn: async (input: { kind: string; id: string }) => {
      if (input.kind === "check") return check({ data: { accountId: input.id } });
      if (input.kind === "disconnect") return disconnect({ data: { accountId: input.id } });
      if (input.kind === "remove") return remove({ data: { accountId: input.id } });
      if (input.kind === "sync") return sync({ data: { accountId: input.id } });
      return qrCode({ data: { accountId: input.id } });
    },
    onSuccess: (res: any, input) => {
      queryClient.invalidateQueries({ queryKey: ["wa-accounts"] });
      setConfirm(null);
      if (input.kind === "qr") {
        if (res.connected) toast.success("Esta conta já está conectada.");
        else setQrAccount({ id: input.id, qr: res.qrBase64 ?? null });
      }
      if (input.kind === "check") toast.success("Conexão verificada.");
      if (input.kind === "sync") {
        if (res.historyRequested) {
          toast.success("A Evolution começou a baixar o histórico do WhatsApp. A importação continuará em instantes.");
        } else {
          toast.success(
            `${res.conversations ?? 0} conversa(s) sincronizada(s) a partir de ${res.providerMessages ?? res.scanned ?? 0} mensagem(ns) encontrada(s).`,
          );
        }
        queryClient.invalidateQueries({ queryKey: ["wa-conversations"] });
      }
      if (input.kind === "disconnect") toast.success("Conta desconectada.");
      if (input.kind === "remove") toast.success("Instância removida. O histórico foi preservado.");
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível concluir a ação."),
  });

  if (loading) return null;
  if (!canManage) {
    return (
      <EmptyState
        title="Área restrita"
        description="Somente administradores e gestores autorizados podem ver as contas de WhatsApp."
      />
    );
  }

  const list = accounts ?? [];

  return (
    <div className="space-y-4">
      {integration && !integration.configured && (
        <Alert>
          <AlertTriangle className="size-4" />
          <AlertTitle>Configuração pendente</AlertTitle>
          <AlertDescription>
            A conexão com o servidor de WhatsApp ainda não foi liberada. Assim que as credenciais
            forem cadastradas, será possível conectar contas. Nada é simulado enquanto isso.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Contas WhatsApp</h2>
          <p className="text-sm text-muted-foreground">
            Cada conexão cria uma conta nova. As contas já conectadas continuam ativas.
          </p>
        </div>
        <Button onClick={() => setNewOpen(true)} disabled={!integration?.configured}>
          <Plus className="mr-2 size-4" /> Conectar WhatsApp
        </Button>
      </div>

      {isLoading ? (
        <div className="surface-card p-8 text-center text-sm text-muted-foreground">Carregando…</div>
      ) : list.length === 0 ? (
        <EmptyState
          title="Nenhuma conta conectada"
          description="Use o botão Conectar WhatsApp para ler o QR Code e ativar a primeira conta."
        />
      ) : (
        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Nome interno</th>
                <th className="p-3">Número</th>
                <th className="p-3">Categoria</th>
                <th className="p-3">Instância</th>
                <th className="p-3">Situação</th>
                <th className="p-3">Atualizado</th>
                <th className="p-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {list.map((a: any) => (
                <tr key={a.id} className="border-t">
                  <td className="p-3 font-medium">{a.display_name ?? "Conta WhatsApp"}</td>
                  <td className="p-3">{maskPhone(a.phone_e164 ?? a.display_phone_number)}</td>
                  <td className="p-3">{(a.product_ids?.length ? a.product_ids : a.product_id ? [a.product_id] : [])
                    .map((id: string) => products.find((product) => product.id === id)?.name)
                    .filter(Boolean).join(", ") || "Sem categoria"}</td>
                  <td className="p-3 text-xs text-muted-foreground">{a.instance_name ?? "—"}</td>
                  <td className="p-3">
                    <Badge variant={STATUS_VARIANT[a.connection_status] ?? "outline"}>
                      {CONNECTION_LABEL[a.connection_status as ConnectionStatus] ?? "Sem informação"}
                    </Badge>
                    {a.last_error && (
                      <p className="mt-1 text-xs text-destructive">{a.last_error}</p>
                    )}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {a.last_seen_at ? formatDateTime(a.last_seen_at) : "Sem informação"}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => action.mutate({ kind: "check", id: a.id })}
                      >
                        <RefreshCw className="mr-1 size-3.5" /> Verificar
                      </Button>
                      {a.connection_status === "conectado" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={action.isPending}
                          onClick={() => action.mutate({ kind: "sync", id: a.id })}
                        >
                          <RefreshCw className="mr-1 size-3.5" /> Sincronizar conversas
                        </Button>
                      )}
                      {a.connection_status !== "conectado" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => action.mutate({ kind: "qr", id: a.id })}
                        >
                          <QrCode className="mr-1 size-3.5" /> QR Code
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setConfirm({ kind: "disconnect", id: a.id, name: a.display_name })
                        }
                      >
                        <Unplug className="mr-1 size-3.5" /> Desconectar
                      </Button>
                      {isAdmin && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setConfirm({ kind: "remove", id: a.id, name: a.display_name })}
                        >
                          <Trash2 className="mr-1 size-3.5" /> Remover
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conectar um novo WhatsApp</DialogTitle>
            <DialogDescription>
              Uma conta nova é criada; as que já existem continuam funcionando.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="wa-name">Nome interno</Label>
              <Input
                id="wa-name"
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Comercial 1"
              />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Categorias</legend>
              <label className="flex items-center gap-2 rounded-md border p-2 text-sm">
                <input type="checkbox" checked={products.length > 0 && productIds.length === products.length}
                  onChange={(event) => setProductIds(event.target.checked ? products.map((product) => product.id) : [])} />
                Todas as categorias
              </label>
              <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border p-2">
                {products.map((product) => (
                  <label key={product.id} className="flex items-center gap-2 rounded p-1 text-sm">
                    <input type="checkbox" checked={productIds.includes(product.id)}
                      onChange={(event) => setProductIds((current) =>
                        event.target.checked ? [...current, product.id] : current.filter((id) => id !== product.id))} />
                    {product.name}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {productIds.length} de {products.length} categoria(s) selecionada(s).
              </p>
            </fieldset>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || name.trim().length < 2 || productIds.length === 0}
            >
              {createMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Gerar QR Code
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!qrAccount} onOpenChange={(o) => !o && setQrAccount(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leia o QR Code no celular</DialogTitle>
            <DialogDescription>
              WhatsApp › Aparelhos conectados › Conectar aparelho. A tela avisa assim que conectar.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center p-2">
            {qrAccount?.qr ? (
              <img src={qrAccount.qr} alt="QR Code para conectar o WhatsApp" className="size-64" />
            ) : (
              <p className="text-sm text-muted-foreground">Gerando o QR Code…</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQrAccount(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirm?.kind === "remove" ? "Remover instância" : "Desconectar conta"}
            </DialogTitle>
            <DialogDescription>
              {confirm?.kind === "remove"
                ? `A instância de “${confirm?.name}” será apagada no servidor e a conta sai da lista. O histórico de conversas é preservado.`
                : `Somente a conta “${confirm?.name}” será desconectada. As demais continuam ativas.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Cancelar
            </Button>
            <Button
              variant={confirm?.kind === "remove" ? "destructive" : "default"}
              onClick={() => confirm && action.mutate({ kind: confirm.kind, id: confirm.id })}
              disabled={action.isPending}
            >
              {action.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
