import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Exclui um comprovante enviado por engano antes de ele ser usado em uma baixa. */
export const deleteUnusedPaymentProof = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({ proofId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: proof, error: proofError } = await supabase
      .from("order_payment_proofs")
      .select("id,order_id,payment_id,file_path,file_name,external_url")
      .eq("id", data.proofId)
      .maybeSingle();

    if (proofError) throw new Error(proofError.message);
    if (!proof) throw new Error("Comprovante não encontrado ou sem permissão para excluir.");
    if (proof.payment_id) {
      throw new Error("Um comprovante vinculado a pagamento não pode ser excluído.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: deleteError } = await supabaseAdmin
      .from("order_payment_proofs")
      .delete()
      .eq("id", proof.id)
      .is("payment_id", null);
    if (deleteError) throw new Error(deleteError.message);

    if (proof.file_path) {
      const { error: storageError } = await supabaseAdmin.storage
        .from("payment-proofs")
        .remove([proof.file_path]);
      if (storageError) console.warn("Arquivo órfão de comprovante:", storageError.message);
    }

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id,root_order_id,revision_no")
      .eq("id", proof.order_id)
      .maybeSingle();
    if (order) {
      const label = proof.file_name ?? proof.external_url ?? "arquivo sem nome";
      const { error: auditError } = await supabaseAdmin.from("order_audit_log").insert({
        order_id: order.id,
        root_order_id: order.root_order_id ?? order.id,
        revision_no: order.revision_no ?? 1,
        action: "excluido",
        changed_by: userId,
        note: `Comprovante excluído: ${label}`,
      });
      if (auditError)
        console.warn("Falha ao registrar exclusão do comprovante:", auditError.message);
    }

    return { ok: true };
  });

/**
 * Exclui um pedido pelo fluxo oficial. Se reservas antigas estiverem
 * inconsistentes, recompõe o total reservado a partir dos pedidos ativos e
 * repete a exclusão para que estoque, financeiro e histórico sejam tratados
 * pela função transacional do banco.
 */
export const deleteOrderWithReservationRepair = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
    z
      .object({
        orderId: z.string().uuid(),
        reason: z.string().trim().min(5, "Informe o motivo da exclusão."),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const attemptDelete = () =>
      supabase.rpc("sales_delete_order", {
        p_order_id: data.orderId,
        p_reason: data.reason,
      });

    const firstAttempt = await attemptDelete();
    if (!firstAttempt.error) return firstAttempt.data;
    if (!/reserva inconsistente/i.test(firstAttempt.error.message ?? "")) {
      throw new Error(firstAttempt.error.message || "Não foi possível excluir o pedido.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: targetItems, error: targetError } = await supabaseAdmin
      .from("order_items")
      .select("item_id")
      .eq("order_id", data.orderId)
      .not("item_id", "is", null);
    if (targetError) throw new Error(targetError.message);

    const affectedItemIds = [
      ...new Set((targetItems ?? []).map((item) => item.item_id).filter(Boolean)),
    ] as string[];
    if (!affectedItemIds.length) throw new Error(firstAttempt.error.message);

    const { data: reservedOrders, error: ordersError } = await supabaseAdmin
      .from("orders")
      .select("id,warehouse_id")
      .eq("stock_state", "reservado")
      .is("deleted_at", null)
      .is("superseded_at", null);
    if (ordersError) throw new Error(ordersError.message);

    const reservedOrderIds = (reservedOrders ?? []).map((order) => order.id);
    const { data: reservedItems, error: itemsError } = reservedOrderIds.length
      ? await supabaseAdmin
          .from("order_items")
          .select("order_id,item_id,quantity")
          .in("order_id", reservedOrderIds)
          .in("item_id", affectedItemIds)
      : { data: [], error: null };
    if (itemsError) throw new Error(itemsError.message);

    const warehouseByOrder = new Map(
      (reservedOrders ?? []).map((order) => [order.id, order.warehouse_id]),
    );
    const { data: balances, error: balancesError } = await supabaseAdmin
      .from("warehouse_inventory")
      .select("id,warehouse_id,item_id,reserved")
      .in("item_id", affectedItemIds);
    if (balancesError) throw new Error(balancesError.message);

    const expectedByBalance = new Map<string, number>();
    for (const item of reservedItems ?? []) {
      const warehouseId = warehouseByOrder.get(item.order_id);
      if (!warehouseId || !item.item_id) continue;
      const key = `${warehouseId}:${item.item_id}`;
      expectedByBalance.set(key, (expectedByBalance.get(key) ?? 0) + Number(item.quantity ?? 0));
    }

    for (const balance of balances ?? []) {
      const expected = expectedByBalance.get(`${balance.warehouse_id}:${balance.item_id}`) ?? 0;
      if (Number(balance.reserved ?? 0) === expected) continue;
      const { error } = await supabaseAdmin
        .from("warehouse_inventory")
        .update({ reserved: expected, updated_at: new Date().toISOString() })
        .eq("id", balance.id);
      if (error) throw new Error(error.message);
    }

    for (const [key, expected] of expectedByBalance) {
      const [warehouseId, itemId] = key.split(":");
      const exists = (balances ?? []).some(
        (balance) => balance.warehouse_id === warehouseId && balance.item_id === itemId,
      );
      if (!exists && expected > 0) {
        throw new Error("Existe pedido reservado sem saldo correspondente no estoque selecionado.");
      }
    }

    for (const itemId of affectedItemIds) {
      const reserved = (reservedItems ?? [])
        .filter((item) => item.item_id === itemId)
        .reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
      const { error } = await supabaseAdmin
        .from("inventory_items")
        .update({ reserved })
        .eq("id", itemId);
      if (error) throw new Error(error.message);
    }

    const retry = await attemptDelete();
    if (retry.error) throw new Error(retry.error.message || "Não foi possível excluir o pedido.");
    return retry.data;
  });
