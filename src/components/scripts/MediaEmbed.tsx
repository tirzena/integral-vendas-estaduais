import { ExternalLink } from "lucide-react";
import { getEmbed } from "@/lib/embed";

/** Mostra o conteúdo do link direto na tela (vídeo, imagem ou atalho). */
export function MediaEmbed({ url, label }: { url?: string | null; label?: string }) {
  const embed = getEmbed(url);
  if (!embed) return null;

  if (embed.kind === "iframe") {
    return (
      <div className="overflow-hidden rounded-xl border bg-muted/30">
        <div className="aspect-video w-full">
          <iframe
            src={embed.src}
            title={label ?? embed.title}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>
    );
  }

  if (embed.kind === "video") {
    return (
      <video controls src={embed.src} className="w-full rounded-xl border bg-black">
        <track kind="captions" />
      </video>
    );
  }

  if (embed.kind === "image") {
    return (
      <img
        src={embed.src}
        alt={label ?? "Material do treinamento"}
        loading="lazy"
        className="w-full rounded-xl border object-cover"
      />
    );
  }

  return (
    <a
      href={embed.src}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 text-sm text-primary underline underline-offset-4"
    >
      <ExternalLink className="size-4" /> {label ?? embed.src}
    </a>
  );
}
