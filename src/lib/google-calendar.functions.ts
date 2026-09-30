import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function requestOrigin() {
  const request = getRequest();
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? url.host;
  const protocol = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${protocol}://${host}`;
}

export const getGoogleCalendarStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { googleCalendarConfigured } = await import("@/lib/google-calendar.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("google_calendar_connections")
      .select("google_email,status,last_synced_at,last_error")
      .eq("user_id", context.userId)
      .maybeSingle();
    return {
      configured: googleCalendarConfigured(),
      connected: data?.status === "conectado",
      connection: data ?? null,
    };
  });

export const startGoogleCalendarOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { GOOGLE_CALENDAR_SCOPES, googleCalendarConfigured } =
      await import("@/lib/google-calendar.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!googleCalendarConfigured())
      throw new Error("Google Calendar ainda não está configurado no servidor.");
    const origin = requestOrigin();
    const redirectUri = `${origin}/api/public/google-calendar/callback`;
    const state = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
    const { error } = await (supabaseAdmin as any).from("google_calendar_oauth_states").insert({
      state,
      user_id: context.userId,
      redirect_uri: redirectUri,
      service: "calendar",
      return_path: "/tarefas",
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    if (error) throw new Error("Não foi possível iniciar a conexão com o Google.");
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", process.env["GOOGLE_CLIENT_ID"]!);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", GOOGLE_CALENDAR_SCOPES.join(" "));
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);
    return { url: url.toString(), callbackUrl: redirectUri };
  });

export const syncGoogleCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { syncGoogleTasks } = await import("@/lib/google-calendar.server");
    return syncGoogleTasks(context.userId, requestOrigin());
  });

export const disconnectGoogleCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("google_calendar_events").delete().eq("user_id", context.userId);
    const { error } = await supabaseAdmin
      .from("google_calendar_connections")
      .delete()
      .eq("user_id", context.userId);
    if (error) throw new Error("Não foi possível desconectar o Google Calendar.");
    return { ok: true };
  });
