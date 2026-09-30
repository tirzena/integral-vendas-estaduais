/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Rastreamento de veículos das entregas.
 * Toda leitura de coordenada passa por aqui: o navegador nunca recebe posição
 * sem que o servidor confirme que quem pediu é administrador.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: any) {
  const { data } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (!data) throw new Error("Apenas administradores podem acessar o rastreamento.");
  return true;
}

function clean(v: unknown, max = 120) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** Situação das integrações: provedor de tag e provedor de mapa. */
export const getTrackingConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    return {
      tagProviderReady: Boolean(process.env["TRACKING_WEBHOOK_SECRET"]),
      webhookPath: "/api/public/tracking/webhook",
    };
  });

/** Painel administrativo: veículos, rastreadores e sessões — sem coordenadas. */
export const getTrackingOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    await context.supabase.rpc("tracking_expire_sessions");

    const [vehicles, devices, sessions] = await Promise.all([
      context.supabase.from("fleet_vehicles").select("*").order("plate"),
      context.supabase
        .from("tracking_devices")
        .select("id,provider,external_device_id,vehicle_id,label,status,last_seen_at")
        .order("created_at", { ascending: false }),
      context.supabase
        .from("delivery_tracking_sessions")
        .select(
          "id,order_id,vehicle_id,device_id,driver_id,source,status,purpose,consent_at,started_at,ended_at,expires_at,end_reason,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    const sessionRows = sessions.data ?? [];
    const orderIds = [...new Set(sessionRows.map((s: any) => s.order_id))];
    const driverIds = [...new Set(sessionRows.map((s: any) => s.driver_id).filter(Boolean))];

    const [orders, drivers, lastPoints] = await Promise.all([
      orderIds.length
        ? context.supabase
            .from("orders")
            .select("id,number,status,delivered_at,delivery_deadline,customers(name)")
            .in("id", orderIds)
        : Promise.resolve({ data: [] as any[] }),
      driverIds.length
        ? context.supabase.from("profiles").select("id,full_name,email").in("id", driverIds)
        : Promise.resolve({ data: [] as any[] }),
      sessionRows.length
        ? context.supabase
            .from("tracking_positions")
            .select("session_id,device_time")
            .in(
              "session_id",
              sessionRows.map((s: any) => s.id),
            )
            .order("device_time", { ascending: false })
            .limit(1000)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    // apenas o horário do último ponto — nenhuma coordenada sai daqui
    const lastBySession: Record<string, string> = {};
    for (const p of (lastPoints as any).data ?? []) {
      if (!lastBySession[p.session_id]) lastBySession[p.session_id] = p.device_time;
    }

    return {
      vehicles: vehicles.data ?? [],
      devices: devices.data ?? [],
      sessions: sessionRows.map((s: any) => ({
        ...s,
        last_point_at: lastBySession[s.id] ?? null,
        order: ((orders as any).data ?? []).find((o: any) => o.id === s.order_id) ?? null,
        driver: ((drivers as any).data ?? []).find((d: any) => d.id === s.driver_id) ?? null,
      })),
    };
  });

/** Cadastro/edição de veículo. */
export const saveVehicle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: {
    id?: string;
    plate: string;
    label?: string;
    model?: string;
    driverId?: string | null;
    notes?: string;
    isActive?: boolean;
  }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const plate = clean(data.plate, 16).toUpperCase();
    if (plate.length < 4) throw new Error("Informe a placa do veículo.");
    const row = {
      plate,
      label: clean(data.label) || null,
      model: clean(data.model) || null,
      driver_id: data.driverId || null,
      notes: clean(data.notes, 400) || null,
      is_active: data.isActive ?? true,
    };
    if (data.id) {
      const { error } = await context.supabase.from("fleet_vehicles").update(row).eq("id", data.id);
      if (error) throw new Error("Não foi possível salvar o veículo.");
      return { ok: true, id: data.id };
    }
    const { data: created, error } = await context.supabase
      .from("fleet_vehicles")
      .insert({ ...row, created_by: context.userId })
      .select("id")
      .single();
    if (error || !created) throw new Error("Não foi possível cadastrar o veículo (placa repetida?).");
    return { ok: true, id: created.id };
  });

/** Cadastro de tag/rastreador. O identificador externo é único por provedor. */
export const saveTrackingDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: {
    id?: string;
    provider: string;
    externalDeviceId: string;
    vehicleId?: string | null;
    label?: string;
    status?: string;
  }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const provider = clean(data.provider, 40);
    const external = clean(data.externalDeviceId, 80);
    if (!provider || !external) throw new Error("Informe o provedor e o identificador do rastreador.");
    const row = {
      provider,
      external_device_id: external,
      vehicle_id: data.vehicleId || null,
      label: clean(data.label) || null,
      status: data.status === "inativo" ? "inativo" : "ativo",
    };
    if (data.id) {
      const { error } = await context.supabase.from("tracking_devices").update(row).eq("id", data.id);
      if (error) throw new Error("Não foi possível salvar o rastreador.");
      return { ok: true, id: data.id };
    }
    const { data: created, error } = await context.supabase
      .from("tracking_devices")
      .insert({ ...row, created_by: context.userId })
      .select("id")
      .single();
    if (error || !created) throw new Error("Rastreador já cadastrado para este provedor.");
    return { ok: true, id: created.id };
  });

/** Cria a sessão de rastreamento de uma entrega (tag ou convite ao motorista). */
export const createTrackingSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: {
    orderId: string;
    source: "tag" | "motorista";
    vehicleId?: string | null;
    deviceId?: string | null;
    driverId?: string | null;
    purpose?: string;
    hours?: number;
  }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const hours = Math.min(Math.max(Number(data.hours ?? 8), 1), 72);
    if (data.source === "tag" && !data.deviceId) throw new Error("Escolha o rastreador da tag.");
    if (data.source === "motorista" && !data.driverId) throw new Error("Escolha o motorista.");

    const { data: order } = await context.supabase
      .from("orders")
      .select("id,status,delivered_at")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) throw new Error("Entrega não encontrada.");
    if (order.status === "cancelado" || order.delivered_at)
      throw new Error("Esta entrega já foi concluída ou cancelada.");

    const { data: created, error } = await context.supabase
      .from("delivery_tracking_sessions")
      .insert({
        order_id: data.orderId,
        source: data.source,
        vehicle_id: data.vehicleId || null,
        device_id: data.source === "tag" ? (data.deviceId ?? null) : null,
        driver_id: data.source === "motorista" ? (data.driverId ?? null) : null,
        purpose: clean(data.purpose, 160) || "Acompanhamento da entrega",
        status: data.source === "tag" ? "aceito" : "aguardando",
        consent_at: data.source === "tag" ? new Date().toISOString() : null,
        expires_at: new Date(Date.now() + hours * 3600_000).toISOString(),
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error || !created) throw new Error("Não foi possível criar a sessão de rastreamento.");
    return { ok: true, id: created.id };
  });

/** Encerrar/revogar sessão (admin) ou aceitar/iniciar/parar (motorista). */
export const trackingSessionAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: {
    sessionId: string;
    action: "aceitar" | "iniciar" | "parar" | "revogar";
    reason?: string;
  }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("tracking_session_action", {
      _session_id: data.sessionId,
      _action: data.action,
      ...(clean(data.reason, 80) ? { _reason: clean(data.reason, 80) } : {}),
    });
    if (error) throw new Error(error.message || "Não foi possível atualizar a sessão.");
    return { ok: true };
  });

/** Sessões do próprio motorista (sem coordenadas nem histórico). */
export const getMyDriverSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await context.supabase.rpc("tracking_expire_sessions");
    const { data } = await context.supabase
      .from("delivery_tracking_sessions")
      .select("id,order_id,source,status,purpose,expires_at,started_at,ended_at,end_reason,vehicle_id")
      .eq("driver_id", context.userId)
      .in("status", ["aguardando", "aceito", "compartilhando", "parado"])
      .order("created_at", { ascending: false })
      .limit(20);
    const rows = data ?? [];
    const orderIds = [...new Set(rows.map((r: any) => r.order_id))];
    const vehicleIds = [...new Set(rows.map((r: any) => r.vehicle_id).filter(Boolean))];
    const [orders, vehicles] = await Promise.all([
      orderIds.length
        ? context.supabase.from("orders").select("id,number").in("id", orderIds)
        : Promise.resolve({ data: [] as any[] }),
      vehicleIds.length
        ? context.supabase.from("fleet_vehicles").select("id,plate").in("id", vehicleIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    return rows.map((r: any) => ({
      ...r,
      order_number: ((orders as any).data ?? []).find((o: any) => o.id === r.order_id)?.number ?? null,
      plate: ((vehicles as any).data ?? []).find((v: any) => v.id === r.vehicle_id)?.plate ?? null,
    }));
  });

/** Envio de ponto pelo motorista — validado inteiramente no banco. */
export const pushDriverPoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: {
    sessionId: string;
    lat: number;
    lng: number;
    accuracy?: number | null;
    speed?: number | null;
    heading?: number | null;
    deviceTime?: string;
  }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("tracking_push_point", {
      _session_id: data.sessionId,
      _lat: data.lat,
      _lng: data.lng,
      ...(data.accuracy != null ? { _accuracy: data.accuracy } : {}),
      ...(data.speed != null ? { _speed: data.speed } : {}),
      ...(data.heading != null ? { _heading: data.heading } : {}),
      _device_time: data.deviceTime ?? new Date().toISOString(),
    });
    if (error) throw new Error(error.message || "Não foi possível enviar a localização.");
    return { ok: true };
  });

/**
 * Abre a sessão curta de visualização do mapa. Exige administrador com
 * verificação em duas etapas ativa; o banco valida e registra a auditoria.
 */
export const openTrackingView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { orderId: string; sessionId: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("tracking_open_view", {
      _order_id: data.orderId,
      _session_id: data.sessionId,
    });
    if (error) throw new Error(error.message || "Não foi possível abrir a visualização.");
    return res as { view_id: string; expires_at: string };
  });

/** Fecha a visualização e encerra o acesso às coordenadas. */
export const closeTrackingView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { viewId: string; reason?: string }) => input)
  .handler(async ({ data, context }) => {
    await context.supabase.rpc("tracking_close_view", {
      _view_id: data.viewId,
      _reason: clean(data.reason, 40) || "fechado",
    });
    return { ok: true };
  });

/**
 * Posição atual + histórico curto. Só responde com uma visualização aberta,
 * válida e pertencente a quem pede. Nada é gravado em log com coordenada.
 */
export const getSessionPosition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { viewId: string; sessionId: string; history?: number }) => input)
  .handler(async ({ data, context }) => {
    const limit = Math.min(Math.max(Number(data.history ?? 30), 1), 200);
    const { data: points, error } = await context.supabase.rpc("tracking_read_positions", {
      _view_id: data.viewId,
      _session_id: data.sessionId,
      _limit: limit,
    });
    if (error) throw new Error(error.message || "Visualização encerrada.");
    const rows = (points ?? []) as any[];
    return { current: rows[0] ?? null, history: rows };
  });


/** Auditoria de quem abriu/fechou o mapa e de quem compartilhou. */
export const logTrackingView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { orderId: string; action: "mapa_aberto" | "mapa_fechado" }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("tracking_log_view", {
      _order_id: data.orderId,
      _action: data.action,
    });
    if (error) throw new Error("Não foi possível registrar a auditoria.");
    return { ok: true };
  });

/** Últimos registros de auditoria (admin). */
export const getTrackingAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data } = await context.supabase
      .from("tracking_audit")
      .select("id,actor_id,order_id,session_id,action,details,created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    const rows = data ?? [];
    const actorIds = [...new Set(rows.map((r: any) => r.actor_id).filter(Boolean))];
    const { data: people } = actorIds.length
      ? await context.supabase.from("profiles").select("id,full_name").in("id", actorIds)
      : { data: [] as any[] };
    return rows.map((r: any) => ({
      ...r,
      actor_name: (people ?? []).find((p: any) => p.id === r.actor_id)?.full_name ?? "—",
    }));
  });
