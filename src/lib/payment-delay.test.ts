import { describe, expect, it } from "vitest";
import { collectionWorkflow, paymentDelayDays } from "./payment-delay";

const now = new Date("2026-10-16T15:00:00Z");
const order = { delivered_at: "2026-10-13", total: 100, amount_paid: 0, status: "faturado", approval_status: "approved", workflow_stage: "em_caminho" };

describe("payment delay after delivery", () => {
  it("starts on the third day and counts from delivery, including the grace period", () => {
    expect(paymentDelayDays({ ...order, delivered_at: "2026-10-14" }, false, now)).toBe(0);
    expect(paymentDelayDays(order, false, now)).toBe(3);
    expect(paymentDelayDays({ ...order, delivered_at: "2026-10-11" }, false, now)).toBe(5);
    expect(collectionWorkflow(order, false, now)).toBe("esperando_pagamento");
  });
  it("keeps a recorded payment awaiting financial review out of the overdue state", () => {
    expect(paymentDelayDays(order, true, now)).toBe(0);
    expect(collectionWorkflow({ ...order, workflow_stage: "esperando_pagamento" }, true, now)).toBe("payment_pending");
    expect(paymentDelayDays({ ...order, amount_paid: 1 }, false, now)).toBe(0);
  });
  it("excludes cancelled, lost, unapproved and undelivered orders", () => {
    for (const extra of [{ status: "cancelado" }, { workflow_stage: "perdido" }, { approval_status: "pending" }, { delivered_at: null }]) {
      expect(paymentDelayDays({ ...order, ...extra }, false, now)).toBe(0);
    }
  });
  it("uses the date in São Paulo at midnight", () => {
    expect(paymentDelayDays(order, false, new Date("2026-10-16T02:59:59Z"))).toBe(0);
    expect(paymentDelayDays(order, false, new Date("2026-10-16T03:00:00Z"))).toBe(3);
  });
});
