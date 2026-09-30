import { getPurchasePositions } from "@/lib/purchase-position.functions";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useRates } from "@/hooks/useRates";
import { periodStart, type RankingPeriod } from "@/hooks/useRanking";
import type { FinanceDateRange } from "@/lib/finance-date-range";
import { calculateFinance, type FinanceCashEvent } from "@/lib/finance-totals";
const db = supabase as any;
export function useFinanceTotals(period: RankingPeriod, productId: string | "todos", dateRange?: FinanceDateRange) {
  const { convert, ready } = useRates();
  const { seesCompanyFinance, userId, viewAs } = usePermissions();
  const query = useQuery({
    queryKey: ["finance-summary", productId, userId, viewAs],
    enabled: seesCompanyFinance,
    queryFn: async () => {
      const pid = productId === "todos" ? null : productId;
      const scoped = (q: any) => q;
      let withdrawalsAvailable = true;
      const all = async (q: any) => {
        const rows: any[] = [];
        for (let offset = 0; ; offset += 500) {
          const result = await q.order("id").range(offset, offset + 499);
          if (result.error) throw result.error;
          rows.push(...(result.data ?? []));
          if ((result.data ?? []).length < 500) break;
        }
        return rows;
      };
      const [
        orders,
        payments,
        purchases,
        purchasePayments,
        receivable,
        payable,
        payroll,
        investments,
        awards,
        movements,
        items,
        withdrawals,
        orderItems,
        purchasePositions,
      ] = await Promise.all([
        all(scoped(db.from("orders").select("*").is("deleted_at", null).is("superseded_at", null))),
        all(db.from("payments").select("*")),
        all(db.from("purchase_orders").select("*,purchase_order_items(*)")),
        all(db.from("purchase_payments").select("*")),
        all(scoped(db.from("accounts_receivable").select("*"))),
        all(scoped(db.from("accounts_payable").select("*"))),
        all(scoped(db.from("payroll_entries").select("*"))),
        all(scoped(db.from("investments").select("*"))),
        all(scoped(db.from("bonus_awards").select("*"))),
        all(scoped(db.from("cash_movements").select("*"))),
        all(scoped(db.from("inventory_items").select("id,product_id"))),
        all(db.from("profit_withdrawals").select("*,profit_shares(product_id)")).catch(
          (error: any) => {
            if (error.code === "PGRST205" || error.code === "42P01") {
              withdrawalsAvailable = false;
              return [];
            }
            throw error;
          },
        ),
        all(db.from("order_items").select("id,order_id,item_id,quantity,total")),
        getPurchasePositions(),
      ]);
      return {
        purchasePositions,
        orders,
        orderItems,
        payments,
        purchases,
        purchasePayments,
        receivable,
        payable,
        payroll,
        investments,
        awards,
        movements,
        productId: pid,
        items,
        itemIds: new Set(
          items.filter((i: any) => !pid || i.product_id === pid).map((i: any) => i.id),
        ),
        withdrawals,
        withdrawalsAvailable,
      };
    },
  });
  const result = useMemo(() => {
    const events: FinanceCashEvent[] = [];
    const totals = calculateFinance(
      query.data ?? {},
      dateRange ? dateRange.from : periodStart(period),
      convert,
      dateRange?.through ?? new Date(),
      events,
    );
    return { totals, events };
  }, [query.data, period, dateRange?.from?.getTime(), dateRange?.through.getTime(), convert]);
  const { totals, events } = result;
  return {
    totals,
    events,
    data: query.data,
    loading: query.isLoading,
    ratesReady: ready,
    error: query.error,
  };
}
