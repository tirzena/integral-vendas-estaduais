import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney } from "@/lib/format";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
type Item = {
  id: string;
  name: string;
  price: number;
  price_currency?: "BRL" | "USD" | "PYG";
  currency?: "BRL" | "USD" | "PYG";
  quantity: number;
};
export function MemberCatalogCreator({
  layout,
  items,
  onClose,
  onCreated,
}: {
  layout: "cards" | "lista";
  items: Item[];
  onClose: () => void;
  onCreated?: () => void;
}) {
  const qc = useQueryClient();
  const [requestId] = useState(() => crypto.randomUUID());
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [currency, setCurrency] = useState("BRL");
  const [shared, setShared] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const filtered = items.filter((i) =>
    i.name.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR")),
  );
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (!selected.length) return void toast.error("Selecione pelo menos um produto.");
    setSaving(true);
    try {
      const { error } = await (
        supabase.rpc as unknown as (
          name: string,
          args: Record<string, unknown>,
        ) => Promise<{ error: Error | null }>
      )("integral_member_create_catalog", {
        p_request_id: requestId,
        p_title: title.trim(),
        p_layout: layout,
        p_item_ids: selected,
        p_currency: currency,
        p_description: description.trim() || null,
        p_whatsapp: whatsapp.trim() || null,
        p_publish: true,
        p_shared: shared,
      });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["sales-catalog-readonly"] });
      toast.success(
        layout === "lista"
          ? "Tabela de vendas criada. Os links estão no cartão."
          : "Catálogo online criado. Os links estão no cartão.",
      );
      onCreated?.();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {layout === "lista" ? "Nova tabela de vendas" : "Novo catálogo online"}
          </DialogTitle>
          <DialogDescription>
            Monte seu material com os produtos liberados. Os preços de venda são os definidos pela
            direção.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save}>
          <fieldset disabled={saving} className="space-y-4">
            <div>
              <Label htmlFor="member-catalog-title">Título *</Label>
              <Input
                id="member-catalog-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                minLength={2}
                maxLength={120}
                required
                placeholder={
                  layout === "lista" ? "Minha tabela de vendas" : "Meu catálogo de produtos"
                }
              />
            </div>
            <div>
              <Label htmlFor="member-catalog-description">Descrição</Label>
              <Input
                id="member-catalog-description"
                value={description}
                maxLength={2000}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="member-catalog-currency">Moeda de apresentação</Label>
                <select
                  id="member-catalog-currency"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  <option value="BRL">Real (BRL)</option>
                  <option value="USD">Dólar (USD)</option>
                  <option value="PYG">Guarani (PYG)</option>
                </select>
              </div>
              <div>
                <Label htmlFor="member-catalog-whatsapp">WhatsApp de contato</Label>
                <Input
                  id="member-catalog-whatsapp"
                  value={whatsapp}
                  maxLength={30}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="Código do país + DDD + número"
                />
              </div>
            </div>
            <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
              As imagens e os preços vêm do cadastro dos produtos. Valores em outra moeda são
              convertidos para a moeda de apresentação; um preço em reais continua igual quando
              apresentado em reais. Este material não altera produtos ou estoque.
            </p>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label>Produtos ({selected.length} selecionados)</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelected(items.slice(0, 500).map((i) => i.id))}
                  >
                    Selecionar todos
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setSelected([])}>
                    Limpar
                  </Button>
                </div>
              </div>
              <Input
                aria-label="Buscar produto para o material"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar produto…"
              />
              <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-2">
                {filtered.map((item) => (
                  <label
                    key={item.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-muted"
                  >
                    <Checkbox
                      checked={selected.includes(item.id)}
                      onCheckedChange={(checked) =>
                        setSelected((prev) =>
                          checked
                            ? [...new Set([...prev, item.id])]
                            : prev.filter((id) => id !== item.id),
                        )
                      }
                    />
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="block font-medium">{item.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {Number(item.price) > 0
                          ? formatMoney(
                              Number(item.price),
                              item.price_currency ?? item.currency ?? "USD",
                            )
                          : "Sob consulta"}{" "}
                        · {item.quantity} disponíveis
                      </span>
                    </span>
                  </label>
                ))}
                {!filtered.length && (
                  <p className="p-3 text-sm text-muted-foreground">Nenhum produto encontrado.</p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Selecione de 1 a 500 produtos.</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Ao criar, o material fica publicado para compartilhar por link. Os pedidos continuam
              sujeitos à aprovação.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={shared} onCheckedChange={(value) => setShared(value === true)} />
              Mostrar este material para os demais membros
            </label>
            <p className="text-xs text-muted-foreground">
              Desmarque para aparecer apenas em seus materiais dentro do sistema. O link publicado
              continua disponível para enviar ao cliente.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={saving || !selected.length || title.trim().length < 2}
              >
                {saving
                  ? "Criando…"
                  : layout === "lista"
                    ? "Criar tabela de vendas"
                    : "Criar catálogo online"}
              </Button>
            </DialogFooter>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
