import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type CommissionLine = {
  item_id: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  discount: number;
  commission_enabled: boolean;
  commission_percent: number;
};
type Preview = {
  commission_total: number;
  items: { commission_amount: number; commission_percent: number; commission_source?: string }[];
};

export function useCommissionPreview(input: {
  actor: string | null | undefined;
  sellerId: string;
  orderId: string | null | undefined;
  productId: string | null;
  exchange: Record<string, unknown> | null;
  lines: CommissionLine[];
  enabled: boolean;
}) {
  const request = JSON.stringify({
    p_seller_id: input.sellerId,
    p_order_id: input.orderId ?? null,
    p_exchange: input.exchange,
    p_items: input.lines.map((line) => {
      const total = Math.max(
        0,
        Math.round((line.quantity * line.unit_price - line.discount) * 100) / 100,
      );
      const enabled = input.enabled && line.commission_enabled;
      return {
        item_id: line.item_id,
        description: line.name,
        ...(!line.item_id ? { product_id: input.productId } : {}),
        total,
        commission_enabled: enabled,
        commission_percent: line.commission_percent,
        commission_amount: enabled ? Math.round(total * line.commission_percent) / 100 : 0,
      };
    }),
  });
  const [debounced, setDebounced] = useState(request);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(request), 300);
    return () => clearTimeout(timer);
  }, [request]);
  const valid = Boolean(input.actor && input.sellerId && input.exchange && input.lines.length);
  const query = useQuery({
    queryKey: ["order-commission-preview", input.actor, debounced],
    enabled: valid && request === debounced,
    staleTime: 0,
    retry: false,
    queryFn: async () => {
      const client = supabase as unknown as {
        rpc: (
          name: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { message: string } | null }>;
      };
      const { data, error } = await client.rpc(
        "integral_preview_order_commission",
        JSON.parse(debounced),
      );
      if (error) throw new Error(error.message);
      return data as Preview;
    },
  });
  const data = valid && request === debounced ? query.data : undefined;
  return {
    data,
    pending: !valid || request !== debounced || query.isFetching || (!data && !query.error),
    error: query.error,
    hasAgreement: data?.items.some((line) => line.commission_source === "agreement") ?? false,
  };
}
