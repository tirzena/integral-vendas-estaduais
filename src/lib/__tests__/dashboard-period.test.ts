import { describe, expect, it } from "vitest";
import { dashboardPeriodRange } from "@/lib/dashboard-period";

const reference = new Date(2026, 8, 16, 15, 30);

describe("dashboardPeriodRange", () => {
  it("separa hoje da semana atual, iniciada na segunda-feira", () => {
    const today = dashboardPeriodRange("today", reference)!;
    const week = dashboardPeriodRange("current_week", reference)!;

    expect(today.start).toEqual(new Date(2026, 8, 16));
    expect(week.start).toEqual(new Date(2026, 8, 14));
    expect(today.end).toEqual(new Date(2026, 8, 17));
    expect(week.end).toEqual(new Date(2026, 8, 17));
  });

  it("delimita mês e ano atuais sem incluir períodos anteriores", () => {
    expect(dashboardPeriodRange("current_month", reference)?.start).toEqual(new Date(2026, 8, 1));
    expect(dashboardPeriodRange("current_year", reference)?.start).toEqual(new Date(2026, 0, 1));
  });

  it("usa sete dias de calendário incluindo o dia atual", () => {
    expect(dashboardPeriodRange("7days", reference)?.start).toEqual(new Date(2026, 8, 10));
  });
});
