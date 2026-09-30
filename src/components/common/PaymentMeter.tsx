import { paymentProgress } from "@/lib/finance-dashboard";
export function PaymentMeter({
  paid,
  total,
  outgoing = false,
}: {
  paid: number;
  total: number;
  outgoing?: boolean;
}) {
  const percent = paymentProgress(paid, total);
  return (
    <div className="my-3 min-w-44">
      <p className={`mb-1 text-xs font-medium ${outgoing ? "text-red-600" : "text-emerald-600"}`}>
        Pago {percent.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
      </p>
      <div
        role="progressbar"
        aria-label="Percentual pago"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={`h-full ${outgoing ? "bg-red-500" : "bg-emerald-500"}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
