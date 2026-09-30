import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const shippingInput = z.object({
  items: z
    .array(
      z.object({
        itemId: z.string().uuid().nullable(),
        quantity: z.number().finite().min(0),
      }),
    )
    .min(1)
    .max(500),
  state: z.string().trim().max(50).default(""),
  country: z.string().trim().max(80).optional(),
  currency: z.enum(["BRL", "USD", "PYG"]),
  manualRates: z
    .object({ BRL: z.number().finite().positive(), PYG: z.number().finite().positive() })
    .optional(),
});

/** Calcula o frete sem expor ao navegador o custo interno de cada produto. */
export const calculateOrderShipping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => shippingInput.parse(data))
  .handler(async ({ data, context }) => {
    const itemIds = [
      ...new Set(data.items.map((entry) => entry.itemId).filter((id): id is string => !!id)),
    ];
    if (!itemIds.length) return { percentage: 0, shipping_cost: 0, currency: data.currency };

    // Esta RPC aplica cargo, equipe e acesso ao produto sem revelar custos internos.
    const { data: allowedItems, error: accessError } =
      await context.supabase.rpc("sales_items_for_sale");
    if (accessError) throw new Error("Não foi possível validar os produtos do pedido.");
    const allowedIds = new Set((allowedItems ?? []).map((item) => item.id));
    if (itemIds.some((id) => !allowedIds.has(id))) {
      throw new Error("Um produto do pedido está indisponível ou sem permissão.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inventory, error: inventoryError } = await supabaseAdmin
      .from("inventory_items")
      .select("id,cost,currency,freight_sp_percent,freight_py_percent,freight_other_brazil_percent")
      .in("id", itemIds);
    if (inventoryError || (inventory ?? []).length !== itemIds.length) {
      throw new Error("Não foi possível consultar o custo dos produtos.");
    }
    const now = new Date().toISOString();
    const { data: promotions, error: promotionsError } = await supabaseAdmin
      .from("promotions")
      .select("item_id,destination_scope,promotional_freight_percent")
      .in("item_id", itemIds)
      .eq("status", "active")
      .lte("starts_at", now)
      .gte("ends_at", now)
      .not("promotional_freight_percent", "is", null)
      .order("promotional_freight_percent", { ascending: true });
    if (promotionsError) throw new Error("Não foi possível consultar as promoções de frete.");
    const normalizedState = data.state.trim().toUpperCase();
    const normalizedCountry = (data.country ?? "Brasil").trim().toUpperCase();
    const isParaguay =
      normalizedCountry === "PARAGUAI" ||
      normalizedCountry === "PARAGUAY" ||
      normalizedState === "PY" ||
      normalizedState === "PARAGUAI";
    const percentageField = isParaguay
      ? "freight_py_percent"
      : normalizedState === "SP" ||
          normalizedState === "SÃO PAULO" ||
          normalizedState === "SAO PAULO"
        ? "freight_sp_percent"
        : "freight_other_brazil_percent";
    const destinationScope = isParaguay
      ? "py"
      : percentageField === "freight_sp_percent"
        ? "sp"
        : "other_brazil";

    const rates = new Map<string, number>();
    for (const source of new Set((inventory ?? []).map((item) => item.currency))) {
      if (source === data.currency) {
        rates.set(source, 1);
        continue;
      }
      if (data.manualRates) {
        const values: Record<string, number> = {
          USD: 1,
          BRL: data.manualRates.BRL,
          PYG: data.manualRates.PYG,
        };
        rates.set(source, values[data.currency] / values[source]);
        continue;
      }
      const { data: exchange, error } = await supabaseAdmin.rpc("financial_rate_at", {
        p_base: source,
        p_quote: data.currency,
        p_at: new Date().toISOString(),
      });
      const rate = Number(exchange?.[0]?.rate ?? 0);
      if (error || !(rate > 0)) {
        throw new Error(`Cotação de ${source} para ${data.currency} indisponível.`);
      }
      rates.set(source, rate);
    }

    const inventoryById = new Map((inventory ?? []).map((item) => [item.id, item]));
    let baseCost = 0;
    let shippingCost = 0;
    data.items.forEach((entry) => {
      if (!entry.itemId) return;
      const item = inventoryById.get(entry.itemId);
      if (!item) return;
      const lineCost = Number(item.cost ?? 0) * entry.quantity * (rates.get(item.currency) ?? 0);
      const freightPromotion = (promotions ?? []).find(
        (promotion) =>
          promotion.item_id === item.id &&
          (promotion.destination_scope === "all" ||
            promotion.destination_scope === destinationScope),
      );
      const effectivePercentage = freightPromotion
        ? Number(freightPromotion.promotional_freight_percent)
        : Number(item[percentageField] ?? 0);
      baseCost += lineCost;
      shippingCost += lineCost * (effectivePercentage / 100);
    });
    const percentage = baseCost > 0 ? (shippingCost / baseCost) * 100 : 0;

    return {
      percentage: Math.round(percentage * 100) / 100,
      currency: data.currency,
      shipping_cost: Math.round(shippingCost * 100) / 100,
    };
  });
