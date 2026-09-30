/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery } from "@tanstack/react-query";
import { Clock3, Sparkles, Tag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CurrencyValues } from "@/components/common/CurrencyValues";
import { formatDateTime } from "@/lib/format";

type ActivePromotion = {
  id: string;
  title: string;
  description: string | null;
  item_name: string;
  origin_label: string;
  starts_at: string;
  ends_at: string;
  currency: "BRL" | "USD" | "PYG";
  original_sale_price: number;
  promotional_sale_price: number;
};

export function PromotionCard() {
  const query = useQuery({
    queryKey: ["active-promotions"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("active_promotions_for_me");
      if (error) throw error;
      return (data ?? []) as ActivePromotion[];
    },
  });

  if (query.isLoading || query.isError || !query.data?.length) return null;

  return (
    <Card className="relative overflow-hidden border-2 border-emerald-400/80 bg-gradient-to-r from-emerald-50 via-background to-rose-50 shadow-[0_0_28px_rgba(16,185,129,0.28)] dark:from-emerald-950/40 dark:to-rose-950/30 motion-safe:animate-pulse">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-500" />
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-xl">
          <span className="rounded-full bg-emerald-500 p-2 text-white shadow-lg">
            <Sparkles className="size-5" />
          </span>
          Promoção
          <Badge className="bg-rose-500 text-white hover:bg-rose-500">ATIVA AGORA</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 lg:grid-cols-2">
        {query.data.map((promotion) => (
          <article key={promotion.id} className="rounded-xl border bg-background/90 p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{promotion.title}</p>
                <p className="text-sm text-muted-foreground">{promotion.item_name}</p>
              </div>
              <Badge variant="outline">{promotion.origin_label}</Badge>
            </div>
            {promotion.description && (
              <p className="mt-2 text-sm text-muted-foreground">{promotion.description}</p>
            )}
            <div className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-2">
              <div className="flex items-center gap-2">
                <Tag className="size-4 text-emerald-600" />
                <div>
                  <p className="text-xs text-muted-foreground line-through">
                    De {promotion.currency}{" "}
                    {Number(promotion.original_sale_price).toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                    })}
                  </p>
                  <div className="font-bold text-emerald-700 dark:text-emerald-300">
                    Por{" "}
                    <CurrencyValues
                      value={Number(promotion.promotional_sale_price)}
                      currency={promotion.currency}
                      layout="inline"
                      primaryFirst
                    />
                  </div>
                </div>
              </div>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock3 className="size-3.5" />
                {formatDateTime(promotion.starts_at)} até {formatDateTime(promotion.ends_at)}
              </p>
            </div>
          </article>
        ))}
      </CardContent>
    </Card>
  );
}
