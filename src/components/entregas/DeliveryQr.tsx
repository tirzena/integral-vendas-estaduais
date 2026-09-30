import { useEffect, useRef, useState } from "react";
import { Copy, Download, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function DeliveryQr({
  token,
  number,
  compact = false,
}: {
  token: string;
  number: string | number;
  compact?: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [url, setUrl] = useState("");

  useEffect(() => {
    setUrl(`${window.location.origin}/confirmar-entrega/${token}`);
  }, [token]);

  async function copyLink() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    toast.success("Link protegido da confirmação copiado.");
  }

  function downloadQr() {
    const svg = svgRef.current;
    if (!svg) return;
    const content = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([content], { type: "image/svg+xml;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `qr-entrega-${String(number).padStart(2, "0")}.svg`;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
    toast.success("QR Code da entrega gerado.");
  }

  if (!url) return null;

  return (
    <div className={compact ? "flex flex-wrap items-center gap-3" : "rounded-xl border p-4"}>
      <div className="rounded-lg bg-white p-2">
        <QRCodeSVG
          ref={svgRef}
          value={url}
          size={compact ? 112 : 176}
          level="H"
          marginSize={2}
          title={`Confirmar entrega do pedido ${number}`}
        />
      </div>
      <div className="space-y-2">
        <div>
          <p className="flex items-center gap-2 font-medium">
            <QrCode className="size-4" /> QR Code da entrega
          </p>
          <p className="max-w-sm text-xs text-muted-foreground">
            A leitura exige login autorizado e registra entregador, data e hora.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={copyLink}>
            <Copy className="mr-1.5 size-4" /> Copiar link
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={downloadQr}>
            <Download className="mr-1.5 size-4" /> Baixar QR
          </Button>
        </div>
      </div>
    </div>
  );
}
