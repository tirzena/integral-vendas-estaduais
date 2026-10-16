import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const deliverySellerInput = z.object({ orderId: z.string().uuid() });

/** Retorna somente o nome do vendedor quando o usuário pode acessar a entrega. */
export const getDeliverySeller = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => deliverySellerInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: canManage, error: permissionError } = await supabaseAdmin.rpc("app_has_cap", {
      _uid: context.userId,
      _cap: "deliveries_manage",
    });
    if (permissionError) throw new Error("Não foi possível validar o acesso à entrega.");

    if (!canManage) {
      const { data: assigned, error: assignedError } = await context.supabase.rpc("my_deliveries");
      if (
        assignedError ||
        !(assigned ?? []).some((entry: { order_id?: string }) => entry.order_id === data.orderId)
      ) {
        throw new Error("Você não tem acesso a esta entrega.");
      }
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("seller_id")
      .eq("id", data.orderId)
      .is("deleted_at", null)
      .maybeSingle();
    if (orderError || !order) throw new Error("Não foi possível localizar o pedido.");
    if (!order.seller_id) return { sellerName: null };

    const { data: seller, error: sellerError } = await supabaseAdmin
      .from("profiles")
      .select("full_name,email")
      .eq("id", order.seller_id)
      .maybeSingle();
    if (sellerError) throw new Error("Não foi possível consultar o vendedor do pedido.");
    return { sellerName: seller?.full_name?.trim() || seller?.email?.trim() || null };
  });

/**
 * Carrega a visao operacional completa de entregas para quem possui a
 * permissao correspondente. A leitura privilegiada acontece somente depois
 * da autorizacao do usuario e evita que regras comerciais ocultem pedidos da
 * equipe de transporte.
 */
export const getManagedDeliveries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: canManage, error: permissionError } = await supabaseAdmin.rpc("app_has_cap", {
      _uid: context.userId,
      _cap: "deliveries_manage",
    });
    if (permissionError) {
      console.error("[deliveries] permission check failed", permissionError);
      throw new Error("Não foi possível validar o acesso às entregas.");
    }
    if (!canManage) {
      throw new Error("Você não tem permissão para visualizar todas as entregas.");
    }

    const [ordersResult, eventsResult] = await Promise.all([
      supabaseAdmin
        .from("orders")
        .select(
          "id,number,revision_no,status,kind,stock_state,origin,workflow_stage,fulfillment_status,order_date,created_at,delivery_deadline,grace_days,delivered_at,tracking_enabled,tracking_status,tracking_code,carrier,delivery_issue,delivery_recipient_name,delivery_recipient_document,shipping_address,shipping_address_number,shipping_cep,shipping_city,shipping_state,shipping_country,warehouse_id,delivery_token,notes",
        )
        .is("deleted_at", null)
        .is("superseded_at", null)
        .order("created_at", { ascending: false })
        .limit(300),
      supabaseAdmin
        .from("delivery_events")
        .select(
          "id,order_id,status,location,notes,happened_at,distance_remaining_km,estimated_arrival_at",
        )
        .order("happened_at", { ascending: false })
        .limit(500),
    ]);
    if (ordersResult.error) {
      console.error("[deliveries] orders query failed", ordersResult.error);
      throw new Error("Não foi possível carregar os pedidos de entrega.");
    }
    if (eventsResult.error) {
      console.error("[deliveries] events query failed", eventsResult.error);
      throw new Error("Não foi possível carregar o histórico das entregas.");
    }

    const orders = (ordersResult.data ?? []).filter(
      (order) =>
        !(
          order.origin === "catalogo" &&
          order.kind === "pre_pedido" &&
          order.status === "pre_pedido" &&
          order.stock_state === "nenhum"
        ),
    );
    const orderIds = orders.map((order) => order.id);
    const warehouseIds = [
      ...new Set(orders.map((order) => order.warehouse_id).filter((id): id is string => !!id)),
    ];
    const [itemsResult, warehousesResult] = await Promise.all([
      orderIds.length
        ? supabaseAdmin
            .from("order_items")
            .select("order_id,description,quantity,unit")
            .in("order_id", orderIds)
        : Promise.resolve({ data: [], error: null }),
      warehouseIds.length
        ? supabaseAdmin
            .from("warehouses")
            .select("id,name,address,city,state")
            .in("id", warehouseIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (itemsResult.error) {
      console.error("[deliveries] items query failed", itemsResult.error);
      throw new Error("Não foi possível carregar os produtos das entregas.");
    }
    if (warehousesResult.error) {
      console.error("[deliveries] warehouses query failed", warehousesResult.error);
      throw new Error("Não foi possível carregar os estoques de origem.");
    }

    return {
      orders,
      events: eventsResult.data ?? [],
      items: itemsResult.data ?? [],
      warehouses: warehousesResult.data ?? [],
    };
  });

/** Metadados mínimos das entregas, autorizados e lidos em uma única consulta. */
export const getDeliveryFilterMetadata = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ ids: z.array(z.string().uuid()).max(500) }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: metadata, error } = await (context.supabase as any).rpc(
      "integral_delivery_filter_metadata",
      { p_order_ids: [...new Set(data.ids)] },
    );
    if (error) {
      console.error("[deliveries] filter metadata failed", { code: error.code, message: error.message });
      throw new Error("Não foi possível consultar os filtros das entregas. Tente novamente.");
    }
    return metadata as {
      orders: any[]; people: any[]; teams: any[]; teamMembers: any[];
      items: any[]; suppliers: any[]; lines: any[];
    };
  });
