/* eslint-disable @typescript-eslint/no-explicit-any */

export type DeliveryState =
  "perdido" | "cancelado" | "entregue" | "atrasado" | "risco" | "em_curso" | "sem_prazo";

export const DELIVERY_LABEL: Record<DeliveryState, string> = {
  perdido: "Perdido",
  cancelado: "Cancelado",
  entregue: "Entregue",
  atrasado: "Atrasado",
  risco: "Risco de atrasar",
  em_curso: "Em curso",
  sem_prazo: "Sem prazo definido",
};

const DAY = 86_400_000;

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY);
}

/** Prazo final considerando os dias de tolerância. */
export function limitDate(order: any): Date | null {
  if (!order?.delivery_deadline) return null;
  const base = new Date(`${order.delivery_deadline}T23:59:59`);
  if (Number.isNaN(base.getTime())) return null;
  return addDays(base, Number(order.grace_days ?? 0));
}

/** Situação de entrega calculada a partir das datas do pedido. */
export function deliveryState(order: any, now = new Date()): DeliveryState {
  if (order?.fulfillment_status === "perdido" || order?.workflow_stage === "perdido")
    return "perdido";
  if (order?.status === "cancelado") return "cancelado";
  const limit = limitDate(order);
  if (order?.delivered_at) {
    const arrived = new Date(`${order.delivered_at}T12:00:00`);
    if (limit && arrived.getTime() > limit.getTime()) return "atrasado";
    return "entregue";
  }
  if (order?.status === "entregue") return "entregue";
  if (!limit) return "sem_prazo";
  if (now.getTime() > limit.getTime()) return "atrasado";
  if (limit.getTime() - now.getTime() <= 3 * DAY) return "risco";
  return "em_curso";
}

/** Quantos dias de atraso (0 quando dentro do prazo). */
export function delayDays(order: any, now = new Date()): number {
  const limit = limitDate(order);
  if (!limit) return 0;
  const end = order?.delivered_at ? new Date(`${order.delivered_at}T12:00:00`) : now;
  const diff = end.getTime() - limit.getTime();
  return diff > 0 ? Math.ceil(diff / DAY) : 0;
}

export function stateTone(
  state: DeliveryState,
): "default" | "secondary" | "destructive" | "outline" {
  if (state === "atrasado") return "destructive";
  if (state === "entregue") return "default";
  if (state === "risco") return "outline";
  return "secondary";
}
