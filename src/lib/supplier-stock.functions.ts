import { purchasePosition } from "./purchase-position";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
async function scope(context: any, supplierId?: string, requireAdmin = false) {
  const active = await context.supabase
    .from("profiles")
    .select("is_active")
    .eq("id", context.userId)
    .single();
  if (active.error || !active.data.is_active) throw new Error("Acesso inativo.");
  const role = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (role.error) throw new Error("Não foi possível conferir seu acesso.");
  if (!role.data) {
    if (requireAdmin)
      throw new Error("Apenas administradores podem receber compras no estoque principal.");
    const assignment = await context.supabase
      .from("supplier_user_assignments")
      .select("supplier_id")
      .eq("user_id", context.userId)
      .single();
    if (assignment.error || (supplierId && assignment.data.supplier_id !== supplierId))
      throw new Error("Fornecedor não vinculado ao seu acesso.");
    supplierId = assignment.data.supplier_id;
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { db: supabaseAdmin as any, supplierId, isAdmin: !!role.data };
}
export const getSupplierStock = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        supplierId: z.string().uuid().optional(),
        warehouseId: z.string().uuid().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { db, supplierId, isAdmin } = await scope(context, data.supplierId, !!data.warehouseId);
    let lotsQuery = db
      .from("supplier_stock_lots")
      .select("*, inventory_items(name,sku), authenticity_batches(id,active)")
      .order("created_at", { ascending: false });
    let itemsQuery = db
      .from("inventory_items")
      .select("id,name,sku,supplier_id,currency,cost")
      .order("name");
    if (supplierId) {
      lotsQuery = lotsQuery.eq("supplier_id", supplierId);
      itemsQuery = itemsQuery.eq("supplier_id", supplierId);
    }
    const [lots, items] = await Promise.all([lotsQuery, itemsQuery]);
    if (lots.error || items.error)
      throw new Error("Não foi possível carregar os lotes do estoque.");
    let receipts: any[] = [];
    if (isAdmin) {
      let q = db
        .from("stock_lot_receipts")
        .select(
          "*, supplier_stock_lots(lot_number,item_id,supplier_id,inventory_items(name),authenticity_batches(id)),purchase_order_items(purchase_order_id,purchase_orders(number)),stock_lot_balances(warehouse_id,quantity),stock_lot_movements(order_id,quantity,orders(number,revision_no,fulfillment_status,workflow_stage))",
        );
      if (data.warehouseId) q = q.eq("warehouse_id", data.warehouseId);
      const r = await q;
      if (r.error) throw new Error("Não foi possível carregar o percurso dos lotes.");
      receipts = r.data.map((row: any) => ({
        ...row,
        available: data.warehouseId
          ? (row.stock_lot_balances?.find((b: any) => b.warehouse_id === data.warehouseId)
              ?.quantity ?? 0)
          : row.available,
      }));
    }
    return { lots: lots.data, items: items.data, receipts, isAdmin, supplierId };
  });
export const registerSupplierLot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        supplierId: z.string().uuid(),
        itemId: z.string().uuid(),
        lot: z.string().trim().min(1).max(80),
        purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        manufacture: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        expiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        quantity: z.number().int().min(1).max(50000),
        unitCost: z.number().positive(),
        currency: z.enum(["BRL", "USD", "PYG"]),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { db } = await scope(context, data.supplierId);
    const { randomBytes, createHash } = await import("node:crypto");
    const codes = Array.from({ length: data.quantity }, () => {
      const code = randomBytes(16).toString("hex").toUpperCase();
      return { code, hash: createHash("sha256").update(code).digest("hex") };
    });
    const r = await db.rpc("supplier_stock_lot_create", {
      p_supplier: data.supplierId,
      p_item: data.itemId,
      p_lot: data.lot,
      p_purchase: data.purchaseDate,
      p_manufacture: data.manufacture,
      p_expiry: data.expiry,
      p_cost: data.unitCost,
      p_currency: data.currency,
      p_codes: codes,
      p_actor: context.userId,
    });
    if (r.error)
      throw new Error(
        "Não foi possível registrar. Confira produto, datas e se esse lote já existe.",
      );
    return { batchId: r.data as string };
  });
export const receiveSupplierLots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        supplierId: z.string().uuid(),
        warehouseId: z.string().uuid(),
        currency: z.enum(["BRL", "USD", "PYG"]),
        purchaseDate: z.string(),
        dueDate: z.string().nullable(),
        items: z
          .array(
            z.object({
              lot_id: z.string().uuid(),
              quantity: z.number().int().positive(),
              bonus_quantity: z.number().int().nonnegative(),
              unit_cost: z.number().positive(),
            }),
          )
          .min(1),
        freight: z.number().nonnegative(),
        variable: z.number().nonnegative(),
        notes: z.string().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { db } = await scope(context, data.supplierId, true);
    const r = await db.rpc("purchase_from_supplier_lots", {
      p_supplier: data.supplierId,
      p_warehouse: data.warehouseId,
      p_currency: data.currency,
      p_purchase: data.purchaseDate,
      p_due: data.dueDate,
      p_items: data.items,
      p_freight: data.freight,
      p_variable: data.variable,
      p_notes: data.notes,
      p_actor: context.userId,
    });
    if (r.error) throw new Error(r.error.message || "Não foi possível receber a compra.");
    return r.data;
  });

/** Aggregate only the authorized supplier; never return customer or member details. */
export const getSupplierSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ supplierId: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ context, data }) => {
    const { db, supplierId } = await scope(context, data.supplierId);
    if (!supplierId) throw new Error("Selecione o fornecedor.");
    const [lots, lines, purchases] = await Promise.all([
      db
        .from("supplier_stock_lots")
        .select(
          "id,item_id,quantity,available,unit_cost,currency,stock_lot_receipts(purchase_item_id,quantity,available,stock_lot_movements(order_id,quantity))",
        )
        .eq("supplier_id", supplierId),
      db
        .from("order_items")
        .select(
          "item_id,quantity,total,inventory_items!inner(supplier_id,cost,currency),orders!inner(id,total,amount_paid,currency,status,workflow_stage,deleted_at,superseded_at)",
        )
        .eq("inventory_items.supplier_id", supplierId)
        .is("orders.deleted_at", null)
        .is("orders.superseded_at", null),
      db
        .from("purchase_orders")
        .select(
          "id,total,merchandise_total,amount_paid,amount_payable,currency,status,source_type,purchase_order_items(id,item_id,description,quantity,total)",
        )
        .eq("supplier_id", supplierId)
        .neq("status", "cancelada"),
    ]);
    if (lots.error || lines.error || purchases.error)
      throw new Error("Não foi possível calcular o resumo do fornecedor.");
    const entries: { type: string; value: number; currency: string }[] = [];
    let bought = 0,
      remaining = 0,
      sold = 0;
    const traced = new Map<string, { quantity: number; cost: number; currency: string }[]>();
    const orderIds = new Set<string>();
    for (const lot of lots.data) {
      bought += Number(lot.quantity);
      for (const receipt of lot.stock_lot_receipts ?? [])
        for (const movement of receipt.stock_lot_movements ?? []) {
          const key = movement.order_id + ":" + lot.item_id;
          traced.set(key, [
            ...(traced.get(key) ?? []),
            {
              quantity: Number(movement.quantity),
              cost: Number(lot.unit_cost),
              currency: lot.currency,
            },
          ]);
        }
      remaining +=
        Number(lot.available) +
        (lot.stock_lot_receipts ?? []).reduce((n: number, r: any) => n + Number(r.available), 0);
      entries.push({
        type: "investment",
        value: Number(lot.quantity) * Number(lot.unit_cost),
        currency: lot.currency,
      });
    }
    for (const line of lines.data) {
      const o = line.orders;
      if (o.status === "cancelado" || o.workflow_stage === "cancelado") continue;
      orderIds.add(o.id);
      sold += Number(line.quantity);
      // Product subtotals exclude order-level freight; receipts follow the paid percentage.
      entries.push({ type: "sales", value: Number(line.total), currency: o.currency });
      entries.push({
        type: "received",
        value:
          Number(line.total) *
          Math.min(1, Math.max(0, Number(o.amount_paid) / Math.max(Number(o.total), 0.01))),
        currency: o.currency,
      });

      let uncosted = Number(line.quantity);
      const origin = traced.get(o.id + ":" + line.item_id) ?? [];
      for (const allocation of origin) {
        const quantity = Math.min(uncosted, allocation.quantity);
        entries.push({
          type: "soldCost",
          value: quantity * allocation.cost,
          currency: allocation.currency,
        });
        allocation.quantity -= quantity;
        uncosted -= quantity;
      }
      if (uncosted > 0)
        entries.push({
          type: "soldCost",
          value: uncosted * Number(line.inventory_items.cost),
          currency: line.inventory_items.currency,
        });
    }
    for (const p of purchases.data) {
      entries.push({ type: "purchases", value: Number(p.total), currency: p.currency });
      entries.push({ type: "supplierPaid", value: Number(p.amount_paid), currency: p.currency });
      entries.push({
        type: "supplierDebt",
        value: purchasePosition(
          p,
          lots.data.flatMap((lot: any) =>
            (lot.stock_lot_receipts ?? []).map((receipt: any) => ({
              ...receipt,
              stock_lot_movements: (receipt.stock_lot_movements ?? []).map((movement: any) => ({
                ...movement,
                orders: lines.data.find((line: any) => line.orders.id === movement.order_id)
                  ?.orders,
              })),
            })),
          ),
        ).debt,
        currency: p.currency,
      });
    }
    return {
      entries,
      bought,
      remaining,
      sold,
      orderCount: orderIds.size,
      purchaseCount: purchases.data.length,
    };
  });
