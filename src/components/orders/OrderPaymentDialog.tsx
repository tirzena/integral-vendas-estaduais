import { PaymentProofFile } from "@/components/orders/PaymentProofFile";
import { cashReceiptForSignature } from "@/lib/payment-receipt";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatMoney } from "@/lib/format";
export function OrderPaymentDialog({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const client = useQueryClient(),
    [amount, setAmount] = useState(""),
    [method, setMethod] = useState("pix"),
    [date, setDate] = useState(() => new Date().toLocaleDateString("en-CA")),
    [proof, setProof] = useState(""),
    [notes, setNotes] = useState(""),
    [busy, setBusy] = useState(false);
  const [proofPath, setProofPath] = useState("");
  const [uploading, setUploading] = useState(false);
  const [cashSigned, setCashSigned] = useState(false);
  const [receiptReference] = useState(() => crypto.randomUUID());
  const request = useRef({ key: "", id: crypto.randomUUID() });
  const query = useQuery({
    queryKey: ["payment-order-context", orderId],
    queryFn: async () => {
      const r = await (supabase as any).rpc("integral_order_context", { p_order_id: orderId });
      if (r.error) throw r.error;
      return r.data;
    },
  });
  async function submit() {
    if (busy || uploading) return;
    if (!proofPath && !(method !== "dinheiro" && /^https:\/\//i.test(proof)))
      return void toast.error("Anexe o comprovante ou o recibo assinado.");
    if (method === "dinheiro" && !cashSigned)
      return void toast.error("Confirme as assinaturas no recibo.");
    const numeric = Number(amount.replace(",", "."));
    if (!Number.isFinite(numeric) || numeric <= 0)
      return void toast.error("Informe um valor positivo.");
    const payload = {
      received_amount: numeric,
      method,
      paid_at: date,
      proof_url: proof.trim(),
      proof_path: proofPath || null,
      cash_receipt_signed: cashSigned,
      receipt_reference: receiptReference,
      notes: notes.trim(),
    };
    const key = JSON.stringify(payload);
    if (request.current.key !== key) request.current = { key, id: crypto.randomUUID() };
    setBusy(true);
    try {
      const r = await (supabase as any).rpc("integral_register_payment", {
        p_order_id: orderId,
        p_request_id: request.current.id,
        p_payment: payload,
      });
      if (r.error) throw r.error;
      toast.success(
        r.data.status === "pendente"
          ? "Pagamento registrado e aguardando conferência financeira."
          : "Pagamento registrado.",
      );
      await client.invalidateQueries();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const data = query.data,
    cur = data?.currency ?? "BRL";
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Lançar pagamento · Pedido #{data?.number ?? ""}</DialogTitle>
        </DialogHeader>
        {query.isLoading ? (
          <p>Carregando…</p>
        ) : query.error ? (
          <p role="alert">{(query.error as Error).message}</p>
        ) : (
          data && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted p-3 text-sm">
                <p>
                  Total
                  <br />
                  {formatMoney(Number(data.total), cur)}
                </p>
                <p>
                  Pago
                  <br />
                  {formatMoney(Number(data.paid), cur)}
                </p>
                <p>
                  Saldo
                  <br />
                  {formatMoney(Number(data.receivable), cur)}
                </p>
              </div>
              <label className="grid gap-1 text-sm">
                Forma de pagamento
                <select
                  className="h-10 rounded-md border bg-background px-3"
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                >
                  {[
                    ["pix", "PIX"],
                    ["dinheiro", "Dinheiro"],
                    ["transferencia", "Transferência"],
                    ["cartao", "Cartão"],
                    ["boleto", "Boleto"],
                  ].map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                Valor do novo pagamento ({method === "pix" ? "BRL" : cur})
                <Input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <p className="text-xs text-muted-foreground">
                Câmbio do pedido:{" "}
                {["BRL", "USD", "PYG"]
                  .filter(
                    (currency) =>
                      currency !== cur && data.exchange_rates_snapshot?.[currency] != null,
                  )
                  .map(
                    (currency) =>
                      `1 ${cur} = ${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 6 }).format(Number(data.exchange_rates_snapshot[currency]))} ${currency}`,
                  )
                  .join(" · ") || "Cotação não registrada"}
              </p>
              <label className="grid gap-1 text-sm">
                Data do pagamento
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <PaymentProofFile
                orderId={orderId}
                onChange={setProofPath}
                onBusyChange={setUploading}
              />
              {method === "dinheiro" && (
                <div className="space-y-3 rounded-lg border p-3">
                  <p className="text-sm">
                    Gere o recibo, imprima, colha as assinaturas do vendedor e do financeiro ou
                    administrador e anexe o arquivo assinado.
                  </p>
                  <Button
                    variant="outline"
                    disabled={!(Number(amount.replace(",", ".")) > 0) || !date}
                    onClick={() =>
                      cashReceiptForSignature({
                        orderNumber: String(data.number),
                        customer: data.order?.delivery_recipient_name || "",
                        amount: Number(amount.replace(",", ".")),
                        currency: cur,
                        date,
                        reference: receiptReference,
                      })
                    }
                  >
                    Gerar recibo para assinatura
                  </Button>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={cashSigned}
                      onChange={(e) => setCashSigned(e.target.checked)}
                    />
                    O recibo anexado contém as assinaturas do vendedor e do financeiro ou
                    administrador.
                  </label>
                </div>
              )}
              {data.order?.approval_status && data.order.approval_status !== "approved" && (
                <p role="alert" className="text-sm text-destructive">
                  Aguarde a aprovação do pedido antes de registrar pagamentos.
                </p>
              )}
              {method !== "dinheiro" && (
                <label className="grid gap-1 text-sm">
                  Link HTTPS do comprovante (alternativa para registros anteriores)
                  <Input type="url" value={proof} onChange={(e) => setProof(e.target.value)} />
                </label>
              )}
              <label className="grid gap-1 text-sm">
                Observações
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
            </div>
          )
        )}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={
              busy ||
              uploading ||
              !data?.can_pay ||
              (data.order?.approval_status && data.order.approval_status !== "approved")
            }
            onClick={submit}
          >
            {busy ? "Registrando…" : "Registrar pagamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
