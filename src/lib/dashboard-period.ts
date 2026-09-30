export type DashboardPeriod =
  "all" | "today" | "current_week" | "7days" | "30days" | "current_month" | "current_year";

export const DASHBOARD_PERIOD_LABELS: Record<DashboardPeriod, string> = {
  all: "Todo o período",
  today: "Hoje",
  current_week: "Esta semana",
  "7days": "Últimos 7 dias",
  "30days": "Últimos 30 dias",
  current_month: "Este mês",
  current_year: "Este ano",
};

/** Intervalos locais fechados no início e abertos no fim: [start, end). */
export function dashboardPeriodRange(period: DashboardPeriod, reference = new Date()) {
  if (period === "all") return null;
  const end = new Date(reference);
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + 1);
  const start = new Date(reference);
  start.setHours(0, 0, 0, 0);

  if (period === "current_week") {
    const mondayOffset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - mondayOffset);
  } else if (period === "7days") {
    start.setDate(start.getDate() - 6);
  } else if (period === "30days") {
    start.setDate(start.getDate() - 29);
  } else if (period === "current_month") {
    start.setDate(1);
  } else if (period === "current_year") {
    start.setMonth(0, 1);
  }
  return { start, end };
}
