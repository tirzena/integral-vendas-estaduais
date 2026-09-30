/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const GOOGLE_CALENDAR_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
] as const;

export const GOOGLE_SHEETS_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/spreadsheets",
] as const;

export function googleCalendarConfigured() {
  return Boolean(
    process.env["GOOGLE_CLIENT_ID"] &&
    process.env["GOOGLE_CLIENT_SECRET"] &&
    process.env["GOOGLE_TOKEN_ENCRYPTION_KEY"],
  );
}

async function cryptoKey() {
  const secret = process.env["GOOGLE_TOKEN_ENCRYPTION_KEY"];
  if (!secret) throw new Error("Chave de proteção do Google Calendar ausente.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export async function encryptGoogleToken(token: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await cryptoKey(),
    new TextEncoder().encode(token),
  );
  return `v1.${toBase64(iv)}.${toBase64(new Uint8Array(encrypted))}`;
}

export async function decryptGoogleToken(payload: string) {
  const [version, iv, data] = payload.split(".");
  if (version !== "v1" || !iv || !data) throw new Error("Credencial do Google inválida.");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(iv) },
    await cryptoKey(),
    fromBase64(data),
  );
  return new TextDecoder().decode(decrypted);
}

export async function exchangeGoogleCode(code: string, redirectUri: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env["GOOGLE_CLIENT_ID"]!,
      client_secret: process.env["GOOGLE_CLIENT_SECRET"]!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const data = (await response.json()) as any;
  if (!response.ok || !data.access_token) throw new Error("O Google não autorizou a conexão.");
  return data as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
}

async function refreshAccessToken(refreshToken: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env["GOOGLE_CLIENT_ID"]!,
      client_secret: process.env["GOOGLE_CLIENT_SECRET"]!,
      grant_type: "refresh_token",
    }),
  });
  const data = (await response.json()) as any;
  if (!response.ok || !data.access_token)
    throw new Error("A autorização do Google expirou. Conecte novamente.");
  return data as { access_token: string; expires_in?: number };
}

async function tokenFromConnection(
  userId: string,
  table: "google_calendar_connections" | "google_sheets_connections",
  label: "Google Calendar" | "Google Planilhas",
) {
  const { data: connection } = await (supabaseAdmin as any)
    .from(table)
    .select("access_token_encrypted,refresh_token_encrypted,token_expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (!connection) throw new Error(`${label} ainda não está conectado.`);
  const expires = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : 0;
  if (expires > Date.now() + 60_000) return decryptGoogleToken(connection.access_token_encrypted);
  if (!connection.refresh_token_encrypted) throw new Error(`Conecte novamente ao ${label}.`);
  const refreshed = await refreshAccessToken(
    await decryptGoogleToken(connection.refresh_token_encrypted),
  );
  const encrypted = await encryptGoogleToken(refreshed.access_token);
  await (supabaseAdmin as any)
    .from(table)
    .update({
      access_token_encrypted: encrypted,
      token_expires_at: new Date(Date.now() + (refreshed.expires_in ?? 3600) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  return refreshed.access_token;
}

export function connectionToken(userId: string) {
  return tokenFromConnection(userId, "google_calendar_connections", "Google Calendar");
}

export function sheetsConnectionToken(userId: string) {
  return tokenFromConnection(userId, "google_sheets_connections", "Google Planilhas");
}

async function googleRequest(token: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error((data as any)?.error?.message ?? "Falha ao sincronizar com o Google Calendar.");
  return data as any;
}

function taskHash(task: any) {
  return [
    task.title,
    task.description ?? "",
    task.due_at ?? "",
    task.status,
    task.updated_at ?? "",
  ].join("|");
}

function eventBody(task: any, origin: string) {
  const start = new Date(task.due_at);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return {
    summary: task.title,
    description: `${task.description ?? ""}\n\nAbrir no OS: ${origin}/tarefas/${task.id}`.trim(),
    start: { dateTime: start.toISOString(), timeZone: "America/Sao_Paulo" },
    end: { dateTime: end.toISOString(), timeZone: "America/Sao_Paulo" },
    extendedProperties: { private: { os_task_id: task.id } },
  };
}

export async function syncGoogleTasks(userId: string, origin: string) {
  const token = await connectionToken(userId);
  const [{ data: tasks, error: taskError }, { data: mappings }] = await Promise.all([
    supabaseAdmin
      .from("tasks")
      .select("id,title,description,due_at,status,updated_at")
      .eq("assignee_id", userId),
    supabaseAdmin
      .from("google_calendar_events")
      .select("task_id,google_event_id,content_hash")
      .eq("user_id", userId),
  ]);
  if (taskError) throw new Error("Não foi possível ler as tarefas.");
  const taskMap = new Map((tasks ?? []).map((task: any) => [task.id, task]));
  const mappingMap = new Map((mappings ?? []).map((item: any) => [item.task_id, item]));
  let created = 0;
  let updated = 0;
  let removed = 0;

  for (const task of tasks ?? []) {
    const mapping: any = mappingMap.get(task.id);
    const shouldExist = Boolean(task.due_at) && task.status !== "concluida";
    if (!shouldExist) {
      if (mapping) {
        await googleRequest(
          token,
          `/calendars/primary/events/${encodeURIComponent(mapping.google_event_id)}`,
          { method: "DELETE" },
        ).catch(() => null);
        await supabaseAdmin
          .from("google_calendar_events")
          .delete()
          .eq("user_id", userId)
          .eq("task_id", task.id);
        removed += 1;
      }
      continue;
    }
    const hash = taskHash(task);
    if (mapping?.content_hash === hash) continue;
    let eventId = mapping?.google_event_id as string | undefined;
    if (eventId) {
      try {
        await googleRequest(token, `/calendars/primary/events/${encodeURIComponent(eventId)}`, {
          method: "PUT",
          body: JSON.stringify(eventBody(task, origin)),
        });
        updated += 1;
      } catch {
        eventId = undefined;
      }
    }
    if (!eventId) {
      const event = await googleRequest(token, "/calendars/primary/events", {
        method: "POST",
        body: JSON.stringify(eventBody(task, origin)),
      });
      eventId = event.id;
      created += 1;
    }
    await supabaseAdmin.from("google_calendar_events").upsert({
      user_id: userId,
      task_id: task.id,
      google_event_id: eventId!,
      content_hash: hash,
      last_synced_at: new Date().toISOString(),
    });
  }

  for (const mapping of mappings ?? []) {
    if (!taskMap.has(mapping.task_id)) {
      await googleRequest(
        token,
        `/calendars/primary/events/${encodeURIComponent(mapping.google_event_id)}`,
        { method: "DELETE" },
      ).catch(() => null);
      await supabaseAdmin
        .from("google_calendar_events")
        .delete()
        .eq("user_id", userId)
        .eq("task_id", mapping.task_id);
      removed += 1;
    }
  }
  await supabaseAdmin
    .from("google_calendar_connections")
    .update({
      status: "conectado",
      last_synced_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  return { created, updated, removed };
}
