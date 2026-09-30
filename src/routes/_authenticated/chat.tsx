/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  CornerUpLeft,
  Image as ImageIcon,
  Mic,
  Paperclip,
  Plus,
  Search,
  Send,
  Square,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { ChatAttachment, CHAT_BUCKET, Linkify } from "@/components/chat/ChatAttachment";
import { supabase } from "@/integrations/supabase/client";
import { authenticatedFileClient } from "@/lib/authenticated-storage";
import { useCurrentUser } from "@/hooks/useAuth";
import { usePeople } from "@/hooks/usePeople";
import { initials } from "@/lib/format";
import { PageHeader, EmptyState } from "@/components/common/PageHeader";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({
    meta: [
      { title: "Chat interno — OS" },
      { name: "description", content: "Conversas internas da equipe em tempo real." },
      { property: "og:title", content: "Chat interno — OS" },
      { property: "og:description", content: "Conversas internas da equipe em tempo real." },
    ],
  }),
  component: Chat,
});

function timeLabel(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function Chat() {
  const { userId } = useCurrentUser();
  const { people, nameOf } = usePeople();
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [term, setTerm] = useState("");
  const [replyTo, setReplyTo] = useState<any | null>(null);
  const [open, setOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  /* Conversas em que eu participo, com os membros de cada uma. */
  const { data: conversations } = useQuery({
    queryKey: ["chat-conversations", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: mine } = await supabase
        .from("internal_conversation_members")
        .select("conversation_id")
        .eq("user_id", userId!);
      const ids = (mine ?? []).map((m: any) => m.conversation_id);
      if (!ids.length) return [];
      const [{ data: convs }, { data: members }, { data: lastMessages }] = await Promise.all([
        supabase.from("internal_conversations").select("*").in("id", ids),
        supabase.from("internal_conversation_members").select("conversation_id,user_id").in("conversation_id", ids),
        supabase
          .from("internal_messages")
          .select("conversation_id,body,created_at,sender_id,deleted_at")
          .in("conversation_id", ids)
          .order("created_at", { ascending: false })
          .limit(400),
      ]);
      const lastByConv = new Map<string, any>();
      (lastMessages ?? []).forEach((m: any) => {
        if (!lastByConv.has(m.conversation_id)) lastByConv.set(m.conversation_id, m);
      });
      return (convs ?? [])
        .map((c: any) => ({
          ...c,
          members: (members ?? []).filter((m: any) => m.conversation_id === c.id).map((m: any) => m.user_id),
          last: lastByConv.get(c.id) ?? null,
        }))
        .sort(
          (a: any, b: any) =>
            new Date(b.last?.created_at ?? b.updated_at).getTime() -
            new Date(a.last?.created_at ?? a.updated_at).getTime(),
        );
    },
  });

  const list = conversations ?? [];

  function titleOf(c: any) {
    if (c.conversation_type === "direta") {
      const other = (c.members ?? []).find((id: string) => id !== userId);
      return nameOf(other) ?? "Conversa";
    }
    return c.name || "Grupo";
  }

  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase();
    if (!t) return list;
    return list.filter((c: any) => titleOf(c).toLowerCase().includes(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, term, people]);

  const current = list.find((c: any) => c.id === selected) ?? null;

  const { data: messages } = useQuery({
    queryKey: ["chat-messages", selected],
    enabled: !!selected,
    queryFn: async () => {
      const { data } = await supabase
        .from("internal_messages")
        .select("*, profiles:sender_id(full_name)")
        .eq("conversation_id", selected!)
        .order("created_at");
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel("chat-todas")
      .on("postgres_changes", { event: "*", schema: "public", table: "internal_messages" }, () => {
        queryClient.invalidateQueries({ queryKey: ["chat-conversations", userId] });
        queryClient.invalidateQueries({ queryKey: ["chat-messages"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, selected]);

  async function openDirect(personId: string) {
    const existing = list.find(
      (c: any) =>
        c.conversation_type === "direta" &&
        (c.members ?? []).length === 2 &&
        c.members.includes(personId) &&
        c.members.includes(userId),
    );
    if (existing) {
      setSelected(existing.id);
      setOpen(false);
      return;
    }
    const { data, error } = await supabase
      .from("internal_conversations")
      .insert({ conversation_type: "direta", name: null, created_by: userId ?? null })
      .select("id")
      .single();
    if (error || !data) {
      toast.error("Não foi possível iniciar a conversa.");
      return;
    }
    await supabase.from("internal_conversation_members").insert([
      { conversation_id: data.id, user_id: userId! },
      { conversation_id: data.id, user_id: personId },
    ]);
    await queryClient.invalidateQueries({ queryKey: ["chat-conversations", userId] });
    setSelected(data.id);
    setOpen(false);
  }

  async function createGroup() {
    if (!groupName.trim()) {
      toast.error("Dê um nome para o grupo.");
      return;
    }
    const { data, error } = await supabase
      .from("internal_conversations")
      .insert({ name: groupName.trim(), conversation_type: "grupo", created_by: userId ?? null })
      .select("id")
      .single();
    if (error || !data) {
      toast.error("Não foi possível criar o grupo.");
      return;
    }
    const ids = Array.from(new Set([userId!, ...groupMembers]));
    await supabase
      .from("internal_conversation_members")
      .insert(ids.map((id) => ({ conversation_id: data.id, user_id: id })));
    await queryClient.invalidateQueries({ queryKey: ["chat-conversations", userId] });
    setGroupName("");
    setGroupMembers([]);
    setOpen(false);
    setSelected(data.id);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || !selected) return;
    const body = text.trim();
    setText("");
    const { error } = await supabase.from("internal_messages").insert({
      conversation_id: selected,
      sender_id: userId ?? null,
      body,
      reply_to: replyTo?.id ?? null,
    });
    if (error) {
      toast.error("Não foi possível enviar a mensagem.");
      setText(body);
      return;
    }
    setReplyTo(null);
    await supabase
      .from("internal_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", selected);
    queryClient.invalidateQueries({ queryKey: ["chat-messages", selected] });
    queryClient.invalidateQueries({ queryKey: ["chat-conversations", userId] });
  }

  function kindOf(mime: string) {
    if (mime.startsWith("image/")) return "imagem";
    if (mime.startsWith("audio/")) return "audio";
    if (mime.startsWith("video/")) return "video";
    return "arquivo";
  }

  /* Envia imagem, áudio, vídeo ou documento como mensagem. */
  async function sendFile(file: File, name?: string) {
    if (!selected || !userId) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error("O arquivo precisa ter no máximo 20 MB.");
      return;
    }
    setUploading(true);
    try {
      const { client } = await authenticatedFileClient();
      const safe = (name ?? file.name).replace(/[^\w.-]+/g, "_");
      const path = `${userId}/${selected}/${Date.now()}-${safe}`;
      const { error: upErr } = await client.storage
        .from(CHAT_BUCKET)
        .upload(path, file, { contentType: file.type || "application/octet-stream" });
      if (upErr) throw upErr;
      const caption = text.trim();
      const { error } = await client.from("internal_messages").insert({
        conversation_id: selected,
        sender_id: userId,
        body: caption || null,
        attachment_url: path,
        attachment_type: kindOf(file.type || ""),
        attachment_name: name ?? file.name,
        reply_to: replyTo?.id ?? null,
      });
      if (error) {
        await client.storage.from(CHAT_BUCKET).remove([path]);
        throw error;
      }
      setText("");
      setReplyTo(null);
      await client
        .from("internal_conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", selected);
      queryClient.invalidateQueries({ queryKey: ["chat-messages", selected] });
      queryClient.invalidateQueries({ queryKey: ["chat-conversations", userId] });
    } catch (error: any) {
      toast.error(error?.message ?? "Não foi possível enviar o anexo.");
    } finally {
      setUploading(false);
    }
  }

  /* Grava um áudio pelo microfone e envia ao parar. */
  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const type = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        const ext = type.includes("mp4") ? "m4a" : "webm";
        await sendFile(new File([blob], `audio.${ext}`, { type }), `Áudio.${ext}`);
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      toast.error("Não foi possível acessar o microfone.");
    }
  }


  async function removeMessage(id: string) {
    const { error } = await supabase
      .from("internal_messages")
      .update({ deleted_at: new Date().toISOString(), body: null })
      .eq("id", id);
    if (error) toast.error("Não foi possível apagar a mensagem.");
    else queryClient.invalidateQueries({ queryKey: ["chat-messages", selected] });
  }

  const msgs = messages ?? [];

  return (
    <div>
      <PageHeader
        title="Chat interno"
        description="Converse com a equipe em tempo real, individualmente ou em grupos."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 size-4" /> Nova conversa
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <div className={cn("surface-card flex max-h-[72vh] flex-col", selected && "hidden lg:flex")}>
          <div className="relative border-b p-3">
            <Search className="absolute top-5.5 left-6 size-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar conversa…"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {filtered.length === 0 && (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Nenhuma conversa ainda. Toque em “Nova conversa” para falar com alguém da equipe.
              </p>
            )}
            {filtered.map((c: any) => (
              <button
                key={c.id}
                onClick={() => setSelected(c.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg p-2.5 text-left transition-colors hover:bg-muted",
                  selected === c.id && "bg-muted",
                )}
              >
                <Avatar className="size-9">
                  <AvatarFallback>
                    {c.conversation_type === "grupo" ? (
                      <Users className="size-4" />
                    ) : (
                      initials(titleOf(c))
                    )}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{titleOf(c)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.last?.deleted_at
                      ? "Mensagem apagada"
                      : (c.last?.body ?? "Nenhuma mensagem ainda")}
                  </p>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {timeLabel(c.last?.created_at ?? c.updated_at)}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div
          className={cn(
            "surface-card flex max-h-[72vh] min-h-[460px] flex-col",
            !selected && "hidden lg:flex",
          )}
        >
          {!current ? (
            <EmptyState
              title="Selecione uma conversa"
              description="Escolha alguém da equipe ou um grupo ao lado — ou crie uma nova conversa."
            />
          ) : (
            <>
              <div className="flex items-center gap-3 border-b p-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden"
                  aria-label="Voltar"
                  onClick={() => setSelected(null)}
                >
                  <ArrowLeft className="size-4" />
                </Button>
                <Avatar className="size-9">
                  <AvatarFallback>
                    {current.conversation_type === "grupo" ? (
                      <Users className="size-4" />
                    ) : (
                      initials(titleOf(current))
                    )}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate font-medium">{titleOf(current)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {current.conversation_type === "grupo"
                      ? (current.members ?? []).map((id: string) => nameOf(id)).join(", ")
                      : "Conversa direta"}
                  </p>
                </div>
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto p-4">
                {msgs.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground">
                    Nenhuma mensagem ainda. Comece a conversa.
                  </p>
                )}
                {msgs.map((m: any) => {
                  const mine = m.sender_id === userId;
                  const quoted = m.reply_to ? msgs.find((x: any) => x.id === m.reply_to) : null;
                  return (
                    <div
                      key={m.id}
                      className={cn("group flex items-end gap-2", mine && "flex-row-reverse")}
                    >
                      <div
                        className={cn(
                          "max-w-[75%] rounded-2xl px-3 py-2 text-sm",
                          mine
                            ? "rounded-br-sm bg-primary text-primary-foreground"
                            : "rounded-bl-sm bg-muted text-foreground",
                        )}
                      >
                        {!mine && current.conversation_type === "grupo" && (
                          <p className="mb-0.5 text-xs font-medium opacity-70">
                            {m.profiles?.full_name ?? "Usuário"}
                          </p>
                        )}
                        {quoted && (
                          <p
                            className={cn(
                              "mb-1 truncate rounded-md border-l-2 px-2 py-1 text-xs",
                              mine ? "border-primary-foreground/60 bg-black/10" : "border-primary bg-background/60",
                            )}
                          >
                            {quoted.deleted_at ? "Mensagem apagada" : quoted.body}
                          </p>
                        )}
                        {!m.deleted_at && m.attachment_url && (
                          <ChatAttachment
                            path={m.attachment_url}
                            type={m.attachment_type}
                            name={m.attachment_name}
                          />
                        )}
                        {(m.deleted_at || m.body) && (
                          <p className="whitespace-pre-wrap break-words">
                            {m.deleted_at ? (
                              <span className="italic opacity-70">Mensagem apagada</span>
                            ) : (
                              <Linkify text={m.body ?? ""} />
                            )}
                          </p>
                        )}
                        <p className="mt-0.5 text-right text-[10px] opacity-70">
                          {timeLabel(m.created_at)}
                          {mine && <Check className="ml-1 inline size-3" />}
                        </p>
                      </div>
                      {!m.deleted_at && (
                        <div className="flex opacity-0 transition-opacity group-hover:opacity-100">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Responder"
                            onClick={() => setReplyTo(m)}
                          >
                            <CornerUpLeft className="size-3.5" />
                          </Button>
                          {mine && (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Apagar"
                              onClick={() => removeMessage(m.id)}
                            >
                              <Trash2 className="size-3.5 text-destructive" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              {replyTo && (
                <div className="flex items-center gap-2 border-t bg-muted/50 px-3 py-2 text-xs">
                  <CornerUpLeft className="size-3.5" />
                  <span className="min-w-0 flex-1 truncate">
                    Respondendo: {replyTo.body ?? "mensagem"}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Cancelar resposta"
                    onClick={() => setReplyTo(null)}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              )}

              <form onSubmit={send} className="flex items-center gap-2 border-t p-3">
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void sendFile(f);
                  }}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void sendFile(f);
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Enviar imagem ou vídeo"
                  disabled={uploading || recording}
                  onClick={() => imageInputRef.current?.click()}
                >
                  <ImageIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Anexar arquivo"
                  disabled={uploading || recording}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant={recording ? "destructive" : "ghost"}
                  size="icon"
                  aria-label={recording ? "Parar gravação" : "Gravar áudio"}
                  disabled={uploading}
                  onClick={() => void toggleRecording()}
                >
                  {recording ? <Square className="size-4" /> : <Mic className="size-4" />}
                </Button>
                <Input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  disabled={recording}
                  placeholder={
                    recording
                      ? "Gravando áudio… toque no quadrado para enviar"
                      : uploading
                        ? "Enviando anexo…"
                        : "Escreva uma mensagem ou cole um link…"
                  }
                />
                <Button type="submit" aria-label="Enviar" disabled={uploading || recording}>
                  <Send className="size-4" />
                </Button>
              </form>
            </>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova conversa</DialogTitle>
            <DialogDescription>
              Fale com uma pessoa da equipe ou crie um grupo com várias pessoas.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="direta">
            <TabsList>
              <TabsTrigger value="direta">Pessoa</TabsTrigger>
              <TabsTrigger value="grupo">Grupo</TabsTrigger>
            </TabsList>

            <TabsContent value="direta" className="mt-3 space-y-1">
              {people
                .filter((p) => p.id !== userId)
                .map((p) => (
                  <button
                    key={p.id}
                    onClick={() => openDirect(p.id)}
                    className="flex w-full items-center gap-3 rounded-lg p-2.5 text-left hover:bg-muted"
                  >
                    <Avatar className="size-8">
                      <AvatarFallback>{initials(p.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{p.email ?? ""}</p>
                    </div>
                  </button>
                ))}
              {people.filter((p) => p.id !== userId).length === 0 && (
                <p className="p-4 text-center text-sm text-muted-foreground">
                  Ainda não há outros membros cadastrados.
                </p>
              )}
            </TabsContent>

            <TabsContent value="grupo" className="mt-3 space-y-3">
              <div>
                <Label htmlFor="nome-grupo">Nome do grupo *</Label>
                <Input
                  id="nome-grupo"
                  className="mt-1.5"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Time comercial, Suporte, Diretoria…"
                />
              </div>
              <div>
                <Label>Participantes</Label>
                <div className="mt-1.5 max-h-56 space-y-1 overflow-y-auto rounded-lg border p-2">
                  {people
                    .filter((p) => p.id !== userId)
                    .map((p) => (
                      <label
                        key={p.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md p-2 hover:bg-muted"
                      >
                        <Checkbox
                          checked={groupMembers.includes(p.id)}
                          onCheckedChange={(v) =>
                            setGroupMembers((prev) =>
                              v ? [...prev, p.id] : prev.filter((id) => id !== p.id),
                            )
                          }
                        />
                        <span className="text-sm">{p.name}</span>
                      </label>
                    ))}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={createGroup}>Criar grupo</Button>
              </DialogFooter>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
