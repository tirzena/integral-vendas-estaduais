/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney } from "@/lib/format";
import type { Currency } from "@/lib/format";
import { getCustomerCredit, issueCustomerCredit, reverseCustomerCredit, toNumber } from "@/lib/sales";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function CustomerCreditsSection() {
  const queryClient = useQueryClient();
  const [customerId, setCustomerId] = useState("");
  const [currency, setCurrency] = useState<Currency>("BRL");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: customers = [] } = useQuery({
    queryKey: ["credit-customers"],
    queryFn: async () => {
      const [customers, orders] = await Promise.all([
        supabase.from("customers").select("id,name").is("deleted_at", null).order("name").limit(1000),
        supabase.from("orders").select("customer_id,delivered_at,fulfillment_status")
          .is("deleted_at", null).is("superseded_at", null).limit(1000),
      ]);
      if (customers.error) throw customers.error;
      if (orders.error) throw orders.error;
      const delivered = new Set((orders.data ?? [])
        .filter((order) => order.delivered_at || order.fulfillment_status === "entregue")
        .map((order) => order.customer_id));
      return (customers.data ?? []).filter((customer) => delivered.has(customer.id));
    },
  });
  const { data: balances = [] } = useQuery({
    queryKey: ["customer-credit", customerId],
    queryFn: () => getCustomerCredit(customerId), enabled: Boolean(customerId),
  });
  const { data: entries = [] } = useQuery({
    queryKey: ["customer-credit-ledger", customerId], enabled: Boolean(customerId),
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("customer_credit_entries")
        .select("id,currency,amount,kind,note,created_at,reverses_entry_id")
        .eq("customer_id", customerId).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return (data ?? []) as { id: string; currency: Currency; amount: number; kind: string;
        note: string; created_at: string; reverses_entry_id: string | null }[];
    },
  });
  const reversedIds = new Set(entries.map((entry) => entry.reverses_entry_id).filter(Boolean));

  async function deposit() {
    const value = toNumber(amount);
    if (!customerId || !(value > 0) || note.trim().length < 5)
      return void toast.error("Selecione o cliente e informe o valor, motivo e referência do recebimento.");
    setBusy(true);
    try {
      await issueCustomerCredit({ customerId, currency, amount: value, kind: "deposit", note: note.trim() });
      setAmount(""); setNote("");
      await queryClient.invalidateQueries({ queryKey: ["customer-credit", customerId] });
      await queryClient.invalidateQueries({ queryKey: ["customer-credit-ledger", customerId] });
      toast.success("Crédito do cliente registrado.");
    } catch (error: any) { toast.error(error?.message ?? "Não foi possível registrar o crédito."); }
    finally { setBusy(false); }
  }

  async function reverse(entryId: string) {
    const reason = window.prompt("Motivo do estorno do crédito:");
    if (!reason || reason.trim().length < 5) return;
    setBusy(true);
    try {
      await reverseCustomerCredit(entryId, reason.trim());
      await queryClient.invalidateQueries({ queryKey: ["customer-credit", customerId] });
      await queryClient.invalidateQueries({ queryKey: ["customer-credit-ledger", customerId] });
      toast.success("Movimento estornado e registrado no extrato.");
    } catch (error: any) { toast.error(error?.message ?? "Não foi possível estornar."); }
    finally { setBusy(false); }
  }

  return <Card>
    <CardHeader><CardTitle>Créditos dos clientes</CardTitle>
      <p className="text-sm text-muted-foreground">Saldo por moeda, depósitos, diferenças de entrega e abatimentos em pedidos.</p>
    </CardHeader>
    <CardContent className="space-y-5">
      <div className="max-w-md space-y-1"><Label>Cliente</Label>
        <Select value={customerId} onValueChange={setCustomerId}>
          <SelectTrigger><SelectValue placeholder="Selecione um cliente" /></SelectTrigger>
          <SelectContent>{customers.map((customer) =>
            <SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {customerId && <>
        <div className="flex flex-wrap gap-3">
          {(["BRL", "USD", "PYG"] as Currency[]).map((code) => <div key={code} className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">{code}</p>
            <strong>{formatMoney(Number(balances.find((entry) => entry.currency === code)?.balance ?? 0), code)}</strong>
          </div>)}
        </div>
        <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end">
          <div><Label>Moeda</Label><Select value={currency} onValueChange={(value) => setCurrency(value as Currency)}>
            <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
              {(["BRL", "USD", "PYG"] as Currency[]).map((code) => <SelectItem key={code} value={code}>{code}</SelectItem>)}
            </SelectContent></Select></div>
          <div><Label>Valor recebido como crédito</Label><Input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" /></div>
          <div><Label>Motivo e referência do recebimento</Label><Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ex.: depósito recebido em 29/09, comprovante..." /></div>
          <Button type="button" onClick={deposit} disabled={busy}>Registrar crédito</Button>
        </div>
        <div className="space-y-2"><h3 className="font-medium">Extrato recente</h3>
          {entries.length === 0 && <p className="text-sm text-muted-foreground">Nenhum movimento.</p>}
          {entries.map((entry) => <div key={entry.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">
            <span>{new Date(entry.created_at).toLocaleString("pt-BR")}</span>
            <strong className={entry.amount < 0 ? "text-destructive" : "text-primary"}>{formatMoney(entry.amount, entry.currency)}</strong>
            <span className="min-w-40 flex-1">{entry.note}</span>
            {entry.kind !== "reversal" && !reversedIds.has(entry.id) &&
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => reverse(entry.id)}>Estornar</Button>}
          </div>)}
        </div>
      </>}
    </CardContent>
  </Card>;
}
