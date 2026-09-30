export const normalizeBoxCode = (value: string) => value.replace(/[\s-]/g, "").toUpperCase();
export const validBoxCode = (value: string) => /^[A-F0-9]{32}$/.test(normalizeBoxCode(value));
export const formatBoxCode = (value: string) =>
  normalizeBoxCode(value)
    .match(/.{1,4}/g)
    ?.join("-") ?? "";
export type AuthenticityResult = {
  status: "registered" | "already_used" | "not_found" | "inactive" | "limited";
  firstValidatedAt?: string;
};
export type AuthenticityBatch = {
  id: string;
  lot_number: string;
  product_name: string;
  manufacture_date: string;
  expiry_date: string;
  quantity: number;
  active: boolean;
  purchase_item_id: string;
  created_at: string;
};
