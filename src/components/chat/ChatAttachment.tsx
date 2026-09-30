import { useEffect, useState } from "react";
import { Download, FileText } from "lucide-react";
import { authenticatedFileClient } from "@/lib/authenticated-storage";

export const CHAT_BUCKET = "chat-anexos";

/** Gera uma URL temporária para o anexo guardado no armazenamento. */
export function useAttachmentUrl(path?: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!path) {
      setUrl(null);
      return;
    }
    void authenticatedFileClient()
      .then(({ client }) => client.storage.from(CHAT_BUCKET).createSignedUrl(path, 60 * 60))
      .then(({ data }) => {
        if (active) setUrl(data?.signedUrl ?? null);
      })
      .catch(() => {
        if (active) setUrl(null);
      });
    return () => {
      active = false;
    };
  }, [path]);
  return url;
}

export function ChatAttachment({
  path,
  type,
  name,
}: {
  path: string;
  type?: string | null;
  name?: string | null;
}) {
  const url = useAttachmentUrl(path);
  if (!url) {
    return <div className="my-1 h-16 w-40 animate-pulse rounded-lg bg-foreground/10" />;
  }
  if (type === "imagem") {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block">
        <img
          src={url}
          alt={name ?? "Imagem enviada no chat"}
          loading="lazy"
          className="my-1 max-h-64 w-full max-w-xs rounded-lg object-cover"
        />
      </a>
    );
  }
  if (type === "audio") {
    return <audio controls src={url} className="my-1 w-56 max-w-full" />;
  }
  if (type === "video") {
    return <video controls src={url} className="my-1 max-h-64 w-full max-w-xs rounded-lg" />;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="my-1 flex items-center gap-2 rounded-lg border border-current/20 bg-background/20 px-2.5 py-2 text-xs underline-offset-2 hover:underline"
    >
      <FileText className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{name ?? "Arquivo"}</span>
      <Download className="size-3.5 shrink-0" />
    </a>
  );
}

/** Transforma links do texto em links clicáveis. */
export function Linkify({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+|www\.[^\s]+)/gi);
  return (
    <>
      {parts.map((part, i) =>
        /^(https?:\/\/|www\.)/i.test(part) ? (
          <a
            key={i}
            href={part.startsWith("http") ? part : `https://${part}`}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
