import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useBaseCurrency } from "@/hooks/useBaseCurrency";
import { usePermissions } from "@/hooks/usePermissions";
import { useRates, DISPLAY_CURRENCIES, type Currency } from "@/hooks/useRates";
import { formatMoney } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const NAMES: Record<Currency, string> = {
  BRL: "Real (R$)",
  USD: "Dólar (US$)",
  PYG: "Guarani (₲)",
};

/** Define a moeda padrão usada em todo o sistema e mostra a referência nas três moedas. */
export function BaseCurrencyCard() {
  const { currency, markup, loading, save, saveMarkup } = useBaseCurrency();
  const { isAdmin } = usePermissions();
  const { convert } = useRates();
  const [markupInput, setMarkupInput] = useState(String(markup).replace(".", ","));

  useEffect(() => setMarkupInput(String(markup).replace(".", ",")), [markup]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Moeda padrão do sistema</CardTitle>
        <CardDescription>
          Vale para pedidos, catálogos, financeiro e relatórios. Os documentos sempre mostram o total
          em real, dólar e guarani.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-w-xs">
          <Select
            value={currency}
            disabled={loading || !isAdmin || save.isPending}
            onValueChange={async (v) => {
              try {
                await save.mutateAsync(v as Currency);
                toast.success("Moeda padrão atualizada.");
              } catch {
                toast.error("Não foi possível salvar a moeda padrão.");
              }
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DISPLAY_CURRENCIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {NAMES[c.value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!isAdmin && (
            <p className="mt-2 text-xs text-muted-foreground">
              Somente administradores podem alterar a moeda padrão.
            </p>
          )}
        </div>
        <div className="max-w-md rounded-xl border bg-muted/20 p-4">
          <Label htmlFor="exchange-markup">Acréscimo sobre o dólar comercial</Label>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-sm font-medium">R$</span>
            <Input
              id="exchange-markup"
              inputMode="decimal"
              value={markupInput}
              disabled={!isAdmin || saveMarkup.isPending}
              onChange={(event) => setMarkupInput(event.target.value)}
              className="max-w-32"
            />
            <Button
              variant="outline"
              disabled={!isAdmin || saveMarkup.isPending}
              onClick={async () => {
                const value = Number(markupInput.replace(",", "."));
                try {
                  await saveMarkup.mutateAsync(value);
                  toast.success("Acréscimo cambial atualizado.");
                } catch {
                  toast.error("Informe um acréscimo válido.");
                }
              }}
            >
              Salvar ajuste
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            O padrão é R$ 0,12. Esse valor é somado à cotação USD/BRL do Yahoo Finanças antes das demais conversões.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {(["BRL", "USD", "PYG"] as Currency[]).map((c) => {
            const value = convert(100, currency, c);
            return (
              <div key={c} className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">{NAMES[c]}</p>
                <p className="text-sm font-medium">
                  {formatMoney(100, currency)} ={" "}
                  {value === null ? "—" : formatMoney(value, c)}
                </p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
