import { describe, expect, it } from "vitest";
import { deliveryState } from "./delivery";
describe("lost delivery classification", () => {
  it("keeps a lost delivery out of delivered totals even with an old arrival date", () => {
    expect(deliveryState({ fulfillment_status: "perdido", delivered_at: "2026-09-01", status: "entregue" })).toBe("perdido");
  });
  it("keeps losses separate from deadline delays", () => {
    expect(deliveryState({ workflow_stage: "perdido", delivery_deadline: "2020-01-01" })).toBe("perdido");
  });
});
