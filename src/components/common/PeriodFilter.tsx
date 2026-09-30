import { PERIOD_OPTIONS, type PeriodKey } from "@/lib/period";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function PeriodFilter({
  value,
  onChange,
  className,
}: {
  value: PeriodKey;
  onChange: (value: PeriodKey) => void;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as PeriodKey)}>
      <SelectTrigger className={className ?? "w-48"} aria-label="Filtrar por período">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PERIOD_OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export type Stat = { label: string; value: string | number; tone?: "default" | "warn" | "bad" | "good" };

export function StatCards({ stats }: { stats: Stat[] }) {
  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {stats.map((s) => (
        <div key={s.label} className="surface-card rounded-xl border p-3">
          <p className="text-xs text-muted-foreground">{s.label}</p>
          <p
            className={
              "text-xl font-semibold " +
              (s.tone === "bad"
                ? "text-destructive"
                : s.tone === "warn"
                  ? "text-amber-600 dark:text-amber-400"
                  : s.tone === "good"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "")
            }
          >
            {s.value}
          </p>
        </div>
      ))}
    </div>
  );
}
