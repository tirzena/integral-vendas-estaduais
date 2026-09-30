/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Loader2,
  Pause,
  Play,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { authenticatedFileClient } from "@/lib/authenticated-storage";
import { useCurrentUser } from "@/hooks/useAuth";
import { usePeople } from "@/hooks/usePeople";
import { useProductScope } from "@/hooks/useProductScope";
import { formatDateTime } from "@/lib/format";
import { getProviderStatus, runCampaignBatch, sendTestMessage } from "@/lib/campaigns.functions";
import {
  CHANNELS,
  CHANNEL_LABELS,
  OCCASIONS,
  OCCASION_TEMPLATES,
  STATUS_LABELS,
  VARIABLES,
  idempotencyKey,
  nextAllowedSend,
  renderMessage,
  type AudienceFilters,
  type Channel,
  type CampaignStatus,
} from "@/lib/campaigns";
import { useAudience } from "@/components/campaigns/useAudience";
import { EmptyState } from "@/components/common/PageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

const BUCKET = "chat-anexos";

function downloadCsv(name: string, rows: Record<string, any>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]!);
  const body = rows
    .map((r) => headers.map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(";"))
    .join("\n");
  const blob = new Blob([`\uFEFF${headers.join(";")}\n${body}`], {
    type: "text/csv;charset=utf-8;",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function StatusBadge({ status }: { status: CampaignStatus }) {
  const tone: Record<string, string> = {
    rascunho: "outline",
    aguardando_aprovacao: "secondary",
    agendada: "secondary",
    executando: "default",
    pausada: "outline",
    concluida: "default",
    cancelada: "destructive",
  };
  return <Badge variant={(tone[status] ?? "outline") as any}>{STATUS_LABELS[status]}</Badge>;
}

export function Dispatcher() {
  const { isAdmin, roles, userId } = useCurrentUser();
  const canManage = isAdmin || roles.includes("gestor");
  const queryClient = useQueryClient();
  const providerStatusFn = useServerFn(getProviderStatus);

  const providers = useQuery({
    queryKey: ["campaign-providers"],
    queryFn: () => providerStatusFn(),
    staleTime: 5 * 60 * 1000,
  });

  const campaigns = useQuery({
    queryKey: ["campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const jobs = useQuery({
    queryKey: ["campaign-jobs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("message_jobs")
        .select("id,campaign_id,channel,status,delivered_at,read_at,replied_at,error,to_address,created_at")
        .order("created_at", { ascending: false })
        .limit(2000);
      return data ?? [];
    },
  });

  const optOuts = useQuery({
    queryKey: ["campaign-optouts"],
    queryFn: async () => {
      const { count } = await supabase
        .from("message_consents")
        .select("id", { count: "exact", head: true })
        .eq("status", "opt_out");
      return count ?? 0;
    },
  });

  const anyProvider = providers.data
    ? Object.values(providers.data).some((p: any) => p.configured)
    : false;

  return (
    <div className="space-y-4">
      {!anyProvider && (
        <Alert>
          <AlertTriangle className="size-4" />
          <AlertTitle>Provedores não configurados</AlertTitle>
          <AlertDescription>
            WhatsApp, e-mail e SMS aparecem como <strong>Não configurado</strong>. Você pode montar
            públicos, escrever e agendar campanhas, mas o disparo fica bloqueado até que as chaves
            sejam cadastradas em Configurações. Nada é enviado nem simulado.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-2 sm:grid-cols-3">
        {CHANNELS.map((ch) => {
          const st = (providers.data as any)?.[ch];
          return (
            <div key={ch} className="surface-card flex items-center justify-between gap-2 p-3">
              <div>
                <p className="text-sm font-medium">{CHANNEL_LABELS[ch]}</p>
                <p className="text-xs text-muted-foreground">{st?.provider ?? "—"}</p>
              </div>
              <Badge variant={st?.configured ? "default" : "outline"}>
                {providers.isLoading ? "…" : st?.configured ? "Conectado" : "Não configurado"}
              </Badge>
            </div>
          );
        })}
      </div>

      <Tabs defaultValue="painel">
        <TabsList className="flex-wrap">
          <TabsTrigger value="painel">Painel</TabsTrigger>
          <TabsTrigger value="nova">Nova campanha</TabsTrigger>
          <TabsTrigger value="consentimentos">Consentimentos (LGPD)</TabsTrigger>
          <TabsTrigger value="modelos">Modelos</TabsTrigger>
        </TabsList>

        <TabsContent value="painel" className="pt-4">
          <CampaignsPanel
            campaigns={campaigns.data ?? []}
            jobs={jobs.data ?? []}
            optOuts={optOuts.data ?? 0}
            anyProvider={anyProvider}
            canManage={canManage}
            onChanged={() => {
              queryClient.invalidateQueries({ queryKey: ["campaigns"] });
              queryClient.invalidateQueries({ queryKey: ["campaign-jobs"] });
            }}
          />
        </TabsContent>

        <TabsContent value="nova" className="pt-4">
          <CampaignBuilder
            canManage={canManage}
            userId={userId ?? null}
            providers={providers.data as any}
            onSaved={() => {
              queryClient.invalidateQueries({ queryKey: ["campaigns"] });
              queryClient.invalidateQueries({ queryKey: ["campaign-jobs"] });
              toast.success("Campanha salva. Acompanhe pelo painel.");
            }}
          />
        </TabsContent>

        <TabsContent value="consentimentos" className="pt-4">
          <ConsentManager canManage={canManage} />
        </TabsContent>

        <TabsContent value="modelos" className="pt-4">
          <TemplatesManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------------- painel ---------------------------------- */

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="surface-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function CampaignsPanel({
  campaigns,
  jobs,
  optOuts,
  anyProvider,
  canManage,
  onChanged,
}: {
  campaigns: any[];
  jobs: any[];
  optOuts: number;
  anyProvider: boolean;
  canManage: boolean;
  onChanged: () => void;
}) {
  const runBatch = useServerFn(runCampaignBatch);
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<any | null>(null);
  const [reason, setReason] = useState("");
  const [channelFilter, setChannelFilter] = useState<string>("todos");

  const visible = channelFilter === "todos" ? jobs : jobs.filter((j) => j.channel === channelFilter);
  const has = visible.length > 0;
  const count = (fn: (j: any) => boolean) => visible.filter(fn).length;
  const na = (value: number, available: boolean) =>
    !has ? "—" : available ? value : "indisponível";

  async function setStatus(campaign: any, status: CampaignStatus, extra: any = {}) {
    setBusy(campaign.id);
    const { error } = await supabase.rpc("campaigns_set_status" as any, {
      p_campaign_id: campaign.id,
      p_status: status,
      p_reason: extra?.cancel_reason ?? null,
    });
    setBusy(null);
    if (error) toast.error(error.message);
    else {
      toast.success(`Campanha ${STATUS_LABELS[status].toLowerCase()}.`);
      onChanged();
    }
  }

  async function duplicate(campaign: any) {
    const copy = { ...campaign };
    delete copy.id;
    delete copy.created_at;
    delete copy.updated_at;
    copy.name = `${campaign.name} (cópia)`;
    copy.status = "rascunho";
    copy.approved_at = null;
    copy.approved_by = null;
    const { error } = await supabase.from("campaigns").insert(copy);
    if (error) toast.error(error.message);
    else {
      toast.success("Campanha duplicada como rascunho.");
      onChanged();
    }
  }

  async function dispatch(campaign: any) {
    setBusy(campaign.id);
    try {
      const res: any = await runBatch({ data: { campaignId: campaign.id } });
      toast.success(
        `Lote processado: ${res.sent} enviadas, ${res.failed} com falha.` +
          (res.finished ? " Campanha concluída." : ""),
      );
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível disparar agora.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Label className="text-xs">Funil por canal</Label>
        <Select value={channelFilter} onValueChange={setChannelFilter}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os canais</SelectItem>
            {CHANNELS.map((c) => (
              <SelectItem key={c} value={c}>
                {CHANNEL_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            downloadCsv(
              "relatorio-disparos",
              visible.map((j) => ({
                canal: CHANNEL_LABELS[j.channel as Channel],
                destino: j.to_address,
                situacao: j.status,
                entregue_em: j.delivered_at ?? "",
                lido_em: j.read_at ?? "",
                respondido_em: j.replied_at ?? "",
                erro: j.error ?? "",
              })),
            )
          }
          disabled={!has}
        >
          Exportar relatório
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi
          label="Enviados"
          value={
            !has
              ? "—"
              : count((j) =>
                  ["enviado", "entregue", "lido", "respondido"].includes(String(j.status)),
                )
          }
        />
        <Kpi label="Entregues" value={na(count((j) => !!j.delivered_at), anyProvider)} />
        <Kpi label="Falhas" value={!has ? "—" : count((j) => j.status === "falhou")} />
        <Kpi label="Leituras" value={na(count((j) => !!j.read_at), anyProvider)} />
        <Kpi label="Respostas" value={na(count((j) => !!j.replied_at), anyProvider)} />
        <Kpi label="Descadastros" value={optOuts} />
      </div>

      {campaigns.length === 0 ? (
        <EmptyState
          title="Nenhuma campanha criada"
          description="Use a aba Nova campanha para montar o público e escrever a mensagem."
        />
      ) : (
        <div className="space-y-2">
          {campaigns.map((c) => {
            const mine = jobs.filter((j) => j.campaign_id === c.id);
            return (
              <div key={c.id} className="surface-card flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-[220px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{c.name}</span>
                    <StatusBadge status={c.status} />
                    {(c.channels ?? []).map((ch: Channel) => (
                      <Badge key={ch} variant="outline">
                        {CHANNEL_LABELS[ch]}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {c.objective || "Sem objetivo descrito"} ·{" "}
                    {c.scheduled_at ? `agendada para ${formatDateTime(c.scheduled_at)}` : "sem agendamento"} ·{" "}
                    {mine.length} mensagens na fila
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {canManage && c.status === "rascunho" && (
                    <Button size="sm" variant="outline" onClick={() => setStatus(c, "aguardando_aprovacao")}>
                      Enviar para aprovação
                    </Button>
                  )}
                  {canManage && c.status === "aguardando_aprovacao" && (
                    <Button
                      size="sm"
                      onClick={() =>
                        setStatus(c, "agendada", { approved_at: new Date().toISOString() })
                      }
                    >
                      <ShieldCheck className="mr-1 size-4" /> Aprovar
                    </Button>
                  )}
                  {canManage && ["agendada", "executando"].includes(c.status) && (
                    <Button size="sm" onClick={() => dispatch(c)} disabled={busy === c.id}>
                      {busy === c.id ? (
                        <Loader2 className="mr-1 size-4 animate-spin" />
                      ) : (
                        <Play className="mr-1 size-4" />
                      )}
                      Disparar lote
                    </Button>
                  )}
                  {canManage && c.status === "executando" && (
                    <Button size="sm" variant="outline" onClick={() => setStatus(c, "pausada")}>
                      <Pause className="mr-1 size-4" /> Pausar
                    </Button>
                  )}
                  {canManage && c.status === "pausada" && (
                    <Button size="sm" variant="outline" onClick={() => setStatus(c, "executando")}>
                      <Play className="mr-1 size-4" /> Retomar
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => duplicate(c)} aria-label="Duplicar">
                    <Copy className="size-4" />
                  </Button>
                  {canManage && !["cancelada", "concluida"].includes(c.status) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setCancelling(c);
                        setReason("");
                      }}
                      aria-label="Cancelar"
                    >
                      <X className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!cancelling} onOpenChange={(o) => !o && setCancelling(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar campanha</DialogTitle>
            <DialogDescription>
              As mensagens que ainda não saíram serão canceladas. Escreva o motivo.
            </DialogDescription>
          </DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelling(null)}>
              Voltar
            </Button>
            <Button
              disabled={!reason.trim()}
              onClick={async () => {
                const c = cancelling;
                setCancelling(null);
                await supabase
                  .from("message_jobs")
                  .update({ status: "cancelado" })
                  .eq("campaign_id", c.id)
                  .in("status", ["na_fila", "falhou"]);
                await setStatus(c, "cancelada", { cancel_reason: reason.trim() });
              }}
            >
              Confirmar cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------------------- nova campanha ------------------------------ */

function CampaignBuilder({
  canManage,
  userId,
  providers,
  onSaved,
}: {
  canManage: boolean;
  userId: string | null;
  providers: any;
  onSaved: () => void;
}) {
  const { products } = useProductScope();
  const { people } = usePeople();
  const testFn = useServerFn(sendTestMessage);

  const [name, setName] = useState("");
  const [objective, setObjective] = useState("");
  const [channels, setChannels] = useState<Channel[]>(["whatsapp"]);
  const [fallback, setFallback] = useState<string>("nenhum");
  const [occasion, setOccasion] = useState<string>("pontual");
  const [recurring, setRecurring] = useState(false);
  const [waitMinutes, setWaitMinutes] = useState(0);
  const [scheduledAt, setScheduledAt] = useState("");
  const [quietStart, setQuietStart] = useState("21:00");
  const [quietEnd, setQuietEnd] = useState("08:00");
  const [sender, setSender] = useState("");
  const [subject, setSubject] = useState(OCCASION_TEMPLATES["pontual"]!.subject);
  const [body, setBody] = useState(OCCASION_TEMPLATES["pontual"]!.body);
  const [link, setLink] = useState("");
  const [mediaPath, setMediaPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [filters, setFilters] = useState<AudienceFilters>({ birthday: "todos" });
  const [testOpen, setTestOpen] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testChannel, setTestChannel] = useState<Channel>("whatsapp");
  const [testConfirm, setTestConfirm] = useState(false);
  const [waAccount, setWaAccount] = useState("");

  // contas de WhatsApp conectadas que podem enviar a campanha
  const waAccounts = useQuery({
    queryKey: ["campaign-wa-accounts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_accounts")
        .select("id,display_name,product_id")
        .is("deleted_at", null)
        .eq("connection_status", "conectado")
        .order("display_name");
      return data ?? [];
    },
  });

  const productNames = useMemo(
    () => Object.fromEntries(products.map((p) => [p.id, p.name])),
    [products],
  );
  const sellerNames = useMemo(
    () => Object.fromEntries(people.map((p) => [p.id, p.name])),
    [people],
  );

  const audience = useAudience({ filters, channels, productNames, sellerNames });
  const eligible = audience.data?.eligible ?? [];
  const blocked = audience.data?.blocked ?? [];

  const company = useQuery({
    queryKey: ["company-name"],
    queryFn: async () => {
      const { data } = await supabase.from("company_settings").select("*").limit(1).maybeSingle();
      return (data as any)?.name ?? (data as any)?.trade_name ?? "OS";
    },
  });

  function applyOccasion(value: string) {
    setOccasion(value);
    const tpl = OCCASION_TEMPLATES[value];
    if (tpl) {
      setSubject(tpl.subject);
      setBody(tpl.body);
    }
  }

  async function uploadMedia(file: File) {
    if (file.size > 20 * 1024 * 1024)
      return void toast.error("O anexo deve ter no máximo 20 MB.");
    setUploading(true);
    try {
      const path = `campanhas/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const { client } = await authenticatedFileClient();
      const { error } = await client.storage.from(BUCKET).upload(path, file);
      if (error) throw error;
      setMediaPath(path);
      toast.success("Anexo enviado.");
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível enviar o anexo.");
    } finally {
      setUploading(false);
    }
  }

  const save = useMutation({
    mutationFn: async (status: CampaignStatus) => {
      if (!name.trim()) throw new Error("Dê um nome para a campanha.");
      if (!channels.length) throw new Error("Escolha pelo menos um canal.");
      if (!body.trim()) throw new Error("Escreva a mensagem.");
      if (channels.includes("email") && !subject.trim())
        throw new Error("O e-mail precisa de um assunto.");

      // Uma única operação no servidor cria campanha, fluxo, etapas,
      // destinatários e fila — sem deixar dados pela metade.
      const { data: created, error } = await supabase.rpc("campaigns_create" as any, {
        p: {
          name: name.trim(),
          objective: objective.trim() || null,
          channels,
          fallback_channel: fallback === "nenhum" ? null : fallback,
          product_id:
            filters.productId && filters.productId !== "todos" ? filters.productId : null,
          filters: filters as any,
          sender: sender.trim() || null,
          subject: subject.trim() || null,
          body,
          link: link.trim() || null,
          attachments: mediaPath ? [{ path: mediaPath }] : [],
          media_path: mediaPath || null,
          occasion,
          recurring,
          recurrence: recurring ? "mensal" : null,
          scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          quiet_start: quietStart,
          quiet_end: quietEnd,
          steps: channels.map((ch, i) => ({
            position: i + 1,
            channel: ch,
            fallback_channel: fallback === "nenhum" ? null : fallback,
            subject: ch === "email" ? subject : null,
            body,
            wait_minutes: i === 0 ? 0 : waitMinutes,
          })),
        } as any,
      });
      if (error) throw error;
      const campaignId = (created as any)?.id as string;

      if (channels.includes("whatsapp")) {
        if (!waAccount) throw new Error("Escolha o WhatsApp que vai enviar a campanha.");
        const { error: aErr } = await supabase
          .from("campaigns")
          .update({ whatsapp_account_id: waAccount } as any)
          .eq("id", campaignId);
        if (aErr) throw aErr;
      }

      if (status !== "rascunho") {
        const { error: sErr } = await supabase.rpc("campaigns_set_status" as any, {
          p_campaign_id: campaignId,
          p_status: status,
          p_reason: null,
        });
        if (sErr) throw sErr;
      }

      await supabase.from("audit_logs").insert({
        user_id: userId,
        entity: "campaigns",
        action: status === "rascunho" ? "criou rascunho" : "enviou para aprovação",
        entity_id: campaignId,
        details: { name, channels, destinatarios: eligible.length, bloqueados: blocked.length },
      });

      return campaignId;
    },
    onSuccess: () => onSaved(),
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível salvar."),
  });

  const previewContact = eligible[0] ?? blocked[0];

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <div className="surface-card space-y-3 p-4">
          <h2 className="font-medium">1. Campanha</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="camp-nome">Nome</Label>
              <Input id="camp-nome" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            </div>
            <div>
              <Label htmlFor="camp-obj">Objetivo</Label>
              <Input
                id="camp-obj"
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                maxLength={200}
                placeholder="Ex.: reativar clientes do último trimestre"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-sm text-muted-foreground">Canais:</span>
            {CHANNELS.map((ch) => (
              <label key={ch} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={channels.includes(ch)}
                  onCheckedChange={(v) =>
                    setChannels((prev) => (v ? [...prev, ch] : prev.filter((c) => c !== ch)))
                  }
                />
                {CHANNEL_LABELS[ch]}
                {providers?.[ch]?.configured === false && (
                  <Badge variant="outline" className="text-[10px]">
                    não configurado
                  </Badge>
                )}
              </label>
            ))}
          </div>
          {channels.includes("whatsapp") && (
            <div className="max-w-md">
              <Label>WhatsApp que vai enviar</Label>
              <Select value={waAccount} onValueChange={setWaAccount}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha uma conta conectada" />
                </SelectTrigger>
                <SelectContent>
                  {(waAccounts.data ?? []).map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(waAccounts.data ?? []).length === 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Nenhum WhatsApp conectado. Conecte uma conta na aba Contas WhatsApp.
                </p>
              )}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>Ocasião / fluxo pronto</Label>
              <Select value={occasion} onValueChange={applyOccasion}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OCCASIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Canal alternativo se falhar</Label>
              <Select value={fallback} onValueChange={setFallback}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">Nenhum</SelectItem>
                  {CHANNELS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CHANNEL_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="espera">Espera entre etapas (min)</Label>
              <Input
                id="espera"
                type="number"
                min={0}
                value={waitMinutes}
                onChange={(e) => setWaitMinutes(Number(e.target.value) || 0)}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={recurring} onCheckedChange={(v) => setRecurring(!!v)} />
            Fluxo recorrente (repete conforme a ocasião)
          </label>
        </div>

        <div className="surface-card space-y-3 p-4">
          <h2 className="font-medium">2. Público</h2>
          <AudienceFiltersForm
            filters={filters}
            setFilters={setFilters}
            products={products}
            people={people}
          />
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {audience.isLoading ? (
              <span className="text-muted-foreground">Calculando público…</span>
            ) : (
              <>
                <Badge>{eligible.length} destinatários</Badge>
                <Badge variant="outline">{blocked.length} bloqueados</Badge>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    downloadCsv(
                      "publico-campanha",
                      [...eligible, ...blocked].map((c) => ({
                        nome: c.name,
                        telefone: c.phone ?? "",
                        email: c.email ?? "",
                        canais: c.channels.join(", "),
                        bloqueio: c.blockedReason ?? "",
                      })),
                    )
                  }
                  disabled={!eligible.length && !blocked.length}
                >
                  Exportar prévia
                </Button>
              </>
            )}
          </div>
          <div className="max-h-56 overflow-y-auto rounded-lg border">
            {[...eligible, ...blocked].slice(0, 100).map((c) => (
              <div key={c.customerId} className="flex items-center justify-between gap-2 border-b px-3 py-2 text-sm last:border-0">
                <span className="truncate">{c.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {c.phone ?? c.email ?? "sem contato"}
                </span>
                {c.channels.length ? (
                  <Badge variant="outline">{c.channels.map((x) => CHANNEL_LABELS[x]).join(" · ")}</Badge>
                ) : (
                  <Badge variant="destructive">{c.blockedReason}</Badge>
                )}
              </div>
            ))}
            {!eligible.length && !blocked.length && !audience.isLoading && (
              <p className="p-4 text-center text-sm text-muted-foreground">
                Nenhum cliente encontrado com esses filtros.
              </p>
            )}
          </div>
        </div>

        <div className="surface-card space-y-3 p-4">
          <h2 className="font-medium">3. Mensagem</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="remetente">Remetente</Label>
              <Input id="remetente" value={sender} onChange={(e) => setSender(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="assunto">Assunto (e-mail)</Label>
              <Input id="assunto" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="texto">Texto</Label>
            <Textarea
              id="texto"
              rows={7}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={4000}
            />
            <div className="mt-2 flex flex-wrap gap-1">
              {VARIABLES.map((v) => (
                <Button
                  key={v.key}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setBody((b) => `${b}{{${v.key}}}`)}
                >
                  {v.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="link">Link da campanha</Label>
              <Input
                id="link"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://"
              />
            </div>
            <div>
              <Label htmlFor="anexo">Anexo (imagem, vídeo ou áudio)</Label>
              <Input
                id="anexo"
                type="file"
                accept="image/*,video/*,audio/*"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadMedia(f);
                }}
              />
              {mediaPath && <p className="mt-1 text-xs text-muted-foreground">Anexo salvo.</p>}
            </div>
          </div>
        </div>

        <div className="surface-card space-y-3 p-4">
          <h2 className="font-medium">4. Agendamento</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="quando">Data e hora (America/Sao_Paulo)</Label>
              <Input
                id="quando"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="qs">Silêncio a partir de</Label>
              <Input id="qs" type="time" value={quietStart} onChange={(e) => setQuietStart(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="qe">Silêncio até</Label>
              <Input id="qe" type="time" value={quietEnd} onChange={(e) => setQuietEnd(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => save.mutate("rascunho")} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Plus className="mr-1 size-4" />}
              Salvar rascunho
            </Button>
            <Button
              variant="outline"
              onClick={() => save.mutate("aguardando_aprovacao")}
              disabled={save.isPending}
            >
              <CheckCircle2 className="mr-1 size-4" /> Enviar para aprovação
            </Button>
            <Button variant="outline" onClick={() => setTestOpen(true)}>
              <Send className="mr-1 size-4" /> Mensagem de teste
            </Button>
          </div>
          {!canManage && (
            <p className="text-xs text-muted-foreground">
              Você pode preparar a campanha; a fila de envio é montada por um administrador ou gestor.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="surface-card p-4">
          <h2 className="mb-2 font-medium">Prévia por canal</h2>
          {CHANNELS.filter((c) => channels.includes(c)).map((ch) => (
            <div key={ch} className="mb-3 rounded-lg border p-3">
              <p className="mb-1 text-xs font-medium text-muted-foreground">{CHANNEL_LABELS[ch]}</p>
              {ch === "email" && (
                <p className="mb-1 text-sm font-medium">
                  {renderMessage(subject, previewContact ?? {}, { empresa: company.data, link })}
                </p>
              )}
              <p className="whitespace-pre-wrap text-sm">
                {renderMessage(body, previewContact ?? {}, { empresa: company.data, link })}
              </p>
              {ch === "email" && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Todo e-mail sai com link de descadastro automático.
                </p>
              )}
              {ch === "whatsapp" && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  O envio sai pelo WhatsApp conectado escolhido acima, respeitando consentimento e
                  horário silencioso.
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar mensagem de teste</DialogTitle>
            <DialogDescription>
              O teste só sai com o provedor configurado e com a sua confirmação.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={testChannel} onValueChange={(v) => setTestChannel(v as Channel)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHANNELS.map((c) => (
                  <SelectItem key={c} value={c} disabled={!providers?.[c]?.configured}>
                    {CHANNEL_LABELS[c]}
                    {providers?.[c]?.configured ? "" : " — não configurado"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="Telefone com DDI ou e-mail"
            />
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={testConfirm} onCheckedChange={(v) => setTestConfirm(!!v)} />
              Confirmo o envio real desta mensagem de teste.
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!testConfirm || !testTo.trim() || !providers?.[testChannel]?.configured}
              onClick={async () => {
                try {
                  await testFn({
                    data: {
                      channel: testChannel,
                      to: testTo.trim(),
                      subject,
                      body: renderMessage(body, previewContact ?? {}, {
                        empresa: company.data,
                        link,
                      }),
                      confirm: true,
                    },
                  });
                  toast.success("Teste enviado.");
                  setTestOpen(false);
                } catch (e: any) {
                  toast.error(e?.message ?? "Não foi possível enviar o teste.");
                }
              }}
            >
              Enviar teste
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AudienceFiltersForm({
  filters,
  setFilters,
  products,
  people,
}: {
  filters: AudienceFilters;
  setFilters: (f: AudienceFilters) => void;
  products: any[];
  people: any[];
}) {
  const set = (patch: Partial<AudienceFilters>) => setFilters({ ...filters, ...patch });
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <Label>Produto / área</Label>
        <Select value={filters.productId ?? "todos"} onValueChange={(v) => set({ productId: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas</SelectItem>
            {products.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Vendedor</Label>
        <Select value={filters.sellerId ?? "todos"} onValueChange={(v) => set({ sellerId: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            {people.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Gênero</Label>
        <Select value={filters.gender ?? "todos"} onValueChange={(v) => set({ gender: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="feminino">Feminino</SelectItem>
            <SelectItem value="masculino">Masculino</SelectItem>
            <SelectItem value="outro">Outro</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Aniversário</Label>
        <Select
          value={filters.birthday ?? "todos"}
          onValueChange={(v) => set({ birthday: v as any })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Qualquer data</SelectItem>
            <SelectItem value="hoje">Aniversariantes de hoje</SelectItem>
            <SelectItem value="mes">Aniversariantes do mês</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="idade-min">Idade mínima</Label>
        <Input
          id="idade-min"
          type="number"
          min={0}
          value={filters.ageMin ?? ""}
          onChange={(e) => set({ ageMin: e.target.value ? Number(e.target.value) : null })}
        />
      </div>
      <div>
        <Label htmlFor="idade-max">Idade máxima</Label>
        <Input
          id="idade-max"
          type="number"
          min={0}
          value={filters.ageMax ?? ""}
          onChange={(e) => set({ ageMax: e.target.value ? Number(e.target.value) : null })}
        />
      </div>
      <div>
        <Label htmlFor="pais">País</Label>
        <Input id="pais" value={filters.country ?? ""} onChange={(e) => set({ country: e.target.value })} />
      </div>
      <div>
        <Label htmlFor="uf">Estado / região</Label>
        <Input id="uf" value={filters.state ?? ""} onChange={(e) => set({ state: e.target.value })} />
      </div>
      <div>
        <Label htmlFor="cidade">Cidade</Label>
        <Input id="cidade" value={filters.city ?? ""} onChange={(e) => set({ city: e.target.value })} />
      </div>
      <div>
        <Label htmlFor="origem">Origem</Label>
        <Input id="origem" value={filters.origin ?? ""} onChange={(e) => set({ origin: e.target.value })} />
      </div>
      <div>
        <Label htmlFor="situacao">Situação</Label>
        <Input id="situacao" value={filters.status ?? ""} onChange={(e) => set({ status: e.target.value })} />
      </div>
      <div>
        <Label htmlFor="tags">Tags (separadas por vírgula)</Label>
        <Input
          id="tags"
          value={(filters.tags ?? []).join(", ")}
          onChange={(e) =>
            set({
              tags: e.target.value
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
            })
          }
        />
      </div>
    </div>
  );
}

/* --------------------------- consentimentos ------------------------------ */

function ConsentManager({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [supChannel, setSupChannel] = useState<Channel>("email");
  const [supAddress, setSupAddress] = useState("");

  const customers = useQuery({
    queryKey: ["consent-customers", search],
    queryFn: async () => {
      let q = supabase.from("customers").select("id,name,phone,whatsapp,email").is("deleted_at", null).limit(50);
      if (search.trim()) q = q.ilike("name", `%${search.trim()}%`);
      const { data } = await q.order("name");
      return data ?? [];
    },
  });

  const consents = useQuery({
    queryKey: ["consents"],
    queryFn: async () => {
      const { data } = await supabase.from("message_consents").select("*");
      return data ?? [];
    },
  });

  const suppression = useQuery({
    queryKey: ["suppression"],
    queryFn: async () => {
      const { data } = await supabase
        .from("message_suppression")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
  });

  async function toggle(customerId: string, channel: Channel, optIn: boolean) {
    if (!canManage) {
      toast.error("Somente administradores e gestores registram consentimento.");
      return;
    }
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("message_consents").upsert(
      {
        customer_id: customerId,
        channel,
        status: optIn ? "opt_in" : "opt_out",
        source: "cadastro manual no sistema",
        legal_basis: optIn ? "consentimento do titular (LGPD art. 7º, I)" : "revogação do titular",
        evidence: `Registrado manualmente em ${new Date().toLocaleString("pt-BR")}`,
        created_by: auth?.user?.id ?? null,
        consented_at: optIn ? new Date().toISOString() : null,
        revoked_at: optIn ? null : new Date().toISOString(),
      },
      { onConflict: "customer_id,channel" },
    );
    if (error) toast.error(error.message);
    else {
      queryClient.invalidateQueries({ queryKey: ["consents"] });
      queryClient.invalidateQueries({ queryKey: ["campaign-audience"] });
    }
  }

  const consentOf = (customerId: string, channel: Channel) =>
    (consents.data ?? []).find((c: any) => c.customer_id === customerId && c.channel === channel);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="surface-card p-4">
        <h2 className="mb-2 font-medium">Consentimento por canal</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Só entram na campanha os clientes com aceite registrado no canal, com data e origem do
          opt-in. Quem descadastra fica bloqueado automaticamente.
        </p>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar cliente pelo nome"
          className="mb-3"
        />
        <div className="max-h-[420px] overflow-y-auto rounded-lg border">
          {(customers.data ?? []).map((c: any) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 border-b px-3 py-2 text-sm last:border-0">
              <span className="min-w-[160px] flex-1 truncate">{c.name}</span>
              {CHANNELS.map((ch) => {
                const rec = consentOf(c.id, ch);
                const optIn = rec?.status === "opt_in";
                return (
                  <label key={ch} className="flex items-center gap-1 text-xs">
                    <Checkbox checked={!!optIn} onCheckedChange={(v) => toggle(c.id, ch, !!v)} />
                    {CHANNEL_LABELS[ch]}
                    {rec?.consented_at && (
                      <span className="text-muted-foreground">({formatDateTime(rec.consented_at)})</span>
                    )}
                  </label>
                );
              })}
            </div>
          ))}
          {!(customers.data ?? []).length && (
            <p className="p-4 text-center text-sm text-muted-foreground">Nenhum cliente encontrado.</p>
          )}
        </div>
      </div>

      <div className="surface-card p-4">
        <h2 className="mb-2 font-medium">Lista de supressão</h2>
        <div className="flex gap-2">
          <Select value={supChannel} onValueChange={(v) => setSupChannel(v as Channel)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHANNELS.map((c) => (
                <SelectItem key={c} value={c}>
                  {CHANNEL_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={supAddress}
            onChange={(e) => setSupAddress(e.target.value)}
            placeholder="telefone ou e-mail"
          />
          <Button
            disabled={!canManage || !supAddress.trim()}
            onClick={async () => {
              const { error } = await supabase
                .from("message_suppression")
                .insert({ channel: supChannel, address: supAddress.trim(), reason: "bloqueio manual" });
              if (error) toast.error(error.message);
              else {
                setSupAddress("");
                queryClient.invalidateQueries({ queryKey: ["suppression"] });
                queryClient.invalidateQueries({ queryKey: ["campaign-audience"] });
              }
            }}
          >
            <Plus className="size-4" />
          </Button>
        </div>
        <div className="mt-3 max-h-[360px] overflow-y-auto">
          {(suppression.data ?? []).map((s: any) => (
            <div key={s.id} className="flex items-center justify-between gap-2 border-b py-2 text-sm last:border-0">
              <span className="truncate">
                {CHANNEL_LABELS[s.channel as Channel]} · {s.address}
              </span>
              {canManage && (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Remover"
                  onClick={async () => {
                    await supabase.from("message_suppression").delete().eq("id", s.id);
                    queryClient.invalidateQueries({ queryKey: ["suppression"] });
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          ))}
          {!(suppression.data ?? []).length && (
            <p className="py-4 text-center text-sm text-muted-foreground">Nenhum contato bloqueado.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- modelos --------------------------------- */

function TemplatesManager() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<Channel>("whatsapp");
  const [occasion, setOccasion] = useState("aniversario");
  const [body, setBody] = useState(OCCASION_TEMPLATES["aniversario"]!.body);

  const templates = useQuery({
    queryKey: ["campaign-templates"],
    queryFn: async () => {
      const { data } = await supabase
        .from("campaign_templates")
        .select("*")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <div className="surface-card space-y-3 p-4">
        <h2 className="font-medium">Novo modelo</h2>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do modelo" />
        <Select value={channel} onValueChange={(v) => setChannel(v as Channel)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CHANNELS.map((c) => (
              <SelectItem key={c} value={c}>
                {CHANNEL_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={occasion}
          onValueChange={(v) => {
            setOccasion(v);
            if (OCCASION_TEMPLATES[v]) setBody(OCCASION_TEMPLATES[v]!.body);
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OCCASIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
        <Button
          disabled={!name.trim() || !body.trim()}
          onClick={async () => {
            const { error } = await supabase
              .from("campaign_templates")
              .insert({ name: name.trim(), channel, occasion, body });
            if (error) toast.error(error.message);
            else {
              setName("");
              toast.success("Modelo salvo.");
              queryClient.invalidateQueries({ queryKey: ["campaign-templates"] });
            }
          }}
        >
          Salvar modelo
        </Button>
      </div>

      <div className="space-y-2">
        {(templates.data ?? []).map((t: any) => (
          <div key={t.id} className="surface-card p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{t.name}</span>
              <Badge variant="outline">{CHANNEL_LABELS[t.channel as Channel]}</Badge>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{t.body}</p>
          </div>
        ))}
        {!(templates.data ?? []).length && (
          <EmptyState title="Nenhum modelo salvo" description="Crie modelos para reaproveitar textos." />
        )}
      </div>
    </div>
  );
}
