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

/** Metadados mínimos, apenas para entregas já autorizadas, sem valores comerciais. */
export const getDeliveryFilterMetadata = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ ids: z.array(z.string().uuid()).max(500) }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const permission = await db.rpc("app_has_cap", {
      _uid: context.userId,
      _cap: "deliveries_manage",
    });
    if (permission.error) throw new Error("Não foi possível validar acesso aos filtros.");
    if (!permission.data) {
      const assigned = await context.supabase.rpc("my_deliveries");
      if (
        assigned.error ||
        data.ids.some(
          (id) => !(assigned.data ?? []).some((r: { order_id: string }) => r.order_id === id),
        )
      )
        throw new Error("Entrega não autorizada.");
    }
    if (!data.ids.length)
      return {
        orders: [],
        people: [],
        teams: [],
        teamMembers: [],
        items: [],
        suppliers: [],
        lines: [],
      };
    const orders = await db
      .from("orders")
      .select("id,seller_id,origin,order_date,created_at")
      .in("id", data.ids)
      .is("deleted_at", null)
      .is("superseded_at", null);
    const lines = await db
      .from("order_items")
      .select("order_id,item_id,description,quantity")
      .in(
        "order_id",
        (orders.data ?? []).map((o) => o.id),
      );
    if (orders.error || lines.error)
      throw new Error("Não foi possível consultar os filtros das entregas.");
    const sellerIds = [
      ...new Set((orders.data ?? []).map((o) => o.seller_id).filter(Boolean)),
    ] as string[];
    const itemIds = [
      ...new Set((lines.data ?? []).map((o) => o.item_id).filter(Boolean)),
    ] as string[];
    const items = itemIds.length
      ? await db.from("inventory_items").select("id,name,supplier_id").in("id", itemIds)
      : { data: [], error: null };
    const members = sellerIds.length
      ? await db.from("team_members").select("team_id,user_id").in("user_id", sellerIds)
      : { data: [], error: null };
    const people = sellerIds.length
      ? await db.from("profiles").select("id,full_name").in("id", sellerIds)
      : { data: [], error: null };
    const supplierIds = [
      ...new Set((items.data ?? []).map((i) => i.supplier_id).filter(Boolean)),
    ] as string[];
    const teamIds = [...new Set((members.data ?? []).map((m) => m.team_id))];
    const suppliers = supplierIds.length
      ? await db.from("suppliers").select("id,name").in("id", supplierIds)
      : { data: [], error: null };
    const teams = teamIds.length
      ? await db.from("teams").select("id,name").in("id", teamIds)
      : { data: [], error: null };
    for (const r of [items, members, people, suppliers, teams])
      if (r.error) throw new Error("Não foi possível consultar os filtros operacionais.");
    return {
      orders: orders.data ?? [],
      lines: lines.data ?? [],
      items: items.data ?? [],
      teamMembers: members.data ?? [],
      people: people.data ?? [],
      suppliers: suppliers.data ?? [],
      teams: teams.data ?? [],
    };
  });
