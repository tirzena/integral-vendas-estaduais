/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { purchasePosition } from "./purchase-position";

export const getPurchasePositions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [active, capability] = await Promise.all([
      context.supabase.from("profiles").select("is_active").eq("id", context.userId).single(),
      context.supabase.rpc("app_has_cap", { _uid: context.userId, _cap: "company_finance" }),
    ]);
    if (active.error || !active.data?.is_active || capability.error || !capability.data)
      throw new Error("Sem permissão para consultar custos financeiros.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const all = async (query: any) => {
      const rows: any[] = [];
      for (let offset = 0; ; offset += 500) {
        const result = await query.order("id").range(offset, offset + 499);
        if (result.error) throw new Error("Não foi possível calcular os custos faturados.");
        rows.push(...result.data);
        if (result.data.length < 500) return rows;
      }
    };
    const [purchases, receipts] = await Promise.all([
      all(
        db
          .from("purchase_orders")
          .select(
            "id,total,merchandise_total,amount_paid,currency,status,source_type,account_payable_id,due_date,purchase_order_items(id,item_id,description,quantity,total)",
          ),
      ),
      all(
        db
          .from("stock_lot_receipts")
          .select(
            "id,purchase_item_id,quantity,stock_lot_movements(quantity,orders(id,status,workflow_stage,deleted_at,superseded_at))",
          ),
      ),
    ]);
    return purchases.map((purchase) => ({
      id: purchase.id,
      accountId: purchase.account_payable_id,
      currency: purchase.currency,
      dueDate: purchase.due_date,
      ...purchasePosition(purchase, receipts),
    }));
  });
