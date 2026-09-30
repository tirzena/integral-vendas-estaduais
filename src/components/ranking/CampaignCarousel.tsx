import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  campaignCountdown,
  campaignYouTubeEmbed,
  type RankingCampaignMedia,
} from "@/lib/ranking-campaigns";

export function CampaignCarousel({
  title,
  destination,
  startsAt,
  endsAt,
  individualGoal,
  teamGoal,
  companion,
  rules,
  media,
  compact = false,
  children,
}: {
  title: string;
  destination: string;
  startsAt: string;
  endsAt: string;
  individualGoal: number;
  teamGoal: number;
  companion: boolean;
  rules: string;
  media: RankingCampaignMedia[];
  compact?: boolean;
  children?: ReactNode;
}) {
  const [index, setIndex] = useState(0);
  const [automatic, setAutomatic] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [failed, setFailed] = useState<string | null>(null);
  const currentIndex = media.length ? index % media.length : 0;
  const current = media[currentIndex];
  const countdown = campaignCountdown(startsAt, endsAt, now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    // Um vídeo em reprodução nunca é interrompido pela troca automática.
    if (!automatic || hovered || media.length < 2 || current?.kind !== "image") return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % media.length), 8000);
    return () => window.clearInterval(timer);
  }, [automatic, hovered, media.length, current?.kind]);
  const move = (step: number) => setIndex((i) => (i + step + media.length) % media.length);
  const embed = current?.kind === "youtube" ? campaignYouTubeEmbed(current.url) : null;
  const safeUrl = (value: string) => {
    try {
      return (
        new URL(value, "https://tirzena.vercel.app").protocol === "https:" ||
        (value.startsWith("/") && !value.startsWith("//"))
      );
    } catch {
      return false;
    }
  };
  const format = (n: number) => n.toLocaleString("pt-BR");
  return (
    <section aria-label={`Campeonato ${title}`} className={compact ? "surface-card overflow-hidden" : "surface-card mb-6 overflow-hidden"}>
      <div className={compact ? "grid" : "grid lg:grid-cols-2"}>
        <div
          className="relative flex min-h-60 items-center justify-center bg-black"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocusCapture={() => setHovered(true)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setHovered(false);
          }}
        >
          {current && failed !== current.id && safeUrl(current.url) ? (
            current.kind === "image" ? (
              <img
                key={current.id}
                src={current.url}
                alt={current.title}
                className={compact ? "max-h-[320px] w-full object-contain" : "max-h-[540px] w-full object-contain"}
                onError={() => setFailed(current.id)}
              />
            ) : current.kind === "video" ? (
              <video
                key={current.id}
                src={current.url}
                controls
                preload="metadata"
                className={compact ? "max-h-[320px] w-full" : "max-h-[540px] w-full"}
                aria-label={current.title}
                onError={() => setFailed(current.id)}
              />
            ) : embed ? (
              <iframe
                key={current.id}
                src={embed}
                title={current.title}
                className="aspect-video w-full"
                loading="lazy"
                allow="encrypted-media; picture-in-picture; fullscreen"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            ) : (
              <p className="p-5 text-white">Link de vídeo inválido.</p>
            )
          ) : (
            <p className="p-5 text-white">Mídia indisponível.</p>
          )}
          {media.length > 1 && (
            <div className="absolute bottom-3 flex items-center gap-2 rounded-full bg-black/80 p-2 text-white">
              <Button
                size="icon"
                variant="ghost"
                aria-label="Mídia anterior"
                onClick={() => move(-1)}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="text-sm">
                {currentIndex + 1} / {media.length}
              </span>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Próxima mídia"
                onClick={() => move(1)}
              >
                <ChevronRight className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={automatic ? "Pausar carrossel" : "Retomar carrossel"}
                onClick={() => setAutomatic((v) => !v)}
              >
                {automatic ? <Pause className="size-4" /> : <Play className="size-4" />}
              </Button>
            </div>
          )}
        </div>
        <div className={compact ? "space-y-4 p-4" : "space-y-5 p-6"}>
          <p className="flex items-center gap-2 text-sm font-medium text-primary">
            <Trophy className="size-5" /> Campeonato de bonificação
          </p>
          <h2 className="text-2xl font-bold">{title}</h2>
          <p className="text-lg">
            Viagem para {destination}
            {companion ? " + 1 acompanhante" : ""}
          </p>
          <div className="rounded-xl border border-primary/30 bg-primary/10 p-4">
            <p className="mb-2 text-sm font-medium">
              {countdown.state === "agendada"
                ? "Começa em"
                : countdown.state === "ativa"
                  ? "Prazo restante"
                  : "Campeonato encerrada"}
            </p>
            {countdown.state !== "encerrada" && (
              <p
                role="timer"
                aria-label="Contagem regressiva do campeonato"
                className="text-2xl font-bold tabular-nums"
              >
                {countdown.days}d {String(countdown.hours).padStart(2, "0")}h{" "}
                {String(countdown.minutes).padStart(2, "0")}m{" "}
                {String(countdown.seconds).padStart(2, "0")}s
              </p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              {new Date(startsAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} até{" "}
              {new Date(endsAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} ·
              horário de Brasília
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-sm text-muted-foreground">Meta individual</p>
              <strong>{format(individualGoal)} unidades</strong>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Meta geral da equipe</p>
              <strong>{format(teamGoal)} unidades</strong>
            </div>
          </div>
          <div>
            <h3 className="font-semibold">Regras do campeonato</h3>
            <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{rules}</p>
          </div>
        </div>
      </div>
      {children && <div className="border-t p-4">{children}</div>}
    </section>
  );
}
