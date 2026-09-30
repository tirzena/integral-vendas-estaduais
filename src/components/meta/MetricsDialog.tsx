import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import type { MetricDef } from "@/lib/ad-metrics";
import { SERIES_COLORS } from "@/lib/ad-metrics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

/** Escolha e ordem das métricas dos cards e das séries do gráfico. */
export function MetricsDialog({
  open,
  onOpenChange,
  definitions,
  availableKeys,
  cards,
  chart,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  definitions: MetricDef[];
  availableKeys: Set<string>;
  cards: string[];
  chart: string[];
  onSave: (next: { cards: string[]; chart: string[] }) => void;
}) {
  const [localCards, setLocalCards] = useState(cards);
  const [localChart, setLocalChart] = useState(chart);

  useEffect(() => {
    if (open) {
      setLocalCards(cards);
      setLocalChart(chart);
    }
  }, [open, cards, chart]);

  const label = (key: string) =>
    definitions.find((d) => d.key === key)?.label ?? key;

  const move = (index: number, delta: number) =>
    setLocalCards((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item!);
      return next;
    });

  const toggle = (list: string[], key: string) =>
    list.includes(key) ? list.filter((k) => k !== key) : [...list, key];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>Personalizar métricas</DialogTitle>
          <DialogDescription>
            Escolha o que aparece nos cards e quais linhas aparecem no gráfico. As duas
            configurações são independentes.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="cards">
          <TabsList>
            <TabsTrigger value="cards">Cards</TabsTrigger>
            <TabsTrigger value="chart">Gráfico</TabsTrigger>
          </TabsList>

          <TabsContent value="cards" className="space-y-3">
            <div className="rounded-lg border p-3">
              <p className="mb-2 text-sm font-medium">Ordem dos cards</p>
              {localCards.length === 0 && (
                <p className="text-muted-foreground text-xs">Nenhuma métrica escolhida.</p>
              )}
              <div className="space-y-1">
                {localCards.map((key, i) => (
                  <div key={key} className="flex items-center gap-2 rounded-md border px-2 py-1">
                    <span className="flex-1 truncate text-sm">{label(key)}</span>
                    {!availableKeys.has(key) && (
                      <Badge variant="outline" className="text-xs">
                        Sem dados
                      </Badge>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => move(i, -1)} aria-label="Subir">
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => move(i, 1)} aria-label="Descer">
                      <ArrowDown className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setLocalCards((p) => p.filter((k) => k !== key))}
                      aria-label="Remover"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
            <ScrollArea className="h-64 rounded-lg border p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                {definitions.map((d) => (
                  <label key={d.key} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={localCards.includes(d.key)}
                      onCheckedChange={() => setLocalCards((p) => toggle(p, d.key))}
                    />
                    <span className="truncate">{d.label}</span>
                    {!availableKeys.has(d.key) && (
                      <span className="text-muted-foreground text-xs">(sem dados)</span>
                    )}
                  </label>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="chart" className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {localChart.map((key, i) => (
                <Badge
                  key={key}
                  variant="outline"
                  className="gap-2"
                  style={{ borderColor: SERIES_COLORS[i % SERIES_COLORS.length] }}
                >
                  <span
                    className="inline-block size-2 rounded-full"
                    style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }}
                  />
                  {label(key)}
                  <button
                    type="button"
                    onClick={() => setLocalChart((p) => p.filter((k) => k !== key))}
                    aria-label={`Remover ${label(key)}`}
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
              {localChart.length < 2 && (
                <span className="text-muted-foreground text-xs">
                  Escolha pelo menos duas séries.
                </span>
              )}
            </div>
            <ScrollArea className="h-72 rounded-lg border p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                {definitions.map((d) => (
                  <label key={d.key} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={localChart.includes(d.key)}
                      onCheckedChange={() => setLocalChart((p) => toggle(p, d.key))}
                    />
                    <span className="truncate">{d.label}</span>
                    {!availableKeys.has(d.key) && (
                      <span className="text-muted-foreground text-xs">(sem dados)</span>
                    )}
                  </label>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => onSave({ cards: localCards, chart: localChart })}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
