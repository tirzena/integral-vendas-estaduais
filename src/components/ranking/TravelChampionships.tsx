/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { authenticatedFileClient } from "@/lib/authenticated-storage";
import { useCurrentUser } from "@/hooks/useAuth";
import { useRows } from "@/lib/db";
import {
  campaignRules,
  championshipLeader,
  type ChampionshipStanding,
  type RankingCampaignMedia,
} from "@/lib/ranking-campaigns";
import { CampaignCarousel } from "./CampaignCarousel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type Championship = {
  id: string;
  title: string;
  destination: string;
  starts_at: string;
  ends_at: string;
  individual_goal: number;
  team_goal: number;
  counting_mode: string;
  eligible_products: string[];
  eligible_macro_ids?: string[];
  eligible_category_ids?: string[];
  eligible_item_ids?: string[];
  team_prize: string;
  media: RankingCampaignMedia[];
  enabled: boolean;
};
const MODES: Record<string, string> = {
  paid: "Pedidos pagos e com baixa no estoque",
  orders: "Pedidos emitidos, mesmo sem pagamento",
  proportional: "Unidades proporcionais aos pagamentos recebidos",
};
export function TravelChampionships({ dashboard = false }: { dashboard?: boolean }) {
  const { data, isLoading, error } = useRows<Championship>("ranking_championships", {
    orderBy: { column: "starts_at", ascending: true },
    filter: { enabled: true },
  });
  const { isAdmin } = useCurrentUser();
  const [creating, setCreating] = useState(false);
  const [newId, setNewId] = useState(() => crypto.randomUUID());
  const [selected, setSelected] = useState<string>("");
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const configs = data ?? [];
  const automatic = configs.find((c) => Date.parse(c.ends_at) > now) ?? configs.at(-1);
  const current = configs.find((c) => c.id === selected) ?? automatic;
  if (isLoading)
    return <p className="mb-4 text-sm text-muted-foreground">Carregando campeonatos…</p>;
  if (error) return <p role="alert">Não foi possível carregar os campeonatos. Tente novamente.</p>;

  return (
    <div className="mb-6">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold">Campeonatos de vendas</h2>
        <select
          aria-label="Escolher campeonato"
          className="rounded-lg border bg-background p-2"
          value={current?.id ?? ""}
          onChange={(e) => setSelected(e.target.value)}
        >
          {configs.map((c, i) => (
            <option key={c.id} value={c.id}>
              Campeonato {i + 1} · {c.destination}
            </option>
          ))}
        </select>
        {isAdmin && !dashboard && (
          <Button
            onClick={() => {
              setNewId(crypto.randomUUID());
              setCreating(true);
            }}
          >
            Novo campeonato
          </Button>
        )}
      </div>
      {current && <ChampionshipDetail key={current.id} config={current} dashboard={dashboard} />}
      {creating && (
        <ChampionshipEditor
          isNew
          config={{
            id: newId,
            title: "",
            destination: "",
            starts_at: configs.at(-1)?.ends_at ?? new Date().toISOString(),
            ends_at: "",
            individual_goal: 1,
            team_goal: 1,
            counting_mode: "proportional",
            eligible_products: [],
            team_prize: "A definir pelos administradores",
            media: [],
            enabled: true,
          }}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}
function ChampionshipDetail({
  config: c,
  dashboard,
}: {
  config: Championship;
  dashboard: boolean;
}) {
  const { isAdmin } = useCurrentUser();
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<"members" | "teams">("members");
  const query = useQuery({
    queryKey: [
      "travel-standings",
      c.id,
      c.counting_mode,
      c.individual_goal,
      c.team_goal,
      c.eligible_products,
      c.eligible_macro_ids,
      c.eligible_category_ids,
      c.eligible_item_ids,
      c.starts_at,
      c.ends_at,
    ],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("ranking_championship_standings", {
        p_id: c.id,
      });
      if (error) throw error;
      return data as { members: ChampionshipStanding[]; teams: ChampionshipStanding[] };
    },
    refetchInterval: 30000,
  });
  const rows = query.data?.[mode] ?? [];
  const goal = mode === "members" ? c.individual_goal : c.team_goal;
  const leader = championshipLeader(rows, goal);
  const closed = Date.now() >= Date.parse(c.ends_at);
  const result =
    leader.state === "tie"
      ? "Empate na liderança: decisão dos administradores"
      : leader.state === "below"
        ? closed
          ? "Sem vencedor: meta mínima não atingida"
          : "Ainda não há líder que atingiu a meta mínima"
        : `${closed ? "Vencedor apurado" : "Líder com meta atingida"}: ${leader.winner?.name}`;
  return (
    <>
      <CampaignCarousel
        title={c.title}
        destination={c.destination}
        startsAt={c.starts_at}
        endsAt={c.ends_at}
        individualGoal={c.individual_goal}
        teamGoal={c.team_goal}
        companion
        rules={campaignRules({
          individualGoal: c.individual_goal,
          teamGoal: c.team_goal,
          destination: c.destination,
        })}
        media={c.media}
        compact={dashboard}
      >
      <div className="space-y-3">
        <p className="text-sm">
          <strong>Apuração:</strong> {MODES[c.counting_mode]}. Produtos elegíveis:{" "}
          {c.eligible_macro_ids?.length ||
          c.eligible_category_ids?.length ||
          c.eligible_item_ids?.length
            ? [
                c.eligible_macro_ids?.length
                  ? `${c.eligible_macro_ids.length} macrocategoria(s)`
                  : "",
                c.eligible_category_ids?.length
                  ? `${c.eligible_category_ids.length} subcategoria(s)`
                  : "",
                c.eligible_item_ids?.length ? `${c.eligible_item_ids.length} produto(s)` : "",
              ]
                .filter(Boolean)
                .join(" · ")
            : c.eligible_products.length
              ? c.eligible_products.join(", ")
              : "todos os produtos"}
          . Pedidos cancelados, excluídos, substituídos e de teste não contam.
        </p>
        <p className="text-sm">Premiação da equipe: {c.team_prize}.</p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={mode === "members" ? "default" : "outline"}
            onClick={() => setMode("members")}
          >
            Membros
          </Button>
          <Button
            variant={mode === "teams" ? "default" : "outline"}
            onClick={() => setMode("teams")}
          >
            Equipes
          </Button>
          {isAdmin && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              Configurar campeonato
            </Button>
          )}
        </div>
        {query.error ? (
          <p role="alert">Não foi possível carregar a classificação.</p>
        ) : query.isLoading ? (
          <p>Carregando classificação…</p>
        ) : (
          <>
            <p className="font-semibold">{result}</p>
            <p className="text-xs text-muted-foreground">
              {closed
                ? "Resultado sujeito à conferência dos administradores. Nenhuma retirada ou pagamento é criado automaticamente."
                : "Classificação provisória até o encerramento do campeonato."}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-2">Posição</th>
                    <th className="p-2">{mode === "members" ? "Membro" : "Equipe"}</th>
                    <th className="p-2">Unidades contabilizadas</th>
                    <th className="p-2">Meta</th>
                    <th className="p-2">Faltam</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, dashboard ? 4 : rows.length).map((r, i) => (
                    <tr key={r.id} className="border-b">
                      <td className="p-2">{i + 1}</td>
                      <td className="p-2">{r.name}</td>
                      <td className="p-2">{Number(r.units).toLocaleString("pt-BR")}</td>
                      <td className="p-2">{goal.toLocaleString("pt-BR")}</td>
                      <td className="p-2">{Math.max(0, goal - r.units).toLocaleString("pt-BR")}</td>
                    </tr>
                  ))}
                  {!rows.length && (
                    <tr>
                      <td colSpan={5} className="p-3">
                        Nenhuma unidade contabilizada neste campeonato.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      </CampaignCarousel>
      {editing && <ChampionshipEditor config={c} onClose={() => setEditing(false)} />}
    </>
  );
}
function ChampionshipEditor({
  config: c,
  onClose,
  isNew = false,
}: {
  config: Championship;
  onClose: () => void;
  isNew?: boolean;
}) {
  const [draft, setDraft] = useState(c);
  const formatBrasilia = (value: string) =>
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(value)).replace(" ", "T");
  const [initialStart] = useState(() => formatBrasilia(c.starts_at));
  const [initialEnd] = useState(() => formatBrasilia(c.ends_at || new Date(Date.parse(c.starts_at) + 30 * 86_400_000).toISOString()));
  const [startDay, setStartDay] = useState(() => initialStart.split("T")[0]);
  const [startTime, setStartTime] = useState(() => initialStart.split("T")[1]);
  const [endDay, setEndDay] = useState(() => initialEnd.split("T")[0]);
  const [endTime, setEndTime] = useState(() => initialEnd.split("T")[1]);
  const validTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  const startDate = validTime(startTime) && startDay
    ? new Date(`${startDay}T${startTime}:00-03:00`) : new Date(NaN);
  const endDate = validTime(endTime) && endDay
    ? new Date(`${endDay}T${endTime}:00-03:00`) : new Date(NaN);
  const queryClient = useQueryClient();
  const macros = useRows<any>("products", {
    orderBy: { column: "name", ascending: true },
    filter: { is_demo: false },
  });
  const categories = useRows<any>("product_categories", {
    orderBy: { column: "name", ascending: true },
    filter: { is_demo: false },
  });
  const items = useRows<any>("inventory_items", {
    orderBy: { column: "name", ascending: true },
    filter: { is_demo: false },
    limit: 5000,
  });
  const hasIds = Boolean(
    c.eligible_macro_ids?.length || c.eligible_category_ids?.length || c.eligible_item_ids?.length,
  );
  const [allProducts, setAllProducts] = useState(!hasIds && c.eligible_products.length === 0);
  const [productSearch, setProductSearch] = useState("");
  const initializedEligibility = useRef(false);
  useEffect(() => {
    if (initializedEligibility.current || !items.isSuccess) return;
    initializedEligibility.current = true;
    if (!hasIds && c.eligible_products.length) {
      const names = new Set(c.eligible_products.map((name) => name.trim().toLowerCase()));
      setDraft((d) => ({
        ...d,
        eligible_item_ids: (items.data ?? [])
          .filter((item) => names.has(item.name.trim().toLowerCase()))
          .map((item) => item.id),
      }));
    }
  }, [items.isSuccess, items.data, c.eligible_products, hasIds]);
  const macroIds = draft.eligible_macro_ids ?? [];
  const categoryIds = draft.eligible_category_ids ?? [];
  const itemIds = draft.eligible_item_ids ?? [];
  const allowedCategories = (categories.data ?? []).filter(
    (category) => !macroIds.length || macroIds.includes(category.product_id),
  );
  const allowedItems = (items.data ?? []).filter(
    (item) =>
      (!macroIds.length || macroIds.includes(item.product_id)) &&
      (!categoryIds.length || categoryIds.includes(item.category_id)) &&
      item.name.toLocaleLowerCase("pt-BR").includes(productSearch.toLocaleLowerCase("pt-BR")),
  );

  const [url, setUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const save = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const table = supabase.from("ranking_championships" as any) as any;
      const { error } = isNew
        ? await table.insert(values)
        : await table.update(values).eq("id", c.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries();
      toast.success(isNew ? "Campeonato criado." : "Configuração salva.");
      onClose();
    },
    onError: () => toast.error("Não foi possível salvar o campeonato. Tente novamente."),
  });
  const append = (value: string, kind: RankingCampaignMedia["kind"], title: string) =>
    setDraft((d) => ({
      ...d,
      media:
        kind === "image"
          ? [{ id: crypto.randomUUID(), url: value, kind, title }, ...d.media]
          : [...d.media, { id: crypto.randomUUID(), url: value, kind, title }],
    }));
  async function upload(file: File | undefined) {
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"].includes(file.type) ||
      file.size > 50 * 1024 * 1024
    ) {
      toast.error("Use JPG, PNG, WebP, MP4 ou WebM, até 50 MB.");
      return;
    }
    setUploading(true);
    try {
      const path = `${c.id}/${crypto.randomUUID()}.${file.type.split("/")[1]}`;
      const { client } = await authenticatedFileClient();
      const { error } = await client.storage
        .from("championship-media")
        .upload(path, file, { upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from("championship-media").getPublicUrl(path);
      append(data.publicUrl, file.type.startsWith("image/") ? "image" : "video", file.name);
    } catch (error: any) {
      toast.error(error?.message ?? "Não foi possível enviar a mídia.");
    } finally {
      setUploading(false);
    }
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (
      !Number.isInteger(draft.individual_goal) ||
      draft.individual_goal < 1 ||
      !Number.isInteger(draft.team_goal) ||
      draft.team_goal < 1
    ) {
      toast.error("Informe metas inteiras maiores que zero.");
      return;
    }
    if (!validTime(startTime) || !startDay || !Number.isFinite(startDate.getTime())) {
      toast.error("Informe uma data e horário de início válidos.");
      return;
    }
    if (!validTime(endTime) || !endDay || !Number.isFinite(endDate.getTime()) || endDate <= startDate) {
      toast.error("Informe um encerramento válido após o início do campeonato.");
      return;
    }
    if (items.isLoading || items.error || macros.error || categories.error) {
      toast.error("Aguarde o carregamento das categorias e produtos.");
      return;
    }
    if (!allProducts && !macroIds.length && !categoryIds.length && !itemIds.length) {
      toast.error("Selecione uma categoria ou produto, ou marque todos os produtos.");
      return;
    }
    save.mutate({
      id: c.id,
      starts_at: startDate.toISOString(),
      ends_at: endDate.toISOString(),
      enabled: draft.enabled,
      title: draft.title,
      destination: draft.destination,
      individual_goal: draft.individual_goal,
      team_goal: draft.team_goal,
      counting_mode: draft.counting_mode,
      team_prize: draft.team_prize,
      eligible_products: [],
      eligible_macro_ids: allProducts ? [] : macroIds,
      eligible_category_ids: allProducts ? [] : categoryIds,
      eligible_item_ids: allProducts ? [] : itemIds,
      media: draft.media,
    });
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? "Novo campeonato" : "Configurar campeonato"}</DialogTitle>
          <DialogDescription>
            As alterações valem para o painel de todos. Defina quando o campeonato começa e termina.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Label htmlFor="champ-title">Nome</Label>
          <Input
            id="champ-title"
            required
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
          <Label htmlFor="champ-destination">Destino / premiação individual</Label>
          <Input
            id="champ-destination"
            required
            value={draft.destination}
            onChange={(e) => setDraft({ ...draft, destination: e.target.value })}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="champ-start-day">Data de início (Brasília)</Label>
              <Input
                id="champ-start-day"
                type="date"
                required
                value={startDay}
                onChange={(e) => setStartDay(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="champ-start-time">Horário de início (Brasília)</Label>
              <Input
                id="champ-start-time"
                type="text"
                required
                placeholder="HH:mm"
                maxLength={5}
                pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
                title="Informe o horário de 00:00 a 23:59, como 19:30."
                aria-describedby="champ-time-help"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
              <p id="champ-time-help" className="text-xs text-muted-foreground">
                Formato de 24 horas. Exemplo: 19:30.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="champ-end-day">Data de fim (Brasília)</Label>
              <Input id="champ-end-day" type="date" required value={endDay}
                onChange={(e) => setEndDay(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="champ-end-time">Horário de fim (Brasília)</Label>
              <Input id="champ-end-time" type="text" required placeholder="HH:mm" maxLength={5}
                pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
                title="Informe o horário de 00:00 a 23:59, como 19:30."
                value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
          {Number.isFinite(startDate.getTime()) && Number.isFinite(endDate.getTime()) && endDate <= startDate &&
            <p className="text-sm text-destructive">O fim deve ser posterior ao início.</p>}
          <Label htmlFor="champ-mode">Como contabilizar vendas</Label>
          <select
            id="champ-mode"
            className="w-full rounded-lg border bg-background p-2"
            value={draft.counting_mode}
            onChange={(e) => setDraft({ ...draft, counting_mode: e.target.value })}
          >
            {Object.entries(MODES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <Label htmlFor="champ-individual">Meta individual (unidades)</Label>
          <Input
            id="champ-individual"
            type="number"
            min="1"
            step="1"
            required
            value={draft.individual_goal}
            onChange={(e) => setDraft({ ...draft, individual_goal: Number(e.target.value) })}
          />
          <Label htmlFor="champ-team">Meta da equipe (unidades)</Label>
          <Input
            id="champ-team"
            type="number"
            min="1"
            step="1"
            required
            value={draft.team_goal}
            onChange={(e) => setDraft({ ...draft, team_goal: Number(e.target.value) })}
          />
          <Label htmlFor="champ-prize">Premiação da equipe</Label>
          <Input
            id="champ-prize"
            required
            value={draft.team_prize}
            onChange={(e) => setDraft({ ...draft, team_prize: e.target.value })}
          />
          <fieldset className="space-y-3 rounded-lg border p-3">
            <legend className="px-1 font-medium">Elegibilidade das vendas</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={allProducts}
                onChange={(e) => setAllProducts(e.target.checked)}
              />{" "}
              Todos os produtos
            </label>
            {!allProducts && (
              <>
                <p className="text-xs text-muted-foreground">
                  Selecione uma ou mais opções. Os produtos precisam atender às macrocategorias,
                  subcategorias e produtos selecionados. Deixe um nível vazio para aceitar todas as
                  opções desse nível.
                </p>
                {(items.isLoading || macros.isLoading || categories.isLoading) && (
                  <p role="status">Carregando categorias e produtos…</p>
                )}
                {(items.error || macros.error || categories.error) && (
                  <p role="alert">
                    Não foi possível carregar as opções. Reabra a configuração para tentar
                    novamente.
                  </p>
                )}
                <EligibilityOptions
                  title="Macrocategorias aceitas"
                  options={(macros.data ?? []).map((m) => ({ id: m.id, name: m.name }))}
                  selected={macroIds}
                  onChange={(ids) =>
                    setDraft({
                      ...draft,
                      eligible_macro_ids: ids,
                      eligible_category_ids: [],
                      eligible_item_ids: [],
                    })
                  }
                />
                <EligibilityOptions
                  title="Subcategorias aceitas"
                  options={allowedCategories.map((cat) => ({
                    id: cat.id,
                    name: `${(macros.data ?? []).find((m) => m.id === cat.product_id)?.name ?? "Sem macrocategoria"} › ${cat.name}`,
                  }))}
                  selected={categoryIds}
                  onChange={(ids) =>
                    setDraft({ ...draft, eligible_category_ids: ids, eligible_item_ids: [] })
                  }
                />
                <Label htmlFor="champ-item-search">Buscar produto</Label>
                <Input
                  id="champ-item-search"
                  placeholder="Nome do produto"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                />
                <EligibilityOptions
                  title="Produtos aceitos"
                  options={allowedItems.map((item) => ({ id: item.id, name: item.name }))}
                  selected={itemIds}
                  onChange={(ids) => setDraft({ ...draft, eligible_item_ids: ids })}
                />
                <p className="text-xs text-muted-foreground">
                  {macroIds.length} macrocategoria(s), {categoryIds.length} subcategoria(s) e{" "}
                  {itemIds.length} produto(s) selecionado(s).
                </p>
              </>
            )}
          </fieldset>
          <Label htmlFor="champ-upload">Adicionar imagem ou vídeo</Label>
          <Input
            id="champ-upload"
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
            disabled={uploading}
            onChange={(e) => void upload(e.target.files?.[0])}
          />
          <Label htmlFor="champ-url">Link de vídeo do YouTube</Label>
          <Input id="champ-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (!/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(url)) {
                toast.error("Informe um link HTTPS do YouTube.");
                return;
              }
              append(url, "youtube", draft.destination);
              setUrl("");
            }}
          >
            Adicionar link
          </Button>
          <div className="space-y-2">
            {draft.media.map((m, i) => (
              <div key={m.id} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  {i + 1}. {m.title} ({m.kind})
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    setDraft({ ...draft, media: draft.media.filter((x) => x.id !== m.id) })
                  }
                >
                  Remover do carrossel
                </Button>
              </div>
            ))}
          </div>
          <Button type="submit" disabled={save.isPending || uploading}>
            {uploading ? "Enviando mídia…" : "Salvar configuração"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EligibilityOptions({
  title,
  options,
  selected,
  onChange,
}: {
  title: string;
  options: { id: string; name: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{title}</legend>
      <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border p-2">
        {options.map((option) => (
          <label key={option.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected.includes(option.id)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...selected, option.id]
                    : selected.filter((id) => id !== option.id),
                )
              }
            />
            {option.name}
          </label>
        ))}
        {!options.length && (
          <p className="text-xs text-muted-foreground">Nenhuma opção encontrada.</p>
        )}
      </div>
    </fieldset>
  );
}
