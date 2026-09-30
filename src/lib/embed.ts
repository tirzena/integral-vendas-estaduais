export type EmbedInfo =
  | { kind: "iframe"; src: string; title: string }
  | { kind: "video"; src: string; title: string }
  | { kind: "image"; src: string; title: string }
  | { kind: "link"; src: string; title: string };

/** Descobre como exibir um link colado pelo usuário (YouTube, Instagram, vídeo, imagem…). */
export function getEmbed(rawUrl?: string | null): EmbedInfo | null {
  const url = (rawUrl ?? "").trim();
  if (!url) return null;

  const yt = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{6,})/i,
  );
  if (yt?.[1]) {
    return { kind: "iframe", src: `https://www.youtube.com/embed/${yt[1]}`, title: "Vídeo do YouTube" };
  }

  const vimeo = url.match(/vimeo\.com\/(\d+)/i);
  if (vimeo?.[1]) {
    return { kind: "iframe", src: `https://player.vimeo.com/video/${vimeo[1]}`, title: "Vídeo do Vimeo" };
  }

  const insta = url.match(/instagram\.com\/(p|reel|reels|tv)\/([\w-]+)/i);
  if (insta?.[2]) {
    return {
      kind: "iframe",
      src: `https://www.instagram.com/${insta[1] === "reels" ? "reel" : insta[1]}/${insta[2]}/embed`,
      title: "Publicação do Instagram",
    };
  }

  const drive = url.match(/drive\.google\.com\/file\/d\/([\w-]+)/i);
  if (drive?.[1]) {
    return { kind: "iframe", src: `https://drive.google.com/file/d/${drive[1]}/preview`, title: "Arquivo do Drive" };
  }

  if (/\.(mp4|webm|ogg|mov)(\?|$)/i.test(url)) return { kind: "video", src: url, title: "Vídeo" };
  if (/\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(url)) return { kind: "image", src: url, title: "Imagem" };

  return { kind: "link", src: url, title: "Link" };
}
