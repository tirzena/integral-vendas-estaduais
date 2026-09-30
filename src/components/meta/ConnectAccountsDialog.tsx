import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  getMetaStatus,
  setAccountProducts,
  setAccountsActive,
  type MetaAccount,
} from "@/lib/meta.functions";
import { useProductScope } from "@/hooks/useProductScope";
import { Badge } from "@/components/ui/badge";
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
import { Input } from "@/components/ui/input";

/**
 * Escolha de novas contas de anúncios (após a autorização) e vínculo com categorias.
 * É aditivo: não desativa nem apaga as contas já conectadas.
 */
export function ConnectAccountsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { products } = useProductScope();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [links, setLinks] = useState<Record<string, string[]>>({});
  const [search, setSearch] = useState("");

  const activate = useServerFn(setAccountsActive);
  const linkProducts = useServerFn(setAccountProducts);

  const status = useQuery({
    queryKey: ["meta-status"],
    queryFn: () => getMetaStatus(),
    retry: false,
    enabled: open,
  });

  const available = useMemo(() => {
    const out: Array<MetaAccount & { connectionName: string | null }> = [];
    for (const c of status.data?.connections ?? []) {
      if (c.status === "desconectado") continue;
      for (const a of c.accounts) {
        if (a.is_active) continue;
        out.push({ ...a, connectionName: c.meta_user_name });
      }
    }
    const term = search.trim().toLowerCase();
    return term
      ? out.filter((a) =>
          `${a.name ?? ""} ${a.ad_account_id} ${a.business_name ?? ""}`
            .toLowerCase()
            .includes(term),
        )
      : out;
  }, [status.data, search]);

  useEffect(() => {
    if (!open) {
      setSelected({});
      setLinks({});
      setSearch("");
    }
  }, [open]);

  const chosen = Object.entries(selected)
    .filter(([, v]) => v)
    .map(([k]) => k);

  const save = useMutation({
    mutationFn: async () => {
      await activate({ data: { accountIds: chosen, active: true } });
      for (const id of chosen) {
        await linkProducts({ data: { accountId: id, productIds: links[id] ?? [] } });
      }
    },
    onSuccess: async () => {
      toast.success(
        chosen.length > 1 ? "Contas conectadas e vinculadas." : "Conta conectada e vinculada.",
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["meta-status"] }),
        queryClient.invalidateQueries({ queryKey: ["meta-ad-accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["ad-metrics-meta"] }),
      ]);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleLink = (accountId: string, productId: string) =>
    setLinks((prev) => {
      const current = prev[accountId] ?? [];
      return {
        ...prev,
        [accountId]: current.includes(productId)
          ? current.filter((p) => p !== productId)
          : [...current, productId],
      };
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Escolher contas de anúncios</DialogTitle>
          <DialogDescription>
            Selecione uma ou mais contas para adicionar e escolha as categorias de cada uma. As
            contas já conectadas continuam como estão.
          </DialogDescription>
        </DialogHeader>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar conta pelo nome ou número"
        />

        {status.isLoading ? (
          <p className="text-muted-foreground text-sm">Carregando contas…</p>
        ) : available.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nenhuma conta nova disponível nesta autorização. Use “Conectar” para autorizar outra
            conta da Meta.
          </p>
        ) : (
          <div className="space-y-2">
            {available.map((a) => (
              <div key={a.id} className="rounded-lg border p-3">
                <label className="flex items-start gap-3">
                  <Checkbox
                    checked={!!selected[a.id]}
                    onCheckedChange={(v) =>
                      setSelected((prev) => ({ ...prev, [a.id]: Boolean(v) }))
                    }
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {a.name ?? `Conta ${a.ad_account_id}`}
                    </span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {a.ad_account_id}
                      {a.business_name ? ` · ${a.business_name}` : ""}
                      {a.currency ? ` · ${a.currency}` : ""}
                    </span>
                  </span>
                </label>
                {selected[a.id] && (
                  <div className="mt-3 flex flex-wrap gap-2 pl-7">
                    {products.length === 0 && (
                      <span className="text-muted-foreground text-xs">
                        Nenhuma categoria cadastrada.
                      </span>
                    )}
                    {products.map((p) => {
                      const on = (links[a.id] ?? []).includes(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => toggleLink(a.id, p.id)}
                          aria-pressed={on}
                        >
                          <Badge variant={on ? "default" : "outline"}>{p.name}</Badge>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={chosen.length === 0 || save.isPending}
          >
            {save.isPending && <Loader2 className="size-4 animate-spin" />}
            Conectar {chosen.length > 0 ? `(${chosen.length})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
