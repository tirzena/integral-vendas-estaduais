/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Archive,
  ExternalLink,
  Image,
  Info,
  Loader2,
  MessageSquarePlus,
  Mic,
  NotebookPen,
  Paperclip,
  Pencil,
  Pin,
  Send,
  Star,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { authenticatedFileClient } from "@/lib/authenticated-storage";
import { useProductScope } from "@/hooks/useProductScope";
import { useCurrentUser } from "@/hooks/useAuth";
import { formatDateTime } from "@/lib/format";
import { formatPhoneBr, maskPhone, messageStatusLabel } from "@/lib/whatsapp";
import {
  deleteWhatsappMessageForEveryone,
  assignWhatsappConversation,
  favoriteWhatsappMessage,
  sendWhatsappMessage,
  startWhatsappConversation,
  updateWhatsappConversation,
} from "@/lib/whatsapp.functions";
import { ChatAttachment } from "@/components/chat/ChatAttachment";
import { EmptyState } from "@/components/common/PageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/atendimentos/")({
  component: Inbox,
});

function Inbox() {
  const { productId } = useProductScope();
  const { userId } = useCurrentUser();
  const queryClient = useQueryClient();
  const send = useServerFn(sendWhatsappMessage);
  const deleteForEveryone = useServerFn(deleteWhatsappMessageForEveryone);
  const updateConversation = useServerFn(updateWhatsappConversation);
  const assignConversation = useServerFn(assignWhatsappConversation);
  const favoriteMessage = useServerFn(favoriteWhatsappMessage);
  const startConversation = useServerFn(startWhatsappConversation);

  const [selected, setSelected] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [accountFilter, setAccountFilter] = useState("todas");
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [newContactOpen, setNewContactOpen] = useState(false);
  const [newContact, setNewContact] = useState({ accountId: "", phone: "", name: "" });
  const [startingContact, setStartingContact] = useState(false);

  const { data: accounts } = useQuery({
    queryKey: ["wa-accounts-inbox"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("whatsapp_accounts")
        .select("id,display_name,phone_e164,display_phone_number,connection_status,product_id,product_ids")
        .is("deleted_at", null)
        .order("display_name");
      return data ?? [];
    },
  });

  const { data: conversations } = useQuery({
    queryKey: ["wa-conversations", productId, accountFilter, onlyUnread, accounts],
    queryFn: async () => {
      let q = supabase
        .from("whatsapp_conversations")
        .select("*, customers(name)")
        .order("last_message_at", { ascending: false, nullsFirst: false });
      if (productId !== "todos") {
        const accountIds = (accounts ?? [])
          .filter((account: any) => (account.product_ids?.length ? account.product_ids : [account.product_id]).includes(productId))
          .map((account: any) => account.id);
        q = accountIds.length
          ? q.or(`product_id.eq.${productId},account_id.in.(${accountIds.join(",")})`)
          : q.eq("product_id", productId);
      }
      if (accountFilter !== "todas") q = q.eq("account_id", accountFilter);
      if (onlyUnread) q = q.gt("unread_count", 0);
      const { data } = await q.limit(200);
      return data ?? [];
    },
  });

  const { data: messages } = useQuery({
    queryKey: ["wa-messages", selected],
    enabled: !!selected,
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_messages")
        .select("*")
        .eq("conversation_id", selected!)
        .order("created_at");
      return data ?? [];
    },
  });

  // atualização ao vivo de mensagens, conversas e contas
  useEffect(() => {
    const channel = supabase
      .channel("wa-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_messages" }, () => {
        queryClient.invalidateQueries({ queryKey: ["wa-messages"] });
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_conversations" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["wa-conversations"] });
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_accounts" }, () => {
        queryClient.invalidateQueries({ queryKey: ["wa-accounts-inbox"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const accountsById = useMemo(
    () => Object.fromEntries((accounts ?? []).map((a: any) => [a.id, a])),
    [accounts],
  );
  const current = useMemo(
    () => (conversations ?? []).find((c: any) => c.id === selected) ?? null,
    [conversations, selected],
  );
  const { data: eligibleAssignees } = useQuery({
    queryKey: ["wa-team-assignees", selected],
    enabled: !!selected,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("whatsapp_team_assignees", {
        _conversation_id: selected,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
  const currentReferral =
    current?.referral && typeof current.referral === "object" && !Array.isArray(current.referral)
      ? (current.referral as Record<string, string>)
      : null;
  const currentAccount = current?.account_id ? accountsById[current.account_id] : null;
  const canSend = currentAccount?.connection_status === "conectado";
  const anyConnected = (accounts ?? []).some((a: any) => a.connection_status === "conectado");

  const assignmentMutation = useMutation({
    mutationFn: (assigneeId: string) =>
      assignConversation({ data: { conversationId: selected!, assigneeId } }),
    onSuccess: () => {
      toast.success("Responsável atualizado.");
      queryClient.invalidateQueries({ queryKey: ["wa-conversations"] });
      queryClient.invalidateQueries({ queryKey: ["wa-team-assignees", selected] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível transferir o contato."),
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      let mediaPath: string | null = null;
      if (attachment) {
        if (attachment.size > 20 * 1024 * 1024)
          throw new Error("O anexo deve ter no máximo 20 MB.");
        const path = `${userId}/${crypto.randomUUID()}-${attachment.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { client } = await authenticatedFileClient();
        const { error } = await client.storage.from("chat-anexos").upload(path, attachment);
        if (error) throw new Error(error.message || "Não foi possível preparar o arquivo.");
        mediaPath = path;
      }
      return send({
        data: {
          conversationId: selected!,
          text: text.trim(),
          mediaPath,
          mediaMime: attachment?.type ?? null,
          mediaName: attachment?.name ?? null,
          mediaSize: attachment?.size ?? null,
          idempotencyKey: crypto.randomUUID(),
        },
      });
    },
    onSuccess: () => {
      setText("");
      setAttachment(null);
      queryClient.invalidateQueries({ queryKey: ["wa-messages", selected] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível enviar a mensagem."),
  });

  const conversationMutation = useMutation({
    mutationFn: (input: {
      action: "archive" | "pin" | "rename" | "delete" | "profile";
      value?: string | boolean;
    }) => updateConversation({ data: { conversationId: selected!, ...input } }),
    onSuccess: (_, input) => {
      queryClient.invalidateQueries({ queryKey: ["wa-conversations"] });
      if (input.action === "delete") setSelected(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível atualizar o atendimento."),
  });

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        setAttachment(new File([blob], `audio-${Date.now()}.webm`, { type: blob.type }));
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      toast.error("Não foi possível acessar o microfone.");
    }
  }

  const deleteMutation = useMutation({
    mutationFn: (messageId: string) => deleteForEveryone({ data: { messageId } }),
    onSuccess: () => {
      toast.success("Mensagem apagada para todos.");
      queryClient.invalidateQueries({ queryKey: ["wa-messages", selected] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível apagar a mensagem."),
  });

  async function saveNote(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim() || !selected) return;
    const { error } = await supabase.from("whatsapp_messages").insert({
      conversation_id: selected,
      account_id: current?.account_id ?? null,
      direction: "outbound",
      message_type: "text",
      body: note.trim(),
      sender_id: userId ?? null,
      is_internal_note: true,
      status: "registrado",
    });
    if (error) toast.error("Não foi possível salvar a nota interna.");
    else {
      setNote("");
      toast.success("Nota interna salva. Ela não é enviada ao cliente.");
      queryClient.invalidateQueries({ queryKey: ["wa-messages", selected] });
    }
  }

  async function beginContact() {
    setStartingContact(true);
    try {
      const result = await startConversation({ data: { ...newContact, ...(productId === "todos" ? {} : { productId }) } });
      await queryClient.invalidateQueries({ queryKey: ["wa-conversations"] });
      setSelected(result.id);
      setNewContactOpen(false);
      setNewContact({ accountId: "", phone: "", name: "" });
      toast.success("Atendimento iniciado. Escreva a primeira mensagem.");
    } catch (e:any) {
      toast.error(e?.message ?? "Não foi possível iniciar o atendimento.");
    } finally {
      setStartingContact(false);
    }
  }

  const list = [...(conversations ?? [])]
    .sort((a: any, b: any) => Number(Boolean(b.pinned_at)) - Number(Boolean(a.pinned_at)))
    .filter((c: any) => {
      if (showArchived !== Boolean(c.archived_at)) return false;
      if (!search.trim()) return true;
      const term = search.trim().toLowerCase();
      return (
        String(c.customers?.name ?? "")
          .toLowerCase()
          .includes(term) ||
        String(c.contact_name ?? "")
          .toLowerCase()
          .includes(term) ||
        String(c.contact_phone ?? "").includes(term.replace(/\D/g, ""))
      );
    });

  return (
    <div>
      {!anyConnected && (
        <Alert className="mb-4">
          <Info className="size-4" />
          <AlertTitle>Nenhum WhatsApp conectado</AlertTitle>
          <AlertDescription>
            Enquanto nenhuma conta estiver conectada, é possível consultar o histórico e registrar
            notas internas, mas nada é enviado ao cliente.
          </AlertDescription>
        </Alert>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => {
          const connected = (accounts ?? []).find((a:any) => a.connection_status === "conectado" && (productId === "todos" || (a.product_ids?.length ? a.product_ids : [a.product_id]).includes(productId)));
          setNewContact((old) => ({ ...old, accountId: old.accountId || connected?.id || "" }));
          setNewContactOpen(true);
        }} disabled={!anyConnected}>
          <MessageSquarePlus className="mr-2 size-4" /> Novo contato
        </Button>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou telefone"
          className="w-56"
        />
        <Button
          variant={showArchived ? "default" : "outline"}
          size="sm"
          onClick={() => setShowArchived((v) => !v)}
        >
          <Archive className="mr-2 size-4" /> {showArchived ? "Ver ativas" : "Arquivadas"}
        </Button>
        <Select value={accountFilter} onValueChange={setAccountFilter}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Conta" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as contas</SelectItem>
            {(accounts ?? []).map((a: any) => (
              <SelectItem key={a.id} value={a.id}>
                {a.display_name} · {maskPhone(a.phone_e164 ?? a.display_phone_number)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={onlyUnread ? "default" : "outline"}
          onClick={() => setOnlyUnread((v) => !v)}
        >
          Não lidas
        </Button>
      </div>

      <Dialog open={newContactOpen} onOpenChange={setNewContactOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Iniciar conversa no WhatsApp</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Conta que enviará a mensagem</Label><Select value={newContact.accountId} onValueChange={(v) => setNewContact((old) => ({ ...old, accountId: v }))}><SelectTrigger><SelectValue placeholder="Escolha a conta" /></SelectTrigger><SelectContent>{(accounts ?? []).filter((a:any) => a.connection_status === "conectado" && (productId === "todos" || (a.product_ids?.length ? a.product_ids : [a.product_id]).includes(productId))).map((a:any) => <SelectItem key={a.id} value={a.id}>{a.display_name} · {maskPhone(a.phone_e164 ?? a.display_phone_number)}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Número com código do país</Label><Input value={newContact.phone} onChange={(e) => setNewContact((old) => ({ ...old, phone: e.target.value }))} placeholder="Ex.: 595981123456" /></div>
            <div><Label>Nome (opcional)</Label><Input value={newContact.name} onChange={(e) => setNewContact((old) => ({ ...old, name: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setNewContactOpen(false)}>Cancelar</Button><Button onClick={() => void beginContact()} disabled={startingContact || !newContact.accountId || !newContact.phone.trim()}>{startingContact && <Loader2 className="mr-2 size-4 animate-spin" />} Abrir conversa</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid h-[calc(100dvh-12rem)] min-h-[480px] gap-4 lg:grid-cols-[320px_1fr]">
        <div className="surface-card h-full overflow-y-auto p-2">
          {list.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Nenhuma conversa por aqui ainda.
            </p>
          )}
          {list.map((c: any) => (
            <button
              key={c.id}
              onClick={() => {
                setSelected(c.id);
                if (!c.profile_picture_url && c.account_id) {
                  void updateConversation({
                    data: { conversationId: c.id, action: "profile" },
                  }).then(() => queryClient.invalidateQueries({ queryKey: ["wa-conversations"] }));
                }
              }}
              className={cn(
                "w-full rounded-lg p-3 text-left transition-colors hover:bg-muted",
                selected === c.id && "bg-muted",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2 truncate text-sm font-medium">
                  {c.profile_picture_url ? (
                    <img
                      src={c.profile_picture_url}
                      alt=""
                      className="size-8 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                      {String(c.contact_name ?? c.contact_phone)
                        .slice(0, 1)
                        .toUpperCase()}
                    </span>
                  )}
                  <span className="truncate">
                    {c.customers?.name || c.contact_name || c.contact_phone}
                  </span>
                  {c.pinned_at && <Pin className="size-3 shrink-0" />}
                </span>
                {c.unread_count > 0 && <Badge>{c.unread_count}</Badge>}
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {formatPhoneBr(c.contact_phone)} ·{" "}
                {c.last_message_at ? formatDateTime(c.last_message_at) : "Sem informação"}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                Entrou por: {accountsById[c.account_id]?.display_name ?? "Sem informação"}
              </p>
              {c.is_demo && (
                <Badge variant="outline" className="mt-1 text-[10px]">
                  Fictício
                </Badge>
              )}
            </button>
          ))}
        </div>

        <div className="surface-card flex h-full min-h-0 flex-col overflow-hidden">
          {!selected ? (
            <EmptyState
              title="Selecione uma conversa"
              description="Escolha um atendimento na lista ao lado para ver o histórico."
            />
          ) : (
            <>
              <div className="flex shrink-0 items-center gap-2 border-b p-3">
                {current?.profile_picture_url ? (
                  <img
                    src={current.profile_picture_url}
                    alt=""
                    className="size-10 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex size-10 items-center justify-center rounded-full bg-muted font-semibold">
                    {String(current?.contact_name ?? current?.contact_phone)
                      .slice(0, 1)
                      .toUpperCase()}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {current?.customers?.name || current?.contact_name || current?.contact_phone}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatPhoneBr(current?.contact_phone)}</p>
                </div>
                {(eligibleAssignees ?? []).length > 0 && (
                  <Select
                    value={current?.assignee_id ?? undefined}
                    onValueChange={(value) => assignmentMutation.mutate(value)}
                    disabled={assignmentMutation.isPending}
                  >
                    <SelectTrigger className="hidden w-52 md:flex" title="Responsável pelo contato">
                      <SelectValue placeholder="Definir responsável" />
                    </SelectTrigger>
                    <SelectContent>
                      {(eligibleAssignees ?? []).map((person: any) => (
                        <SelectItem key={person.id} value={person.id}>
                          {person.full_name || person.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  title="Editar nome"
                  onClick={() => {
                    const name = prompt(
                      "Nome do contato",
                      current?.customers?.name || current?.contact_name || "",
                    );
                    if (name) conversationMutation.mutate({ action: "rename", value: name });
                  }}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant={current?.pinned_at ? "secondary" : "ghost"}
                  title="Fixar"
                  onClick={() =>
                    conversationMutation.mutate({ action: "pin", value: !current?.pinned_at })
                  }
                >
                  <Pin className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  title={current?.archived_at ? "Desarquivar" : "Arquivar"}
                  onClick={() =>
                    conversationMutation.mutate({ action: "archive", value: !current?.archived_at })
                  }
                >
                  <Archive className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  title="Excluir atendimento"
                  onClick={() => {
                    if (
                      confirm(
                        "Excluir este contato da caixa de atendimento e todo o histórico local? O contato continuará no CRM.",
                      )
                    )
                      conversationMutation.mutate({ action: "delete" });
                  }}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
              {currentReferral && Object.keys(currentReferral).length > 0 && (
                <div className="border-b bg-blue-50 p-3 text-sm text-blue-950 dark:bg-blue-950/30 dark:text-blue-100">
                  <p className="font-semibold">Conversa iniciada por anúncio</p>
                  <p>{currentReferral["title"] ?? currentReferral["body"] ?? "Anúncio da Meta"}</p>
                  {currentReferral["sourceUrl"] && (
                    <a
                      className="mt-1 inline-flex items-center gap-1 text-xs underline"
                      href={currentReferral["sourceUrl"]}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ver anúncio <ExternalLink className="size-3" />
                    </a>
                  )}
                </div>
              )}
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
                {(messages ?? []).length === 0 && (
                  <p className="text-center text-sm text-muted-foreground">
                    Nenhuma mensagem nesta conversa.
                  </p>
                )}
                {(messages ?? []).map((m: any) => (
                  <div
                    key={m.id}
                    className={cn(
                      "max-w-[75%] rounded-xl px-3 py-2 text-sm",
                      m.direction === "outbound"
                        ? "ml-auto bg-primary text-primary-foreground"
                        : "bg-muted",
                      m.is_internal_note && "border border-dashed",
                    )}
                  >
                    {m.is_internal_note && (
                      <p className="mb-1 text-[10px] opacity-70">Nota interna</p>
                    )}
                    {m.media_url && (
                      <ChatAttachment
                        path={m.media_url}
                        type={
                          m.message_type === "image" || m.message_type === "sticker"
                            ? "imagem"
                            : m.message_type
                        }
                        name={m.media_meta?.fileName ?? null}
                      />
                    )}
                    <p className="whitespace-pre-wrap">
                      {m.status === "apagada"
                        ? "Mensagem apagada"
                        : (m.body ?? "(mensagem sem texto)")}
                    </p>
                    <p className="mt-1 text-[10px] opacity-70">
                      {formatDateTime(m.provider_timestamp ?? m.created_at)}
                      {m.direction === "outbound" && !m.is_internal_note
                        ? ` · ${messageStatusLabel(m.status)}`
                        : ""}
                    </p>
                    {m.error && <p className="mt-1 text-[10px] text-destructive">{m.error}</p>}
                    <button
                      type="button"
                      className="mt-1 mr-2 inline-flex items-center gap-1 text-[10px] opacity-70 hover:opacity-100"
                      onClick={() =>
                        void favoriteMessage({
                          data: { messageId: m.id, favorite: !m.is_favorite },
                        }).then(() =>
                          queryClient.invalidateQueries({ queryKey: ["wa-messages", selected] }),
                        )
                      }
                    >
                      <Star className={cn("size-3", m.is_favorite && "fill-current")} />{" "}
                      {m.is_favorite ? "Favorita" : "Favoritar"}
                    </button>
                    {m.direction === "outbound" &&
                      !m.is_internal_note &&
                      m.provider_message_id &&
                      m.status !== "apagada" && (
                        <button
                          type="button"
                          className="mt-1 inline-flex items-center gap-1 text-[10px] opacity-70 hover:opacity-100"
                          disabled={deleteMutation.isPending}
                          onClick={() => {
                            if (confirm("Apagar esta mensagem para todos no WhatsApp?"))
                              deleteMutation.mutate(m.id);
                          }}
                        >
                          <Trash2 className="size-3" /> Apagar para todos
                        </button>
                      )}
                  </div>
                ))}
              </div>

              <div className="space-y-3 border-t p-3">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (text.trim() || attachment) sendMutation.mutate();
                  }}
                  className="flex gap-2"
                >
                  <input
                    ref={fileRef}
                    type="file"
                    className="hidden"
                    accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip,.webp"
                    onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    title="Foto, figurinha ou arquivo"
                    disabled={!canSend}
                    onClick={() => fileRef.current?.click()}
                  >
                    <Paperclip className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant={recording ? "destructive" : "outline"}
                    title={recording ? "Parar gravação" : "Gravar áudio"}
                    disabled={!canSend}
                    onClick={() => void toggleRecording()}
                  >
                    <Mic className="size-4" />
                  </Button>
                  <Input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    maxLength={4000}
                    placeholder={
                      canSend
                        ? "Escreva a mensagem que será enviada ao cliente…"
                        : "Conecte o WhatsApp desta categoria para enviar"
                    }
                    disabled={!canSend}
                  />
                  <Button
                    type="submit"
                    disabled={!canSend || sendMutation.isPending || (!text.trim() && !attachment)}
                  >
                    {sendMutation.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                    <span className="ml-2 hidden sm:inline">Enviar mensagem</span>
                  </Button>
                </form>
                {attachment && (
                  <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-xs">
                    <span className="truncate">
                      {attachment.type.startsWith("image/") ? (
                        <Image className="mr-1 inline size-3" />
                      ) : null}
                      {attachment.name}
                    </span>
                    <button onClick={() => setAttachment(null)} className="text-destructive">
                      Remover
                    </button>
                  </div>
                )}

                <form onSubmit={saveNote} className="flex gap-2">
                  <Textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    placeholder="Adicionar nota interna (só a equipe vê)"
                  />
                  <Button type="submit" variant="outline" disabled={!note.trim()}>
                    <NotebookPen className="size-4" />
                    <span className="ml-2 hidden sm:inline">Nota interna</span>
                  </Button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

