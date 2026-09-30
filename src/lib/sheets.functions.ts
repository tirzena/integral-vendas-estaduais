/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SheetTab = { title: string; index: number };
export type SheetData = {
  spreadsheetId: string;
  title: string;
  tabs: SheetTab[];
  tab: string;
  values: string[][];
};

export function extractSpreadsheetId(input: string) {
  const trimmed = input.trim();
  const m = trimmed.match(/\/spreadsheets\/(?:u\/\d+\/)?d\/([a-zA-Z0-9-_]+)/);
  if (m?.[1]) return m[1];
  try {
    const id = new URL(trimmed).searchParams.get("id");
    if (id && /^[a-zA-Z0-9-_]{20,}$/.test(id)) return id;
  } catch {
    // O campo também aceita o ID puro.
  }
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

async function googleSheets(userId: string, path: string, init: RequestInit = {}) {
  const { sheetsConnectionToken } = await import("@/lib/google-calendar.server");
  const token = await sheetsConnectionToken(userId);
  const response = await fetch(`https://sheets.googleapis.com/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (response.status === 204) return {};
  const data = (await response.json().catch(() => ({}))) as any;
  if (!response.ok) {
    if (response.status === 403)
      throw new Error("Conecte novamente o Google Planilhas para liberar o acesso.");
    throw new Error(data?.error?.message ?? "Não foi possível acessar a planilha.");
  }
  return data;
}

function requestOrigin() {
  const request = getRequest();
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? url.host;
  const protocol = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${protocol}://${host}`;
}

function safeReturnPath(value?: string) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/contatos";
}

export const getGoogleSheetsStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { googleCalendarConfigured } = await import("@/lib/google-calendar.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any)
      .from("google_sheets_connections")
      .select("google_email,status,last_synced_at,last_error")
      .eq("user_id", context.userId)
      .maybeSingle();
    return {
      configured: googleCalendarConfigured(),
      connected: data?.status === "conectado",
      connection: data ?? null,
    };
  });

export const startGoogleSheetsOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ returnPath: z.string().optional() }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { GOOGLE_SHEETS_SCOPES, googleCalendarConfigured } =
      await import("@/lib/google-calendar.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!googleCalendarConfigured())
      throw new Error("Google Planilhas ainda não está configurado no servidor.");
    const origin = requestOrigin();
    // O mesmo callback já autorizado no cliente Google distingue o serviço pelo state.
    const redirectUri = `${origin}/api/public/google-calendar/callback`;
    const state = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
    const { error } = await (supabaseAdmin as any).from("google_calendar_oauth_states").insert({
      state,
      user_id: context.userId,
      redirect_uri: redirectUri,
      service: "sheets",
      return_path: safeReturnPath(data.returnPath),
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    if (error) throw new Error("Não foi possível iniciar a conexão com o Google Planilhas.");
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", process.env["GOOGLE_CLIENT_ID"]!);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", GOOGLE_SHEETS_SCOPES.join(" "));
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);
    return { url: url.toString() };
  });

export const disconnectGoogleSheets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("google_sheets_connections")
      .delete()
      .eq("user_id", context.userId);
    if (error) throw new Error("Não foi possível desconectar o Google Planilhas.");
    return { ok: true };
  });

const readInput = z.object({ url: z.string().min(5), tab: z.string().optional() });
export const readGoogleSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => readInput.parse(data))
  .handler(async ({ data, context }): Promise<SheetData> => {
    const id = extractSpreadsheetId(data.url);
    if (!id)
      throw new Error(
        "Link do Google Planilhas inválido. Use o link de compartilhamento do Google Sheets.",
      );
    const meta = await googleSheets(
      context.userId,
      `/spreadsheets/${id}?fields=properties.title,sheets.properties`,
    );
    const tabs = (meta.sheets ?? []).map((s: any) => ({
      title: s.properties?.title as string,
      index: s.properties?.index as number,
    }));
    const tab =
      data.tab && tabs.some((t: SheetTab) => t.title === data.tab)
        ? data.tab
        : (tabs[0]?.title ?? "");
    const range = encodeURIComponent(`${tab}!A1:Z1000`);
    const values = await googleSheets(context.userId, `/spreadsheets/${id}/values/${range}`);
    return {
      spreadsheetId: id,
      title: meta.properties?.title ?? "Planilha",
      tabs,
      tab,
      values: values.values ?? [],
    };
  });

const writeInput = z.object({
  spreadsheetId: z.string().min(5),
  tab: z.string().min(1),
  values: z.array(z.array(z.string())),
});
export const writeGoogleSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => writeInput.parse(data))
  .handler(async ({ data, context }) => {
    const range = encodeURIComponent(`${data.tab}!A1:Z1000`);
    await googleSheets(
      context.userId,
      `/spreadsheets/${data.spreadsheetId}/values/${range}:clear`,
      { method: "POST", body: "{}" },
    );
    const width = Math.max(1, ...data.values.map((r) => r.length));
    const values = data.values.map((r) => [...r, ...Array(width - r.length).fill("")]);
    await googleSheets(
      context.userId,
      `/spreadsheets/${data.spreadsheetId}/values/${encodeURIComponent(data.tab + "!A1")}?valueInputOption=RAW`,
      {
        method: "PUT",
        body: JSON.stringify({ values }),
      },
    );
    return { saved: values.length };
  });

const linkInput = z.object({
  listId: z.string().uuid(),
  spreadsheetId: z.string(),
  title: z.string(),
  tab: z.string(),
});
export const linkContactSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => linkInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("contact_sheet_links").upsert({
      list_id: data.listId,
      user_id: context.userId,
      spreadsheet_id: data.spreadsheetId,
      spreadsheet_title: data.title,
      sheet_tab: data.tab,
      last_sync_status: "vinculada",
    });
    if (error) throw new Error("Não foi possível vincular a planilha.");
    return { ok: true };
  });

export const getContactSheetLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ listId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: link } = await (supabaseAdmin as any)
      .from("contact_sheet_links")
      .select("*")
      .eq("list_id", data.listId)
      .eq("user_id", context.userId)
      .maybeSingle();
    return link ?? null;
  });

export const syncContactSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ listId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: link } = await (supabaseAdmin as any)
      .from("contact_sheet_links")
      .select("*")
      .eq("list_id", data.listId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!link) throw new Error("Esta lista ainda não está vinculada a uma planilha.");
    const range = encodeURIComponent(`${link.sheet_tab}!A1:Z1000`);
    const remote = await googleSheets(
      context.userId,
      `/spreadsheets/${link.spreadsheet_id}/values/${range}`,
    );
    const values: string[][] = remote.values ?? [];
    const normalizeHeader = (value: unknown) =>
      String(value ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
    const aliases: Record<string, string[]> = {
      id: ["id", "codigo"],
      nome: ["nome", "nome completo", "cliente", "contato"],
      telefone: ["telefone", "celular", "whatsapp", "telefone whatsapp", "fone"],
      email: ["email", "e mail"],
      empresa: ["empresa", "razao social", "organizacao"],
      cidade: ["cidade", "municipio", "localidade"],
      origem: ["origem", "fonte", "canal"],
      observacoes: ["observacoes", "observacao", "notas"],
      situacao: ["situacao", "status", "etapa"],
      produto_id: ["produto id", "produto_id"],
    };
    const expected = new Set(Object.values(aliases).flat());
    const headerIndex = values.slice(0, 50).findIndex((row) => {
      const normalized = row.map(normalizeHeader);
      return normalized.filter((cell) => expected.has(cell)).length >= 2;
    });
    if (headerIndex < 0)
      throw new Error(
        "Não foi possível identificar os títulos das colunas. Inclua pelo menos Nome e Telefone, E-mail ou Empresa.",
      );
    const headers = values[headerIndex]!.map(normalizeHeader);
    const at = (row: string[], name: keyof typeof aliases) => {
      const index = headers.findIndex((header) => aliases[name].includes(header));
      return index >= 0 ? row[index] || null : null;
    };
    for (const row of values.slice(headerIndex + 1)) {
      const id = at(row, "id");
      const payload = {
        list_id: data.listId,
        product_id: at(row, "produto_id"),
        name: at(row, "nome") || "Sem nome",
        phone: at(row, "telefone"),
        email: at(row, "email"),
        company: at(row, "empresa"),
        city: at(row, "cidade"),
        origin: at(row, "origem"),
        notes: at(row, "observacoes"),
        status: at(row, "situacao") || "novo",
      };
      if (id)
        await (supabaseAdmin as any)
          .from("contact_leads")
          .update(payload)
          .eq("id", id)
          .eq("list_id", data.listId);
      else if (payload.phone || payload.email || payload.company)
        await (supabaseAdmin as any).from("contact_leads").insert(payload);
    }
    const { data: rows } = await (supabaseAdmin as any)
      .from("contact_leads")
      .select("*")
      .eq("list_id", data.listId)
      .order("created_at");
    const output = [
      [
        "id",
        "nome",
        "telefone",
        "email",
        "empresa",
        "cidade",
        "origem",
        "observacoes",
        "situacao",
        "produto_id",
      ],
      ...(rows ?? []).map((r: any) => [
        r.id,
        r.name,
        r.phone ?? "",
        r.email ?? "",
        r.company ?? "",
        r.city ?? "",
        r.origin ?? "",
        r.notes ?? "",
        r.status,
        r.product_id ?? "",
      ]),
    ];
    await googleSheets(
      context.userId,
      `/spreadsheets/${link.spreadsheet_id}/values/${range}:clear`,
      { method: "POST", body: "{}" },
    );
    await googleSheets(
      context.userId,
      `/spreadsheets/${link.spreadsheet_id}/values/${encodeURIComponent(link.sheet_tab + "!A1")}?valueInputOption=RAW`,
      { method: "PUT", body: JSON.stringify({ values: output }) },
    );
    await (supabaseAdmin as any)
      .from("contact_sheet_links")
      .update({
        last_synced_at: new Date().toISOString(),
        last_sync_status: "ok",
        last_error: null,
      })
      .eq("list_id", data.listId);
    return {
      imported: Math.max(0, values.length - headerIndex - 1),
      total: rows?.length ?? 0,
    };
  });
