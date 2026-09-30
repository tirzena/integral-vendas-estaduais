import { describe, expect, it } from "vitest";
import {
  championshipLeader,
  campaignRules,
  campaignSchedule,
  campaignCountdown,
  campaignYouTubeEmbed,
  RANKING_TRAVEL_CAMPAIGNS,
} from "./ranking-campaigns";
describe("Travel campaign deadlines", () => {
  it("uses the approved start date and keeps all individual trips independent of team rewards", () => {
    const schedule = campaignSchedule();
    expect(schedule[0].startsAt).toBe("2026-09-16T03:00:00.000Z");
    expect(schedule[0].endsAt).toBe("2026-10-16T03:00:00.000Z");
    expect(schedule[1].endsAt).toBe("2026-11-15T03:00:00.000Z");
    expect(schedule[2].endsAt).toBe("2026-12-15T03:00:00.000Z");
    for (const c of schedule) {
      expect(c.companion).toBe(true);
      expect(c.teamGoalRequiredForIndividualPrize).toBe(false);
      expect(c.teamPrize).toBe("A definir pelos administradores");
    }
  });
  it("uses consecutive 30-day windows, without overlap or monthly calendar drift", () => {
    const schedule = campaignSchedule("2026-09-16T00:00:00-03:00");
    expect(schedule.map((c) => c.destination)).toEqual([
      "Porto de Galinhas",
      "Buenos Aires",
      "Puerto Plata",
    ]);
    expect(schedule[0].endsAt).toBe(schedule[1].startsAt);
    expect(schedule[1].endsAt).toBe(schedule[2].startsAt);
    for (const c of schedule)
      expect(Date.parse(c.endsAt) - Date.parse(c.startsAt)).toBe(30 * 86400000);
  });
  it("changes campaign state exactly at its start and end", () => {
    const [c] = campaignSchedule("2026-09-16T00:00:00-03:00");
    expect(campaignCountdown(c.startsAt, c.endsAt, Date.parse(c.startsAt) - 1000).state).toBe(
      "agendada",
    );
    expect(campaignCountdown(c.startsAt, c.endsAt, Date.parse(c.startsAt)).days).toBe(30);
    expect(campaignCountdown(c.startsAt, c.endsAt, Date.parse(c.endsAt)).state).toBe("encerrada");
    expect(campaignCountdown(c.startsAt, c.endsAt, Date.parse(c.endsAt) + 10000).seconds).toBe(0);
  });
  it("maps the supplied videos and rejects arbitrary iframe destinations", () => {
    for (const c of RANKING_TRAVEL_CAMPAIGNS)
      expect(campaignYouTubeEmbed(c.video)).toMatch(/^https:\/\/www.youtube-nocookie.com\/embed\//);
    expect(campaignYouTubeEmbed("https://youtube.com.evil.example/watch?v=_u8DPjyW-14")).toBeNull();
    expect(campaignYouTubeEmbed("javascript:alert(1)")).toBeNull();
  });
});

describe("championship minimum and leader", () => {
  it("does not grant a winner below minimum", () =>
    expect(championshipLeader([{ id: "a", name: "A", units: 1499 }], 1500).state).toBe("below"));
  it("selects only the top seller when multiple reach minimum", () =>
    expect(
      championshipLeader(
        [
          { id: "a", name: "A", units: 1500 },
          { id: "b", name: "B", units: 1700 },
        ],
        1500,
      ).winner?.id,
    ).toBe("b"));
  it("does not automatically resolve ties", () =>
    expect(
      championshipLeader(
        [
          { id: "a", name: "A", units: 1500 },
          { id: "b", name: "B", units: 1500 },
        ],
        1500,
      ).state,
    ).toBe("tie"));
  it("explains no prize without the minimum", () =>
    expect(campaignRules({ individualGoal: 1500, teamGoal: 8000, destination: "Porto" })).toContain(
      "Se ninguém atingir",
    ));
});
