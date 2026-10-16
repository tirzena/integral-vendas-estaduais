import { CatalogProductPicker, type MaterialSelectionItem } from "./CatalogProductPicker";
import type { CatalogCategory, CatalogSubcategory } from "@/lib/catalog-selection";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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
type Item = MaterialSelectionItem;
export function MemberCatalogCreator({
  layout,
  items,
  categories = [],
  subcategories = [],
  onClose,
  onCreated,
}: {
  layout: "cards" | "lista";
  items: Item[];
  categories?: CatalogCategory[];
  subcategories?: CatalogSubcategory[];
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
            <CatalogProductPicker
              items={items}
              categories={categories}
              subcategories={subcategories}
              selected={selected}
              onChange={setSelected}
            />
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
