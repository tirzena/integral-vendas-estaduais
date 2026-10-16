/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useAuth";
import { authenticatedFileClient } from "@/lib/authenticated-storage";
import { formatMoney } from "@/lib/format";
import { memberReceiptForSignature } from "@/lib/payment-receipt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function MemberPaymentReceipts() {
  const { userId, viewAs } = useCurrentUser();
  const client = useQueryClient();
  const [showSigned, setShowSigned] = useState(false),
    [signed, setSigned] = useState<Record<string, boolean>>({}),
    [busy, setBusy] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["member-payment-receipts", userId],
    enabled: !!userId && !viewAs,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("remuneration_member_receipts");
      if (error) throw error;
      return data as any[];
    },
  });
  async function open(entry: any) {
    try {
      const { client } = await authenticatedFileClient();
      const { data, error } = await client.storage
        .from("team-payment-receipts")
        .createSignedUrl(entry.member_receipt_path, 300);
      if (error || !data?.signedUrl) throw error ?? new Error("Recibo indisponível.");
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error((error as Error).message);
    }
  }
  async function upload(entry: any, file: File) {
    if (!signed[entry.id]) return void toast.error("Confirme que o recibo está assinado.");
    if (
      !file.size ||
      file.size > 10 * 1024 * 1024 ||
      !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.type)
    )
      return void toast.error("Use PDF, JPG, PNG ou WebP de até 10 MB.");
    setBusy(entry.id);
    try {
      const { client: storage } = await authenticatedFileClient();
      const path = `${entry.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]+/g, "-")}`;
      const upload = await storage.storage
        .from("team-payment-receipts")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upload.error) throw upload.error;
      const saved = await (supabase as any).rpc("remuneration_attach_member_receipt", {
        p_entry: entry.id,
        p_path: path,
        p_signed: true,
      });
      if (saved.error) throw saved.error;
      await client.invalidateQueries({ queryKey: ["member-payment-receipts"] });
      toast.success("Recibo assinado anexado e registrado no histórico.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  }
  if (viewAs) return null;
  if (!query.isLoading && !query.error && !query.data?.length) return null;
  return (
    <section className="my-5 space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Recibos de pagamentos aos membros</h2>
        <Button variant="ghost" size="sm" onClick={() => setShowSigned(!showSigned)}>
          {showSigned ? "Mostrar pendentes" : "Incluir recibos assinados"}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Após receber o pagamento, gere o recibo, assine e anexe o arquivo. Os valores permanecem
        vinculados ao lançamento da folha.
      </p>
      {query.isLoading ? (
        <p>Carregando recibos…</p>
      ) : query.error ? (
        <p role="alert">Não foi possível carregar os recibos.</p>
      ) : (
        query.data
          ?.filter((e) => showSigned || !e.member_receipt_path)
          .map((entry) => (
            <article key={entry.id} className="space-y-3 rounded-lg bg-muted/30 p-3">
              <div>
                <p className="font-medium">
                  {entry.full_name} · {formatMoney(Number(entry.amount), entry.currency)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {entry.description} · {entry.paid_at?.split("-").reverse().join("/")}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    memberReceiptForSignature({
                      member: entry.full_name,
                      amount: Number(entry.amount),
                      currency: entry.currency,
                      date: entry.paid_at,
                      reference: entry.id,
                      description: entry.description,
                    })
                  }
                >
                  Gerar recibo para assinatura
                </Button>
                {entry.member_receipt_path && (
                  <Button size="sm" variant="outline" onClick={() => open(entry)}>
                    Abrir recibo assinado
                  </Button>
                )}
              </div>
              {!entry.member_receipt_path && (
                <>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!!signed[entry.id]}
                      onChange={(e) => setSigned({ ...signed, [entry.id]: e.target.checked })}
                    />
                    O arquivo contém a assinatura do membro que recebeu o pagamento.
                  </label>
                  <Input
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    disabled={!!busy || !signed[entry.id]}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void upload(entry, file);
                      e.target.value = "";
                    }}
                  />
                  {busy === entry.id && <p className="text-xs">Enviando e registrando o recibo…</p>}
                </>
              )}
            </article>
          ))
      )}
    </section>
  );
}
