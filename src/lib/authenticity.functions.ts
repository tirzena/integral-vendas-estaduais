/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeBoxCode, type AuthenticityResult } from "./authenticity";
async function admin(context: any) {
  const r = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (r.error || !r.data) throw new Error("Apenas administradores podem gerenciar códigos.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}
export const getAuthenticityAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ batchId: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ context, data }) => {
    const db = await admin(context);
    let batchQuery = db
      .from("authenticity_batches")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    let attemptQuery = db
      .from("authenticity_attempts")
      .select("id,batch_id,result,created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (data.batchId) {
      batchQuery = batchQuery.eq("id", data.batchId);
      attemptQuery = attemptQuery.eq("batch_id", data.batchId);
    }
    const [b, p, a] = await Promise.all([
      batchQuery,
      Promise.resolve({ data: [], error: null }),
      attemptQuery,
    ]);
    if (b.error || p.error || a.error)
      throw new Error("Não foi possível carregar o controle de autenticidade.");
    return { batches: b.data, purchaseItems: p.data, attempts: a.data };
  });
export const createAuthenticityBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        purchaseItemId: z.string().uuid(),
        lot: z.string().trim().min(1).max(80),
        manufacture: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        expiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        quantity: z.number().int().min(1).max(50000),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const db = await admin(context);
    const { randomBytes, createHash } = await import("node:crypto");
    const codes = Array.from({ length: data.quantity }, () => {
      const code = randomBytes(16).toString("hex").toUpperCase();
      return { code, hash: createHash("sha256").update(code).digest("hex") };
    });
    const r = await db.rpc("authenticity_create_batch", {
      p_item: data.purchaseItemId,
      p_lot: data.lot,
      p_manufacture: data.manufacture,
      p_expiry: data.expiry,
      p_codes: codes,
      p_actor: context.userId,
    });
    if (r.error)
      throw new Error(
        "Não foi possível gerar. Confira as datas e a quantidade disponível na compra.",
      );
    return { id: r.data as string };
  });
export const getAuthenticityLabels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ batchId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const db = await admin(context);
    let rows: any[] = [];
    for (let offset = 0; offset < 50000; offset += 1000) {
      const r = await db
        .from("authenticity_boxes")
        .select("serial,print_code,first_validated_at")
        .eq("batch_id", data.batchId)
        .order("serial")
        .range(offset, offset + 999);
      if (r.error) throw new Error("Não foi possível exportar códigos.");
      rows = rows.concat(r.data);
      if (r.data.length < 1000) break;
    }
    return rows;
  });
export const setAuthenticityActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ batchId: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => {
    const db = await admin(context);
    const r = await db
      .from("authenticity_batches")
      .update({ active: data.active })
      .eq("id", data.batchId);
    if (r.error) throw new Error("Não foi possível alterar o lote.");
    return { ok: true };
  });
export const getPublicAuthenticityBatch = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ batchId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const r = await (supabaseAdmin as any)
      .from("authenticity_batches")
      .select("id,lot_number,product_name,manufacture_date,expiry_date,active")
      .eq("id", data.batchId)
      .maybeSingle();
    if (r.error) throw new Error("Consulta indisponível. Tente novamente.");
    return r.data;
  });
export const validateAuthenticityCode = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ batchId: z.string().uuid(), code: z.string().max(64) }).parse(d),
  )
  .handler(async ({ data }): Promise<AuthenticityResult> => {
    const { createHash } = await import("node:crypto");
    const request = getRequest();
    const ip =
      request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const bucket = createHash("sha256").update(ip).digest("hex");
    const hash = createHash("sha256").update(normalizeBoxCode(data.code)).digest("hex");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const r = await (supabaseAdmin as any).rpc("authenticity_validate", {
      p_batch: data.batchId,
      p_hash: hash,
      p_bucket: bucket,
    });
    if (r.error) throw new Error("Validação indisponível. Nenhuma confirmação foi emitida.");
    return r.data;
  });
