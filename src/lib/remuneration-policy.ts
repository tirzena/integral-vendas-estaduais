export type PolicyTier = { threshold: number; amount: number };
export type PolicyGoal = {
  scope: "individual" | "team";
  metric: "units" | "revenue" | "orders" | "profit";
  period: "day" | "week" | "month" | "custom";
  statuses: string[];
  conditions: "any" | "all";
  member_ids: string[];
  starts_at?: string;
  ends_at?: string;
  tiers: PolicyTier[];
};
export type PolicyRule = {
  kind: "commission" | "salary" | "bonus" | "prolabore" | "other";
  basis: "sale" | "cost" | "cost_freight" | "profit" | "custom";
  basis_value?: number;
  type: "percent" | "fixed";
  amount: number;
  currency: "BRL" | "USD" | "PYG";
  period: "per_sale" | "per_unit" | "day" | "week" | "month";
  item_ids: string[];
  category_ids: string[];
  product_ids: string[];
  combination: "max" | "sum" | "sum_rates" | "individual";
  goals: PolicyGoal[];
};
export const newPolicyRule = (): PolicyRule => ({
  kind: "commission",
  basis: "sale",
  type: "percent",
  amount: 0,
  currency: "BRL",
  period: "per_sale",
  item_ids: [],
  category_ids: [],
  product_ids: [],
  combination: "max",
  goals: [],
});
export const newPolicyGoal = (): PolicyGoal => ({
  scope: "individual",
  metric: "units",
  period: "month",
  statuses: ["approved"],
  conditions: "any",
  member_ids: [],
  tiers: [{ threshold: 0, amount: 0 }],
});

/** Full rate replacement: 5 -> 6 creates a one-point complement, never 5 + 6. */
export function goalRate(
  base: number,
  goals: { scope: string; progress: number; tiers: PolicyTier[] }[],
  combination: PolicyRule["combination"],
) {
  let team = base,
    individual = base;
  for (const goal of goals) {
    let rate = base;
    for (const tier of [...goal.tiers].sort((a, b) => a.threshold - b.threshold))
      if (goal.progress >= tier.threshold) rate = tier.amount;
    if (goal.scope === "team") team = Math.max(team, rate);
    else individual = Math.max(individual, rate);
  }
  return combination === "sum_rates"
    ? team > base && individual > base
      ? team + individual
      : Math.max(team, individual)
    : combination === "sum"
      ? base + (team - base) + (individual - base)
      : combination === "individual"
        ? individual
        : Math.max(team, individual);
}
