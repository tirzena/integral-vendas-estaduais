import { SupplierSummary } from "@/components/inventory/SupplierSummary";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { SupplierStockLots } from "@/components/inventory/SupplierStockLots";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Gift, Loader2, Package, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { CurrencyValues } from "@/components/common/CurrencyValues";
import { PageHeader, EmptyState } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/fornecedor")({
  component: SupplierPortal,
});

const MODE_LABEL: Record<string, string> = {
  quantidade: "Quantidade",
  percentual: "Percentual",
  valor: "Valor",
};

function SupplierPortal() {
  const queryClient = useQueryClient();
  const [itemId, setItemId] = useState("todos");
  const [mode, setMode] = useState("quantidade");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const query = useQuery({
    queryKey: ["supplier-portal"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("supplier_portal_data", {});
      if (error) throw error;
      return data;
    },
  });
  const summary = useMemo(() => {
    const rows = query.data?.purchases ?? [];
    return rows.reduce(
      (acc: any, row: any) => {
        acc.received += Number(row.quantity ?? 0);
        acc.bonus += Number(row.bonus_quantity ?? 0);
        acc.paidUnits += Number(row.paid_quantity ?? 0);
        const currency = row.currency ?? "BRL";
        acc.payable[currency] = (acc.payable[currency] ?? 0) + Number(row.total_cost ?? 0);
        return acc;
      },
      { received: 0, bonus: 0, paidUnits: 0, payable: {} },
    );
  }, [query.data]);

  async function savePolicy() {
    const parsed = Number(value.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) return void toast.error("Informe um valor válido.");
    setSaving(true);
    const { error } = await (supabase as any).rpc("supplier_save_bonus_policy", {
      p_supplier_id: query.data.supplier.id,
      p_item_id: itemId === "todos" ? null : itemId,
      p_mode: mode,
      p_value: parsed,
    });
    setSaving(false);
    if (error) return void toast.error(error.message);
    setValue("");
    await queryClient.invalidateQueries({ queryKey: ["supplier-portal"] });
    toast.success("Regra de bonificação salva.");
  }

  if (query.isLoading)
    return <p className="text-sm text-muted-foreground">Carregando painel do fornecedor…</p>;
  if (query.error)
    return (
      <EmptyState title="Fornecedor não vinculado" description={(query.error as any).message} />
    );
  const data = query.data;

  return (
    <div>
      <PageHeader
        title={data.supplier.name}
        description="Compras, bonificações e valores a pagar registrados no OS."
      />
      <SupplierSummary supplierId={data.supplier.id} />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Quantidade recebida", summary.received, Package],
          ["Unidades bonificadas", summary.bonus, Gift],
          ["Unidades cobradas", summary.paidUnits, ReceiptText],
        ].map(([label, total, Icon]: any) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-2 text-xl font-semibold">
              <Icon className="size-5 text-primary" />
              {formatNumber(total)}
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Valor devido</CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-semibold">
            {Object.entries(summary.payable).length
              ? Object.entries(summary.payable).map(([currency, total]: any) => (
                  <CurrencyValues key={currency} value={total} currency={currency} />
                ))
              : "—"}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="compras">
        <TabsList>
          <TabsTrigger value="lotes">Lotes e estoque</TabsTrigger>
          <TabsTrigger value="compras">Compras e bonificações</TabsTrigger>
          <TabsTrigger value="regras">Regras de bonificação</TabsTrigger>
        </TabsList>
        <TabsContent value="lotes" className="pt-4">
          <SupplierStockLots supplierId={data.supplier.id} />
        </TabsContent>
        <TabsContent value="compras" className="pt-4">
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Recebido</TableHead>
                  <TableHead className="text-right">Bônus</TableHead>
                  <TableHead className="text-right">Cobrado</TableHead>
                  <TableHead className="text-right">Valor devido</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data.purchases ?? []).map((row: any) => (
                  <TableRow key={row.id}>
                    <TableCell>{formatDateTime(row.created_at)}</TableCell>
                    <TableCell>{row.item_name}</TableCell>
                    <TableCell className="text-right">{formatNumber(row.quantity)}</TableCell>
                    <TableCell className="text-right">{formatNumber(row.bonus_quantity)}</TableCell>
                    <TableCell className="text-right">{formatNumber(row.paid_quantity)}</TableCell>
                    <TableCell className="text-right">
                      <CurrencyValues value={row.total_cost} currency={row.currency} />
                    </TableCell>
                    <TableCell>{row.payable_status ?? "pendente"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
        <TabsContent value="regras" className="space-y-4 pt-4">
          <Card>
            <CardContent className="grid gap-3 pt-6 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
              <div>
                <Label>Aplicar a</Label>
                <Select value={itemId} onValueChange={setItemId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os produtos</SelectItem>
                    {(data.items ?? []).map((item: any) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Forma</Label>
                <Select value={mode} onValueChange={setMode}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="quantidade">Quantidade</SelectItem>
                    <SelectItem value="percentual">Percentual</SelectItem>
                    <SelectItem value="valor">Valor convertido em unidades</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Bonificação</Label>
                <Input
                  inputMode="decimal"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={
                    mode === "percentual"
                      ? "Ex.: 1,5"
                      : mode === "valor"
                        ? "Ex.: 500,00"
                        : "Ex.: 10"
                  }
                />
              </div>
              <Button onClick={savePolicy} disabled={saving}>
                {saving && <Loader2 className="mr-2 size-4 animate-spin" />}Salvar
              </Button>
            </CardContent>
          </Card>
          <div className="space-y-2">
            {(data.policies ?? []).map((policy: any) => {
              const item = (data.items ?? []).find((entry: any) => entry.id === policy.item_id);
              return (
                <Card key={policy.id}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                    <div>
                      <p className="font-medium">{item?.name ?? "Todos os produtos"}</p>
                      <p className="text-sm text-muted-foreground">
                        {MODE_LABEL[policy.mode]}: {formatNumber(policy.value, 3)}
                        {policy.mode === "percentual" ? "%" : ""}
                      </p>
                    </div>
                    <span className="text-sm">{policy.is_active ? "Ativa" : "Inativa"}</span>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
