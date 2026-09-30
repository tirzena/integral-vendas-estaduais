/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Aplicação de listas de fornecedor.
 * A prévia é montada no navegador, mas nenhuma alteração acontece por lá:
 * tudo passa por estas ações, que revalidam permissão, escopo, moeda e valores
 * e gravam em uma única transação no banco.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CURRENCY = z.enum(["BRL", "USD", "PYG"]);

async function assertCanManage(context: any) {
  const { data, error } = await context.supabase.rpc("imports_can_manage", { _uid: context.userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Seu perfil não pode aplicar listas de fornecedor.");
}

const rowSchema = z.object({
  line_no: z.number().int().nonnegative(),
  item_id: z.string().uuid(),
  raw_text: z.string().max(500).optional().nullable(),
  supplier_code: z.string().max(120).optional().nullable(),
  description: z.string().max(300).optional().nullable(),
  unit: z.string().max(24).optional().nullable(),
  qty: z.number().finite().nonnegative().max(1_000_000_000).optional().nullable(),
  value: z.number().finite().nonnegative().max(1_000_000_000).optional().nullable(),
  warning: z.string().max(300).optional().nullable(),
});

const applySchema = z.object({
  supplier_id: z.string().uuid(),
  content_hash: z.string().min(8).max(128),
  list_currency: CURRENCY,
  base_currency: CURRENCY,
  rates: z.record(z.string(), z.number().positive()),
  qty_mode: z.enum(["absoluto", "entrada", "disponibilidade", "nenhum"]),
  value_target: z.enum(["custo", "preco", "nenhum"]),
  apply_markup: z.boolean().default(false),
  notes: z.string().max(300).optional().nullable(),
  rows: z.array(rowSchema).min(1).max(2000),
});

/** Aplica o lote inteiro em uma única operação transacional no banco. */
export const applySupplierImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => applySchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertCanManage(context);
    const { data: result, error } = await context.supabase.rpc("imports_apply_list", {
      p: { ...data, source: "texto" },
    });
    if (error) throw new Error(error.message);
    return result as { batch_id: string; rows: number; qty_changes: number; value_changes: number };
  });

/** Desfaz um lote aplicado. Somente administradores e apenas sem movimentações posteriores. */
export const undoSupplierImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({ batch_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: admin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (!admin) throw new Error("Somente administradores podem desfazer um lote.");
    const { data: result, error } = await context.supabase.rpc("imports_undo_batch", {
      p_batch_id: data.batch_id,
    });
    if (error) throw new Error(error.message);
    return result as { batch_id: string; restored: number };
  });

/** Memoriza o vínculo entre o código/descrição do fornecedor e o produto do estoque. */
export const saveSupplierMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
    z
      .object({
        supplier_id: z.string().uuid(),
        inventory_item_id: z.string().uuid(),
        supplier_code: z.string().max(120).optional().nullable(),
        alias_normalized: z.string().max(300).optional().nullable(),
        received_description: z.string().max(300).optional().nullable(),
      })
      .refine((v) => Boolean(v.supplier_code || v.alias_normalized), {
        message: "Informe o código ou a descrição do fornecedor.",
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertCanManage(context);
    const payload = {
      supplier_id: data.supplier_id,
      inventory_item_id: data.inventory_item_id,
      supplier_code: data.supplier_code || null,
      alias_normalized: data.alias_normalized || null,
      received_description: data.received_description || null,
      confidence: 1,
      confirmed_by: context.userId,
      confirmed_at: new Date().toISOString(),
    };
    const { error } = await context.supabase.from("supplier_product_mappings").upsert(payload, {
      onConflict: data.supplier_code ? "supplier_id,supplier_code" : "supplier_id,alias_normalized",
    });
    if (error) {
      const { error: insertError } = await context.supabase
        .from("supplier_product_mappings")
        .insert(payload);
      if (insertError) throw new Error(insertError.message);
    }
    return { ok: true };
  });

/** Apelidos já confirmados para o fornecedor selecionado. */
export const listSupplierMappings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({ supplier_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertCanManage(context);
    const { data: rows, error } = await context.supabase
      .from("supplier_product_mappings")
      .select("supplier_code, alias_normalized, inventory_item_id")
      .eq("supplier_id", data.supplier_id)
      .limit(2000);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** Modelo de leitura salvo por fornecedor (formato numérico, moeda, modos). */
export const getSupplierTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({ supplier_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertCanManage(context);
    const { data: row, error } = await context.supabase
      .from("supplier_import_templates")
      .select("id, name, config")
      .eq("supplier_id", data.supplier_id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row ?? null;
  });

export const saveSupplierTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
    z
      .object({
        supplier_id: z.string().uuid(),
        name: z.string().min(1).max(80).default("Padrão"),
        config: z.record(z.string(), z.any()),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertCanManage(context);
    const { error } = await context.supabase.from("supplier_import_templates").upsert(
      {
        supplier_id: data.supplier_id,
        name: data.name,
        config: data.config,
        created_by: context.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "supplier_id,name" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Histórico de importações com contagens, para auditoria e relatório de diferenças. */
export const listImportBatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCanManage(context);
    const { data: batches, error } = await context.supabase
      .from("import_batches")
      .select(
        "id, supplier_id, status, qty_mode, value_target, list_currency, base_currency, counts, created_at, applied_at, reverted_at",
      )
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return batches ?? [];
  });

/** Linhas de um lote: usado no relatório de diferenças (antes → depois). */
export const getImportBatchRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({ batch_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertCanManage(context);
    const { data: rows, error } = await context.supabase
      .from("import_rows")
      .select("*")
      .eq("batch_id", data.batch_id)
      .order("line_no");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
