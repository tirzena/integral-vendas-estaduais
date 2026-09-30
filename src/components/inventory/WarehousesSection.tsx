/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ChevronRight, Loader2, MapPin, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCep, lookupCep } from "@/lib/cep";
import { brazilStates } from "@/data/brazil-state-map";
import { BRAZIL_REGIONS, regionForState, stateCodeFor, type BrazilRegion } from "@/lib/brazil-territory";

type WarehouseForm = {
  id?: string;
  name: string;
  address: string;
  city: string;
  state: string;
  country: string;
  level: "principal" | "estado" | "cidade";
  parent_id: string;
  latitude: string;
  longitude: string;
};
const empty: WarehouseForm = {
  name: "",
  address: "",
  city: "",
  state: "",
  country: "Brasil",
  level: "cidade",
  parent_id: "",
  latitude: "",
  longitude: "",
};

export function WarehousesSection({
  selectedId,
  onSelect,
}: {
  selectedId?: string | null;
  onSelect?: (warehouse: any) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<WarehouseForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [cep, setCep] = useState("");
  const [loadingCep, setLoadingCep] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<BrazilRegion | "">("");
  const { data = [] } = useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("warehouses") as any).select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  async function save() {
    const isBrazil = ["BR", "BRA", "BRASIL", "BRAZIL"].includes(form?.country.trim().toUpperCase() ?? "");
    if (!form?.name.trim() || !form.country.trim())
      return void toast.error("Informe nome e país do estoque.");
    if (isBrazil && form.level !== "principal" && !stateCodeFor(form.state))
      return void toast.error("Selecione a região e o estado do estoque.");
    if (form.level === "estado" && (!form.state.trim() || !form.parent_id))
      return void toast.error("Informe o estado e escolha o estoque principal.");
    if (form.level === "cidade" && (!form.city.trim() || !form.state.trim() || !form.parent_id))
      return void toast.error("Informe cidade, estado e o estoque superior.");
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      address: form.address.trim() || null,
      city: form.city.trim(),
      state: isBrazil && stateCodeFor(form.state) ? brazilStates[stateCodeFor(form.state)!].uf : form.state.trim(),
      country: form.country.trim(),
      level: form.level,
      parent_id: form.level === "principal" ? null : form.parent_id || null,
      latitude: form.latitude === "" ? null : Number(form.latitude.replace(",", ".")),
      longitude: form.longitude === "" ? null : Number(form.longitude.replace(",", ".")),
    };
    const q = form.id
      ? (supabase.from("warehouses") as any).update(payload).eq("id", form.id)
      : (supabase.from("warehouses") as any).insert(payload);
    const { error } = await q;
    setSaving(false);
    if (error) return void toast.error(error.message ?? "Não foi possível salvar o estoque.");
    setForm(null);
    await qc.invalidateQueries({ queryKey: ["warehouses"] });
    toast.success(form.id ? "Estoque atualizado." : "Novo estoque criado.");
  }

  async function fillFromCep() {
    setLoadingCep(true);
    try {
      const found = await lookupCep(cep);
      setCep(found.cep);
      setSelectedRegion(regionForState(stateCodeFor(found.state) ?? "") ?? "");
      setForm(
        (current) =>
          current && {
            ...current,
            address: [found.street, found.neighborhood].filter(Boolean).join(", "),
            city: found.city,
            state: found.state.toUpperCase(),
            country: "Brasil",
            latitude: found.latitude,
            longitude: found.longitude,
          },
      );
      toast.success("Endereço do estoque preenchido pelo CEP.");
    } catch (error: any) {
      toast.error(error?.message ?? "Não foi possível consultar o CEP.");
    } finally {
      setLoadingCep(false);
    }
  }

  return (
    <section className="mt-6 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Locais de estoque</h2>
          <p className="text-sm text-muted-foreground">
            Organize o estoque principal por país, estado e cidade.
          </p>
        </div>
        <Button
          onClick={() => {
            setCep("");
            setSelectedRegion("");
            setForm({ ...empty });
          }}
        >
          <Plus className="mr-1 size-4" /> Novo estoque
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[...data]
          .sort((a: any, b: any) => {
            const rank: any = { principal: 0, estado: 1, cidade: 2 };
            return (
              (rank[a.level] ?? 2) - (rank[b.level] ?? 2) ||
              String(a.state).localeCompare(String(b.state)) ||
              String(a.city).localeCompare(String(b.city))
            );
          })
          .map((w: any) => (
            <Card
              key={w.id}
              className={`${selectedId === w.id ? "ring-2 ring-primary" : ""} ${w.level === "cidade" ? "ml-6" : w.level === "estado" ? "ml-3" : ""}`}
            >
              <CardContent className="flex items-start justify-between gap-3 pt-5">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium">
                    <Building2 className="size-4 text-primary" /> {w.name}
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-normal uppercase text-muted-foreground">
                      {w.level ?? "cidade"}
                    </span>
                  </p>
                  <p className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="size-3.5" /> {w.city} · {w.state} ·{" "}
                    {w.country || "País a definir"}
                  </p>
                  {w.address && (
                    <p className="mt-1 truncate text-xs text-muted-foreground">{w.address}</p>
                  )}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    setCep("");
                    setSelectedRegion(regionForState(stateCodeFor(w.state) ?? "") ?? "");
                    setForm({
                      id: w.id,
                      name: w.name,
                      address: w.address ?? "",
                      city: w.city,
                      state: w.state,
                      country: w.country ?? "",
                      level: w.level ?? "cidade",
                      parent_id: w.parent_id ?? "",
                      latitude: w.latitude == null ? "" : String(w.latitude),
                      longitude: w.longitude == null ? "" : String(w.longitude),
                    });
                  }}
                >
                  <Pencil className="size-4" />
                </Button>
              </CardContent>
              {onSelect && (
                <div className="border-t p-3">
                  <Button
                    className="w-full justify-between"
                    variant={selectedId === w.id ? "default" : "outline"}
                    onClick={() => onSelect(w)}
                  >
                    {selectedId === w.id ? "Controle aberto" : "Abrir controle de estoque"}
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              )}
            </Card>
          ))}
      </div>
      <Dialog open={!!form} onOpenChange={(v) => !v && setForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form?.id ? "Editar estoque" : "Novo estoque"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Nome</Label>
              <Input
                value={form?.name ?? ""}
                onChange={(e) => setForm((f) => f && { ...f, name: e.target.value })}
                placeholder="Ex.: Centro de distribuição"
              />
            </div>
            <div>
              <Label>Nível na hierarquia</Label>
              <Select
                value={form?.level ?? "cidade"}
                onValueChange={(v) =>
                  setForm(
                    (f) =>
                      f && {
                        ...f,
                        level: v as WarehouseForm["level"],
                        parent_id: v === "principal" ? "" : f.parent_id,
                      },
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="principal">Estoque principal</SelectItem>
                  <SelectItem value="estado">Estado</SelectItem>
                  <SelectItem value="cidade">Cidade / subestoque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form?.level !== "principal" && (
              <div>
                <Label>Pertence a (estrutura)</Label>
                <Select
                  value={form?.parent_id || undefined}
                  onValueChange={(v) => setForm((f) => f && { ...f, parent_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o estoque superior" />
                  </SelectTrigger>
                  <SelectContent>
                    {data
                      .filter(
                        (w: any) =>
                          w.id !== form?.id &&
                          (form?.level === "estado"
                            ? w.level === "principal"
                            : w.level === "estado"),
                      )
                      .map((w: any) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.name} · {w.state}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Define a hierarquia do estoque. A origem de cada transferência é informada ao
                  movimentar produtos.
                </p>
              </div>
            )}
            <div>
              <Label>País</Label>
              <Input
                value={form?.country ?? ""}
                onChange={(e) => setForm((f) => f && { ...f, country: e.target.value })}
                placeholder="Ex.: Paraguai"
              />
            </div>
            <div>
              <Label>CEP</Label>
              <div className="flex gap-2">
                <Input
                  value={cep}
                  onChange={(e) => setCep(formatCep(e.target.value))}
                  onBlur={() => {
                    if (cep.replace(/\D/g, "").length === 8) void fillFromCep();
                  }}
                  inputMode="numeric"
                  maxLength={9}
                  placeholder="00000-000"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void fillFromCep()}
                  disabled={loadingCep}
                >
                  {loadingCep ? <Loader2 className="size-4 animate-spin" /> : "Buscar"}
                </Button>
              </div>
            </div>
            <div>
              <Label>Cidade</Label>
              <Input
                value={form?.city ?? ""}
                onChange={(e) => setForm((f) => f && { ...f, city: e.target.value })}
              />
            </div>
            {["BR", "BRA", "BRASIL", "BRAZIL"].includes(form?.country.trim().toUpperCase() ?? "") && form?.level !== "principal" ? <>
              <div>
                <Label>Região</Label>
                <Select value={selectedRegion || undefined} onValueChange={(value) => {
                  setSelectedRegion(value as BrazilRegion);
                  setForm((f) => f && { ...f, state: "" });
                }}>
                  <SelectTrigger><SelectValue placeholder="Selecione a região" /></SelectTrigger>
                  <SelectContent>{Object.keys(BRAZIL_REGIONS).map((region) =>
                    <SelectItem key={region} value={region}>{region}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Estado</Label>
                <Select value={stateCodeFor(form?.state) ?? undefined} onValueChange={(code) =>
                  setForm((f) => f && { ...f, state: brazilStates[code].uf })} disabled={!selectedRegion}>
                  <SelectTrigger><SelectValue placeholder="Selecione o estado" /></SelectTrigger>
                  <SelectContent>{(BRAZIL_REGIONS[selectedRegion as BrazilRegion]?.codes ?? []).map((code) =>
                    <SelectItem key={code} value={code}>{brazilStates[code].name} ({brazilStates[code].uf})</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </> : <div>
              <Label>Estado/Província</Label>
              <Input value={form?.state ?? ""} onChange={(e) => setForm((f) => f && { ...f, state: e.target.value })} />
            </div>}
            <div className="sm:col-span-2">
              <Label>Endereço</Label>
              <Input
                value={form?.address ?? ""}
                onChange={(e) => setForm((f) => f && { ...f, address: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>
              Cancelar
            </Button>
            <Button disabled={saving} onClick={() => void save()}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
