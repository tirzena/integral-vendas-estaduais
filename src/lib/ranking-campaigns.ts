export type RankingCampaignMedia = {
  id: string;
  kind: "image" | "video" | "youtube";
  url: string;
  title: string;
};

export const RANKING_CAMPAIGN_START = "2026-09-16T00:00:00-03:00";

export const RANKING_TRAVEL_CAMPAIGNS = [
  {
    id: "outubro-2026",
    label: "Outubro",
    title: "Rota dos campeões",
    destination: "Porto de Galinhas",
    individualGoal: 1500,
    teamGoal: 8000,
    companion: true,
    teamPrize: "A definir pelos administradores",
    teamGoalRequiredForIndividualPrize: false,
    video: "https://www.youtube.com/watch?v=_u8DPjyW-14",
  },
  {
    id: "novembro-2026",
    label: "Novembro",
    title: "Destino Buenos Aires",
    destination: "Buenos Aires",
    individualGoal: 1000,
    teamGoal: 6000,
    companion: true,
    teamPrize: "A definir pelos administradores",
    teamGoalRequiredForIndividualPrize: false,
    video: "https://www.youtube.com/watch?v=tx0GCVfID_U",
  },
  {
    id: "dezembro-2026",
    label: "Dezembro",
    title: "Destino Puerto Plata",
    destination: "Puerto Plata",
    individualGoal: 3500,
    teamGoal: 8000,
    companion: true,
    teamPrize: "A definir pelos administradores",
    teamGoalRequiredForIndividualPrize: false,
    video: "https://www.youtube.com/watch?v=P4FQMqMhOj8",
  },
] as const;

/** Intervalos consecutivos de 30 dias; o instante final pertence à campanha seguinte. */
export function campaignSchedule(start: string = RANKING_CAMPAIGN_START) {
  const initial = new Date(start).getTime();
  if (!Number.isFinite(initial)) throw new Error("Data inicial inválida");
  return RANKING_TRAVEL_CAMPAIGNS.map((campaign, index) => ({
    ...campaign,
    startsAt: new Date(initial + index * 30 * 86400000).toISOString(),
    endsAt: new Date(initial + (index + 1) * 30 * 86400000).toISOString(),
  }));
}

export function campaignCountdown(startsAt: string, endsAt: string, now = Date.now()) {
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    throw new Error("Prazo inválido");
  const state = now < start ? "agendada" : now < end ? "ativa" : "encerrada";
  const seconds = Math.max(0, Math.ceil(((state === "agendada" ? start : end) - now) / 1000));
  return {
    state,
    days: Math.floor(seconds / 86400),
    hours: Math.floor(seconds / 3600) % 24,
    minutes: Math.floor(seconds / 60) % 60,
    seconds: seconds % 60,
  };
}

/** Aceita apenas URLs conhecidas do YouTube; outros links não são inseridos em iframe. */
export function campaignYouTubeEmbed(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    let id: string | null = null;
    if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname))
      id = url.searchParams.get("v");
    else if (url.hostname === "youtu.be") id = url.pathname.slice(1);
    return id && /^[A-Za-z0-9_-]{11}$/.test(id)
      ? `https://www.youtube-nocookie.com/embed/${id}`
      : null;
  } catch {
    return null;
  }
}

export function campaignRules(campaign: {
  individualGoal: number;
  teamGoal: number;
  destination: string;
}) {
  return `O primeiro colocado em unidades vendidas ganha uma viagem para ${campaign.destination} com 1 acompanhante, desde que atinja pelo menos ${campaign.individualGoal.toLocaleString("pt-BR")} unidades durante os 30 dias. Se ninguém atingir a meta, não haverá vencedor.
A equipe com mais unidades precisa atingir ${campaign.teamGoal.toLocaleString("pt-BR")} unidades para ter direito à premiação, que será definida pelos administradores. A meta da equipe não condiciona a viagem individual.
Empates na liderança ficam para decisão dos administradores; não geram premiação automática.`;
}

export type ChampionshipStanding = { id: string; name: string; units: number };
export function championshipLeader(rows: ChampionshipStanding[], goal: number) {
  const sorted = [...rows].sort((a, b) => b.units - a.units);
  const top = sorted[0];
  if (!top || top.units < goal) return { state: "below" as const, winner: null };
  if (sorted.filter((r) => r.units === top.units).length > 1)
    return { state: "tie" as const, winner: null };
  return { state: "qualified" as const, winner: top };
}
