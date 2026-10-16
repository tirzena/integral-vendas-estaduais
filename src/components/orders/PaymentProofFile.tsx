import { useState } from "react";
import { toast } from "sonner";
import { authenticatedFileClient } from "@/lib/authenticated-storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PaymentProofFile({
  orderId,
  onChange,
  onBusyChange,
}: {
  orderId: string;
  onChange: (path: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [uploading, setUploading] = useState(false);
  async function upload(file: File) {
    if (
      !file.size ||
      file.size > 10 * 1024 * 1024 ||
      !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.type)
    )
      return void toast.error("Use PDF, JPG, PNG ou WebP de até 10 MB.");
    setUploading(true);
    onBusyChange(true);
    try {
      const { client } = await authenticatedFileClient();
      const path = `${orderId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]+/g, "-")}`;
      const { error } = await client.storage
        .from("payment-proofs")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      onChange(path);
      setName(file.name);
      toast.success("Arquivo enviado. Confira os dados antes de registrar o pagamento.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setUploading(false);
      onBusyChange(false);
    }
  }
  return (
    <label className="grid gap-1 text-sm">
      Comprovante ou recibo assinado
      <Input
        disabled={uploading}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = "";
        }}
      />
      <span className="text-xs text-muted-foreground">
        {uploading
          ? "Enviando arquivo…"
          : name || "Anexe o documento para a conferência financeira."}
      </span>
    </label>
  );
}

export function PaymentProofLink({ path, name }: { path: string; name?: string | null }) {
  const [busy, setBusy] = useState(false);
  async function open() {
    setBusy(true);
    try {
      const { client } = await authenticatedFileClient();
      const { data, error } = await client.storage
        .from("payment-proofs")
        .createSignedUrl(path, 300);
      if (error || !data?.signedUrl) throw error ?? new Error("Não foi possível abrir o arquivo.");
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button type="button" size="sm" variant="outline" disabled={busy} onClick={open}>
      {busy ? "Abrindo…" : name || "Abrir comprovante"}
    </Button>
  );
}
