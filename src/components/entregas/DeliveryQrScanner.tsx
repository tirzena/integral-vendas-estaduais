import { useEffect, useId, useRef } from "react";
import { Camera } from "lucide-react";

function tokenFromResult(value: string) {
  const raw = value.trim();
  const match = raw.match(/\/confirmar-entrega\/([0-9a-f-]{36})(?:[/?#]|$)/i);
  if (match?.[1]) return match[1];
  return /^[0-9a-f-]{36}$/i.test(raw) ? raw : null;
}

export function DeliveryQrScanner({
  active,
  onToken,
  onInvalid,
}: {
  active: boolean;
  onToken: (token: string) => void;
  onInvalid: () => void;
}) {
  const id = `delivery-reader-${useId().replace(/:/g, "")}`;
  const handled = useRef(false);

  useEffect(() => {
    if (!active) return;
    handled.current = false;
    let scanner: import("html5-qrcode").Html5QrcodeScanner | null = null;
    let disposed = false;

    void import("html5-qrcode").then(({ Html5QrcodeScanner }) => {
      if (disposed) return;
      scanner = new Html5QrcodeScanner(
        id,
        { fps: 10, qrbox: { width: 240, height: 240 }, rememberLastUsedCamera: true },
        false,
      );
      scanner.render(
        (decodedText) => {
          if (handled.current) return;
          const token = tokenFromResult(decodedText);
          if (!token) {
            handled.current = true;
            onInvalid();
            return;
          }
          handled.current = true;
          void scanner?.clear().finally(() => onToken(token));
        },
        () => undefined,
      );
    });

    return () => {
      disposed = true;
      void scanner?.clear().catch(() => undefined);
    };
  }, [active, id, onInvalid, onToken]);

  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Camera className="size-4" /> Aponte a câmera para o QR Code da ordem de entrega.
      </p>
      <div id={id} className="overflow-hidden rounded-xl border bg-white" />
    </div>
  );
}
