/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { EmptyState } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function TaskList({
  tasks,
  nameOf,
  customerName,
  onOpen,
}: {
  tasks: any[];
  nameOf: (id?: string | null) => string;
  customerName?: (id?: string | null) => string;
  onOpen?: (task: any) => void;
}) {
  if (tasks.length === 0) {
    return <EmptyState title="Nenhuma tarefa" description="Crie tarefas para acompanhar prazos." />;
  }
  return (
    <div className="space-y-2">
      {tasks.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onOpen?.(t)}
          className="surface-card flex w-full flex-wrap items-center gap-3 p-4 text-left transition-colors hover:bg-muted/50"
        >
          <div className="min-w-0 flex-1">
            <p className="font-medium">{t.title}</p>
            <p className="text-xs text-muted-foreground">
              {nameOf(t.assignee_id)} · {t.due_at ? formatDateTime(t.due_at) : "sem prazo"}
              {customerName && t.customer_id ? ` · ${customerName(t.customer_id)}` : ""}
            </p>
            {t.description && (
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{t.description}</p>
            )}
          </div>
          <Badge variant={t.priority === "alta" ? "destructive" : "secondary"}>
            {t.priority ?? "media"}
          </Badge>
          <Badge variant={t.status === "concluida" ? "default" : "secondary"}>
            {t.status ?? "pendente"}
          </Badge>
        </button>
      ))}
    </div>
  );
}

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

export function TaskCalendar({ tasks, onOpen }: { tasks: any[]; onOpen?: (task: any) => void }) {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const days = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);

  const byDay = useMemo(() => {
    const map = new Map<string, any[]>();
    tasks.forEach((t) => {
      if (!t.due_at) return;
      const key = new Date(t.due_at).toDateString();
      map.set(key, [...(map.get(key) ?? []), t]);
    });
    return map;
  }, [tasks]);

  const today = new Date().toDateString();

  return (
    <div className="surface-card p-4">
      <div className="mb-4 flex items-center justify-between">
        <p className="font-display text-lg font-semibold capitalize">
          {MONTHS[cursor.getMonth()]} de {cursor.getFullYear()}
        </p>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            aria-label="Mês anterior"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const now = new Date();
              setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
            }}
          >
            Hoje
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Próximo mês"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {days.map((d) => {
          const items = byDay.get(d.toDateString()) ?? [];
          const otherMonth = d.getMonth() !== cursor.getMonth();
          return (
            <div
              key={d.toISOString()}
              className={`min-h-24 rounded-lg border p-1.5 text-left ${
                otherMonth ? "opacity-40" : ""
              } ${d.toDateString() === today ? "border-primary" : ""}`}
            >
              <p className="text-xs font-medium">{d.getDate()}</p>
              <div className="mt-1 space-y-1">
                {items.slice(0, 3).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onOpen?.(t)}
                    title={t.title}
                    className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] ${
                      t.status === "concluida"
                        ? "bg-muted text-muted-foreground line-through"
                        : t.priority === "alta"
                          ? "bg-destructive/15 text-destructive"
                          : "bg-primary/10 text-primary"
                    }`}
                  >
                    {t.title}
                  </button>
                ))}
                {items.length > 3 && (
                  <p className="text-[10px] text-muted-foreground">+{items.length - 3}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
