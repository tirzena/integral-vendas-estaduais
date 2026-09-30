/* eslint-disable @typescript-eslint/no-explicit-any */

function toUtcStamp(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Link para adicionar um compromisso na agenda do Google. */
export function googleCalendarUrl(task: {
  title?: string | null;
  description?: string | null;
  due_at?: string | null;
}) {
  const start = task.due_at ? new Date(task.due_at) : new Date();
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: task.title ?? "Tarefa",
    details: task.description ?? "",
    dates: `${toUtcStamp(start)}/${toUtcStamp(end)}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Gera um arquivo .ics que pode ser importado no Google Agenda, Apple ou Outlook. */
export function buildIcs(tasks: any[]) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//OS//Tarefas//PT-BR",
    "CALSCALE:GREGORIAN",
  ];
  tasks
    .filter((t) => t.due_at)
    .forEach((t) => {
      const start = new Date(t.due_at);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      lines.push(
        "BEGIN:VEVENT",
        `UID:${t.id}@os`,
        `DTSTAMP:${toUtcStamp(new Date())}`,
        `DTSTART:${toUtcStamp(start)}`,
        `DTEND:${toUtcStamp(end)}`,
        `SUMMARY:${String(t.title ?? "Tarefa").replace(/\n/g, " ")}`,
        `DESCRIPTION:${String(t.description ?? "").replace(/\n/g, " ")}`,
        "END:VEVENT",
      );
    });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function downloadIcs(tasks: any[], filename = "tarefas.ics") {
  const blob = new Blob([buildIcs(tasks)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
