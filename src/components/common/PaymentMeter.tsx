import { paymentProgress } from "@/lib/finance-dashboard";

export function PaymentMeter({
  paid, total, pending = 0, outgoing = false,
}: { paid: number; total: number; pending?: number; outgoing?: boolean }) {
  const confirmedPercent = paymentProgress(Math.max(0, Number(paid) || 0), total);
  const pendingPercent = Math.min(100 - confirmedPercent, paymentProgress(Math.max(0, Number(pending) || 0), total));
  const percent = confirmedPercent + pendingPercent;
  const format = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  const label = pendingPercent > 0
    ? `Confirmado ${format(confirmedPercent)}% · Em análise ${format(pendingPercent)}%`
    : `Pago ${format(confirmedPercent)}%`;
  return <div className="my-3 min-w-44">
    <p className={`mb-1 text-xs font-medium ${pendingPercent > 0 ? "text-orange-600 dark:text-orange-400" : outgoing ? "text-red-600" : "text-emerald-600"}`}>{label}</p>
    <div role="progressbar" aria-label="Pagamento confirmado e aguardando conferência"
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={label}
      className="flex h-2 overflow-hidden rounded-full bg-muted">
      <div className={`h-full ${outgoing ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${confirmedPercent}%` }} />
      <div className="h-full bg-orange-500" style={{ width: `${pendingPercent}%` }} />
    </div>
  </div>;
}
