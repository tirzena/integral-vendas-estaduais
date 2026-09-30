import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Link2,
  Loader2,
  PlugZap,
  RefreshCw,
  Unplug,
} from "lucide-react";
import {
  disconnectMeta,
  getMetaStatus,
  setAccountProducts,
  setAccountsActive,
  startMetaOAuth,
  syncMetaNow,
  verifyMetaConnection,
  type MetaAccount,
  type MetaConnection,
} from "@/lib/meta.functions";
import { useProductScope } from "@/hooks/useProductScope";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/format";

type StatusKey =
  | "nao_configurado"
  | "aguardando"
  | "conectado"
  | "expirando"
  | "expirado"
  | "erro"
  | "desconectado";

const STATUS_LABEL: Record<StatusKey, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  nao_configurado: { label: "Não configurado", variant: "outline" },
  aguardando: { label: "Aguardando autorização", variant: "secondary" },
  conectado: { label: "Conectado", variant: "default" },
  expirando: { label: "Expirando em breve", variant: "secondary" },
  expirado: { label: "Expirado", variant: "destructive" },
  erro: { label: "Erro", variant: "destructive" },
  desconectado: { label: "Desconectado", variant: "outline" },
};

function connectionStatus(c: MetaConnection): StatusKey {
  if (c.status === "desconectado") return "desconectado";
  if (c.status === "expirado") return "expirado";
  if (c.status === "erro") return "erro";
  if (c.token_expires_at) {
    const ms = new Date(c.token_expires_at).getTime() - Date.now();
    if (ms <= 0) return "expirado";
    if (ms < 7 * 86400000) return "expirando";
  }
  return "conectado";
}

export function MetaIntegrationPanel({ view = "all" }: { view?: "select" | "manage" | "all" }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { products } = useProductScope();
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const status = useQuery({
    queryKey: ["meta-status"],
    queryFn: () => getMetaStatus(),
    retry: false,
  });

  const start = useServerFn(startMetaOAuth);
  const activate = useServerFn(setAccountsActive);
  const linkProducts = useServerFn(setAccountProducts);
  const sync = useServerFn(syncMetaNow);
  const verify = useServerFn(verifyMetaConnection);
  const disconnect = useServerFn(disconnectMeta);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["meta-status"] });

  const connectMutation = useMutation({
    mutationFn: async () => start({ data: { returnPath: "/trafego-pago" } }),
    onSuccess: (r) => {
      window.location.href = r.url;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const activateMutation = useMutation({
    mutationFn: async (vars: { accountIds: string[]; active: boolean }) =>
      activate({ data: vars }),
    onSuccess: () => {
      toast.success("Contas atualizadas.");
      setSelected({});
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const productsMutation = useMutation({
    mutationFn: async (vars: { accountId: string; productIds: string[] }) =>
      linkProducts({ data: vars }),
    onSuccess: () => {
      toast.success("Categorias vinculadas.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const syncMutation = useMutation({
    mutationFn: async (connectionId?: string) =>
      sync({ data: { ...(connectionId ? { connectionId } : {}), days: 30 } }),
    onSuccess: (r) => {
      if (r.errors.length) toast.warning(`Sincronizado com avisos: ${r.errors[0]}`);
      else toast.success(`Sincronização concluída: ${r.rows} dias de resultados.`);
      refresh();
      router.invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const verifyMutation = useMutation({
    mutationFn: async (connectionId: string) => verify({ data: { connectionId } }),
    onSuccess: (r) => {
      if (r.status === "conectado") toast.success("Conexão válida.");
      else toast.error("A autorização expirou. Conecte novamente.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disconnectMutation = useMutation({
    mutationFn: async (connectionId: string) => disconnect({ data: { connectionId } }),
    onSuccess: () => {
      toast.success("Conexão desligada. Os resultados já baixados continuam guardados.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const data = status.data;
  const pendingAccounts = useMemo(
    () => (data?.connections ?? []).flatMap((c) => c.accounts.filter((a) => !a.is_active)),
    [data],
  );

  if (status.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (status.error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="size-4" />
        <AlertTitle>Sem permissão</AlertTitle>
        <AlertDescription>
          Apenas administradores podem ver e gerenciar a conexão com a Meta.
        </AlertDescription>
      </Alert>
    );
  }

  const configured = data?.configured ?? false;

  const showManage = view === "all" || view === "manage";
  const showSelect = view === "all" || view === "select";

  return (
    <div className="space-y-4">
      {showManage && (
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              Conexão com a Meta (anúncios)
              {!configured && <Badge variant="outline">{STATUS_LABEL.nao_configurado.label}</Badge>}
            </CardTitle>
            <p className="text-muted-foreground mt-1 text-sm">
              Autorize com a conta que administra as contas de anúncios. Você pode repetir a
              autorização com outro login ou outra conta empresarial (BM) sem perder as anteriores.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => connectMutation.mutate()}
              disabled={!configured || connectMutation.isPending}
            >
              {connectMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <PlugZap className="size-4" />
              )}
              Conectar Meta
            </Button>
            <Button
              variant="outline"
              onClick={() => syncMutation.mutate(undefined)}
              disabled={!configured || syncMutation.isPending}
            >
              {syncMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Sincronizar agora
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="bg-muted/40 flex flex-wrap items-center gap-2 rounded-md border p-3">
            <span className="text-muted-foreground">Endereço de retorno (callback):</span>
            <code className="text-xs break-all">{data?.callbackUrl}</code>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                navigator.clipboard.writeText(data?.callbackUrl ?? "");
                toast.success("Endereço copiado.");
              }}
            >
              <Copy className="size-3.5" /> Copiar
            </Button>
          </div>

          <div className="bg-muted/40 rounded-md border p-3">
            <p className="font-medium">Atualização diária: endpoint pronto; agendamento pendente</p>
            <p className="text-muted-foreground text-xs">
              O endereço que busca os resultados todos os dias já existe e é protegido por um código
              secreto guardado no servidor, mas ainda não há um agendamento automático ligado. Por
              enquanto use o botão “Sincronizar agora”. Para ligar a rotina diária é preciso
              configurar o agendador externo com esse código secreto — ele nunca aparece aqui.
            </p>
          </div>

          <p className="text-muted-foreground">
            Permissões solicitadas: <strong>{data?.scopes.join(", ")}</strong>. A permissão de
            leitura de formulários de leads fica para uma etapa futura e não é pedida agora.
          </p>
          {!configured && (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <AlertTitle>Falta configurar o servidor</AlertTitle>
              <AlertDescription>
                Ainda faltam estes dados protegidos: {data?.missingSecrets.join(", ")}. Eles são
                guardados apenas no servidor e nunca aparecem nesta tela.
              </AlertDescription>
            </Alert>
          )}
          <Alert>
            <AlertTriangle className="size-4" />
            <AlertTitle>Modo Desenvolvimento na Meta</AlertTitle>
            <AlertDescription>
              Enquanto o aplicativo estiver em modo Desenvolvimento, só quem tem função no
              aplicativo consegue autorizar. Para liberar outras pessoas e contas é preciso pedir o
              acesso avançado (Advanced Access) de ads_read e business_management na revisão da
              Meta.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
      )}

      {showSelect && pendingAccounts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Contas encontradas — escolha quais conectar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingAccounts.map((a) => (
              <label
                key={a.id}
                className="hover:bg-muted/40 flex cursor-pointer items-center gap-3 rounded-md border p-3"
              >
                <Checkbox
                  checked={!!selected[a.id]}
                  onCheckedChange={(v) => setSelected((s) => ({ ...s, [a.id]: Boolean(v) }))}
                />
                <div className="min-w-0">
                  <p className="truncate font-medium">{a.name ?? `Conta ${a.ad_account_id}`}</p>
                  <p className="text-muted-foreground text-xs">
                    {a.business_name ?? "Sem conta empresarial"} · act_{a.ad_account_id} ·{" "}
                    {a.currency ?? "moeda não informada"} · {a.timezone_name ?? "fuso não informado"}
                  </p>
                </div>
              </label>
            ))}
            <Button
              onClick={() =>
                activateMutation.mutate({
                  accountIds: Object.keys(selected).filter((k) => selected[k]),
                  active: true,
                })
              }
              disabled={
                activateMutation.isPending || !Object.values(selected).some(Boolean)
              }
            >
              Conectar contas selecionadas
            </Button>
          </CardContent>
        </Card>
      )}

      {showManage && (data?.connections ?? []).map((c) => {
        const key = connectionStatus(c);
        const info = STATUS_LABEL[key];
        return (
          <Card key={c.id}>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  {c.meta_user_name ?? "Autorização Meta"}
                  <Badge variant={info.variant}>{info.label}</Badge>
                </CardTitle>
                <p className="text-muted-foreground text-xs">
                  Autorizado em {formatDateTime(c.created_at)}
                  {c.token_expires_at ? ` · válido até ${formatDateTime(c.token_expires_at)}` : ""}
                  {c.last_error ? ` · último erro: ${c.last_error}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => verifyMutation.mutate(c.id)}>
                  <CheckCircle2 className="size-4" /> Verificar
                </Button>
                <Button size="sm" variant="outline" onClick={() => connectMutation.mutate()}>
                  <Link2 className="size-4" /> Reconectar
                </Button>
                <Button size="sm" variant="outline" onClick={() => syncMutation.mutate(c.id)}>
                  <RefreshCw className="size-4" /> Sincronizar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => disconnectMutation.mutate(c.id)}
                  disabled={c.status === "desconectado"}
                >
                  <Unplug className="size-4" /> Desconectar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {c.accounts.filter((a) => a.is_active).length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Nenhuma conta de anúncios conectada nesta autorização.
                </p>
              ) : (
                c.accounts
                  .filter((a) => a.is_active)
                  .map((a) => (
                    <AccountRow
                      key={a.id}
                      account={a}
                      products={products}
                      onSaveProducts={(productIds) =>
                        productsMutation.mutate({ accountId: a.id, productIds })
                      }
                      onDeactivate={() =>
                        activateMutation.mutate({ accountIds: [a.id], active: false })
                      }
                    />
                  ))
              )}
            </CardContent>
          </Card>
        );
      })}

      {showManage && (data?.logs ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Últimas sincronizações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {data!.logs.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center gap-2">
                <Badge variant={l.status === "ok" ? "secondary" : "destructive"}>{l.status}</Badge>
                <span className="text-muted-foreground text-xs">
                  {l.finished_at ? formatDateTime(l.finished_at) : "em andamento"} ·{" "}
                  {l.rows_upserted} dias {l.message ? `· ${l.message}` : ""}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AccountRow({
  account,
  products,
  onSaveProducts,
  onDeactivate,
}: {
  account: MetaAccount;
  products: Array<{ id: string; name: string }>;
  onSaveProducts: (productIds: string[]) => void;
  onDeactivate: () => void;
}) {
  const [ids, setIds] = useState<string[]>(account.product_ids);
  const dirty =
    ids.length !== account.product_ids.length ||
    ids.some((id) => !account.product_ids.includes(id));

  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{account.name ?? `Conta ${account.ad_account_id}`}</p>
          <p className="text-muted-foreground text-xs">
            {account.business_name ?? "Sem conta empresarial"} · act_{account.ad_account_id} ·{" "}
            {account.currency ?? "—"} · {account.timezone_name ?? "—"}
          </p>
          <p className="text-muted-foreground text-xs">
            Última sincronização:{" "}
            {account.last_synced_at ? formatDateTime(account.last_synced_at) : "nunca"}
            {account.last_sync_status === "erro" && account.last_sync_message
              ? ` · ${account.last_sync_message}`
              : ""}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onDeactivate}>
          Remover
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {products.map((p) => (
          <label key={p.id} className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={ids.includes(p.id)}
              onCheckedChange={(v) =>
                setIds((cur) => (v ? [...cur, p.id] : cur.filter((x) => x !== p.id)))
              }
            />
            {p.name}
          </label>
        ))}
        {products.length === 0 && (
          <span className="text-muted-foreground text-sm">Nenhuma categoria cadastrada.</span>
        )}
        <Button size="sm" disabled={!dirty} onClick={() => onSaveProducts(ids)}>
          Salvar categorias
        </Button>
      </div>
    </div>
  );
}
