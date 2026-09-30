import { createFileRoute } from "@tanstack/react-router";

function redirect(path: string) {
  return new Response(null, { status: 302, headers: { Location: path } });
}

export const Route = createFileRoute("/api/public/google-calendar/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const {
          exchangeGoogleCode,
          encryptGoogleToken,
          syncGoogleTasks,
          GOOGLE_CALENDAR_SCOPES,
          GOOGLE_SHEETS_SCOPES,
        } = await import("@/lib/google-calendar.server");
        const url = new URL(request.url);
        const state = url.searchParams.get("state") ?? "";
        const code = url.searchParams.get("code");
        if (!state) return redirect("/tarefas?google=estado_invalido");
        const { data: row } = await (supabaseAdmin as any)
          .from("google_calendar_oauth_states")
          .select("state,user_id,redirect_uri,expires_at,used_at,service,return_path")
          .eq("state", state)
          .maybeSingle();
        const service = row?.service === "sheets" ? "sheets" : "calendar";
        const fallbackPath = service === "sheets" ? "/contatos" : "/tarefas";
        const returnPath =
          row?.return_path?.startsWith("/") && !row.return_path.startsWith("//")
            ? row.return_path
            : fallbackPath;
        const resultParam = service === "sheets" ? "google_sheets" : "google";
        if (!code) return redirect(`${returnPath}?${resultParam}=recusado`);
        if (!row || row.used_at || new Date(row.expires_at) < new Date())
          return redirect(`${returnPath}?${resultParam}=estado_invalido`);
        const { data: claimed } = await supabaseAdmin
          .from("google_calendar_oauth_states")
          .update({ used_at: new Date().toISOString() })
          .eq("state", state)
          .is("used_at", null)
          .select("state")
          .maybeSingle();
        if (!claimed) return redirect(`${returnPath}?${resultParam}=estado_invalido`);
        try {
          const tokens = await exchangeGoogleCode(code, row.redirect_uri);
          const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          });
          const profile = (await profileResponse.json().catch(() => ({}))) as any;
          const connectionTable =
            service === "sheets" ? "google_sheets_connections" : "google_calendar_connections";
          const scopes = service === "sheets" ? GOOGLE_SHEETS_SCOPES : GOOGLE_CALENDAR_SCOPES;
          const { data: previous } = await (supabaseAdmin as any)
            .from(connectionTable)
            .select("refresh_token_encrypted")
            .eq("user_id", row.user_id)
            .maybeSingle();
          const { error: connectionError } = await (supabaseAdmin as any).from(connectionTable).upsert({
            user_id: row.user_id,
            google_email: profile.email ?? null,
            access_token_encrypted: await encryptGoogleToken(tokens.access_token),
            refresh_token_encrypted: tokens.refresh_token
              ? await encryptGoogleToken(tokens.refresh_token)
              : (previous?.refresh_token_encrypted ?? null),
            token_expires_at: new Date(
              Date.now() + (tokens.expires_in ?? 3600) * 1000,
            ).toISOString(),
            scopes: [...scopes],
            status: "conectado",
            last_error: null,
            updated_at: new Date().toISOString(),
          });
          if (connectionError)
            throw new Error(`Não foi possível salvar a conexão do Google: ${connectionError.message}`);
          if (service === "calendar")
            await syncGoogleTasks(row.user_id, new URL(request.url).origin);
          const separator = returnPath.includes("?") ? "&" : "?";
          return redirect(`${returnPath}${separator}${resultParam}=conectado`);
        } catch (error) {
          console.error(
            "google-calendar-callback",
            error instanceof Error ? error.message : "erro",
          );
          const separator = returnPath.includes("?") ? "&" : "?";
          return redirect(`${returnPath}${separator}${resultParam}=erro`);
        }
      },
    },
  },
});
