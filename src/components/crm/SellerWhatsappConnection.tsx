import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useProductScope } from "@/hooks/useProductScope";
import {
  connectSellerWhatsapp,
  mySellerWhatsapp,
  refreshSellerWhatsapp,
  updateSellerWhatsappProducts,
} from "@/lib/seller-whatsapp.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export function SellerWhatsappConnection() {
  const { products } = useProductScope();
  const qc = useQueryClient();
  const get = useServerFn(mySellerWhatsapp);
  const create = useServerFn(connectSellerWhatsapp);
  const refresh = useServerFn(refreshSellerWhatsapp);
  const updateProducts = useServerFn(updateSellerWhatsappProducts);

  const [accountChoice, setAccountChoice] = useState<string | null>(null);
  const [productIds, setProductIds] = useState<string[]>([]);
  const [audience, setAudience] = useState<"atacado" | "varejo">("atacado");
  const [qr, setQr] = useState<string | null>(null);
  const [consented, setConsented] = useState(false);
  const [connectionProblem, setConnectionProblem] = useState<string | null>(null);

  const own = useQuery({
    queryKey: ["seller-whatsapp-own"],
    queryFn: () => get(),
    refetchOnWindowFocus: true,
  });
  const accounts = own.data ?? [];
  const selectedAccount = accounts.find(account => account.id === accountChoice) ?? null;
  const activeProducts = useMemo(() => products.filter(p => p.is_active), [products]);
  const availableIds = useMemo(() => activeProducts.map(p => p.id), [activeProducts]);
  const allSelected = availableIds.length > 0 && availableIds.every(id => productIds.includes(id));
  const savedIds: string[] = selectedAccount?.product_ids ?? [];
  const changed = productIds.length !== savedIds.length ||
    productIds.some(id => !savedIds.includes(id));

  // Choose the first connected number on load. "Adicionar outro número" is never
  // replaced by a background refetch, and each number keeps its own macroareas.
  useEffect(() => {
    if (accountChoice === null && !own.isPending) setAccountChoice(accounts[0]?.id ?? "new");
  }, [accountChoice, own.isPending, accounts]);
  useEffect(() => {
    setProductIds(selectedAccount?.product_ids ?? []);
    setQr(null);
    setConnectionProblem(null);
  }, [accountChoice, selectedAccount?.id]);
  useEffect(() => {
    setProductIds(current => current.filter(id => availableIds.includes(id)));
  }, [availableIds]);

  const toggle = (id: string, enabled: boolean) =>
    setProductIds(current => enabled
      ? [...new Set([...current, id])]
      : current.filter(productId => productId !== id));

  const connection = useMutation({
    mutationFn: () => create({ data: { productIds, audience } }),
    onSuccess: async result => {
      await qc.invalidateQueries({ queryKey: ["seller-whatsapp-own"] });
      setAccountChoice(result.accountId);
      setQr(result.qrBase64);
      setConnectionProblem(result.connectionError ?? null);
      if (result.connectionError) toast.warning("Número cadastrado, mas o QR Code ainda não está disponível.");
      else toast.success("Número cadastrado. Faça a leitura do QR Code para conectar.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const edit = useMutation({
    mutationFn: () => updateProducts({ data: { accountId: selectedAccount!.id, productIds } }),
    onSuccess: async () => {
      toast.success("Macroáreas salvas para este número.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["seller-whatsapp-own"] }),
        qc.invalidateQueries({ queryKey: ["wa-accounts-inbox"] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const check = useMutation({
    mutationFn: () => refresh({ data: { accountId: selectedAccount!.id } }),
    onSuccess: async result => {
      setQr(result.qrBase64);
      setConnectionProblem(null);
      await qc.invalidateQueries({ queryKey: ["seller-whatsapp-own"] });
      if (result.connected) toast.success("WhatsApp conectado.");
      else if (result.qrBase64) toast.success("QR Code disponível para leitura.");
      else toast.info("Aguardando QR Code do servidor de WhatsApp.");
    },
    onError: (error: Error) => {
      setConnectionProblem(error.message);
      toast.error(error.message);
    },
  });

  const switchAccount = (id: string) => {
    setAccountChoice(id);
    setQr(null);
    setConnectionProblem(null);
    setConsented(false);
    if (id === "new") setProductIds([]);
  };

  return (
    <Card className="mb-5">
      <CardHeader>
        <CardTitle>Meus WhatsApps de atendimento</CardTitle>
        <p className="text-sm text-muted-foreground">
          Vincule seus números comerciais. Escolha, para cada número, uma, várias ou todas
          as macroáreas autorizadas. Somente seus atendimentos ficam visíveis para você;
          administradores podem supervisionar os números conectados.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {own.isError && <p role="alert" className="text-sm text-destructive">
          Não foi possível carregar seus WhatsApps.
          <Button size="sm" variant="outline" onClick={() => void own.refetch()}>Recarregar</Button>
        </p>}
        {!own.isPending && <div className="space-y-1">
          <p className="text-sm font-medium">Número de atendimento</p>
          <Select value={accountChoice ?? ""} onValueChange={switchAccount}>
            <SelectTrigger className="w-full max-w-md"><SelectValue placeholder="Escolha o número" /></SelectTrigger>
            <SelectContent>
              {accounts.map((account, index) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.phone_e164 || `WhatsApp ${index + 1}`} · {account.connection_status}
                </SelectItem>
              ))}
              {accounts.length < 5 && <SelectItem value="new">+ Vincular outro WhatsApp</SelectItem>}
            </SelectContent>
          </Select>
        </div>}
        {selectedAccount && <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm">
            Situação: <strong>{selectedAccount.connection_status}</strong> ·
            {" "}{savedIds.length} macroárea(s) cadastrada(s)
          </span>
          <Button size="sm" variant="outline" onClick={() => check.mutate()} disabled={check.isPending}>
            {check.isPending ? "Consultando QR Code..." : "Verificar / obter QR Code"}
          </Button>
        </div>}
        {(accountChoice === "new" || selectedAccount) && <div className="space-y-3">
          <div className="max-w-lg space-y-2">
            <p className="text-sm font-medium">Macroáreas deste número</p>
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-md bg-muted/40 p-2 text-sm font-medium">
                <input type="checkbox" checked={allSelected}
                  onChange={event => setProductIds(event.target.checked ? availableIds : [])} />
                Todas as macroáreas autorizadas
              </label>
              {activeProducts.map(product => (
                <label key={product.id} className="flex cursor-pointer items-center gap-2 rounded-md p-2 text-sm hover:bg-muted/50">
                  <input type="checkbox" checked={productIds.includes(product.id)}
                    onChange={event => toggle(product.id, event.target.checked)} />
                  {product.name}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {productIds.length} de {availableIds.length} macroáreas selecionadas.
            </p>
          </div>
          {selectedAccount ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => edit.mutate()} disabled={!productIds.length || !changed || edit.isPending}>
                {edit.isPending ? "Salvando..." : "Salvar macroáreas deste número"}
              </Button>
              {!changed && <span className="text-sm text-muted-foreground">
                Macroáreas já salvas. {selectedAccount.connection_status !== "conectado" &&
                  "Falta concluir a conexão do WhatsApp."}
              </span>}
            </div>
          ) : <>
            <div className="flex flex-wrap items-center gap-3">
              <Select value={audience} onValueChange={v => setAudience(v as "atacado" | "varejo")}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="atacado">Atacado</SelectItem>
                  <SelectItem value="varejo">Varejo</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={() => connection.mutate()}
                disabled={!productIds.length || !consented || connection.isPending}>
                {connection.isPending ? "Cadastrando..." : "Vincular este WhatsApp"}
              </Button>
            </div>
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <input type="checkbox" className="mt-1" checked={consented}
                onChange={event => setConsented(event.target.checked)} />
              Entendo que o histórico deste número comercial pode ser sincronizado com o CRM
              e supervisionado por administradores. Não vincularei um número pessoal privado.
            </label>
          </>}
        </div>}
        {connectionProblem && <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">
          O número está cadastrado, mas a conexão não foi concluída: {connectionProblem}.
          Use "Verificar / obter QR Code" para retomar sem cadastrar outro número.
        </p>}
        {qr && <div className="max-w-xs rounded-lg border p-3">
          <p className="mb-2 text-sm font-medium">WhatsApp → Aparelhos conectados → Conectar aparelho</p>
          <img alt="QR Code para vincular o WhatsApp de atendimento"
            className="h-auto w-full" src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`} />
        </div>}
      </CardContent>
    </Card>
  );
}
