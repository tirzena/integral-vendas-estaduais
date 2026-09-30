import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (payload: unknown, status = 200) => Response.json(payload, { status, headers: cors });

async function serper(apiKey: string, path: string, payload: Record<string, unknown>) {
  const response = await fetch(`https://google.serper.dev/${path}`, {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = (await response.json().catch(() => ({}))) as Record<string, any>;
  if (!response.ok) throw new Error(`Serper ${response.status}`);
  return result;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "Não autorizado." }, 401);
  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return json({ error: "Sessão inválida." }, 401);
  const apiKey = Deno.env.get("SERPER_API_KEY");
  if (!apiKey) return json({ error: "A busca avançada ainda não está configurada." }, 503);
  const body = (await request.json().catch(() => ({}))) as Record<string, any>;
  try {
    if (body.action === "details") {
      const name = String(body.name ?? "")
        .trim()
        .slice(0, 140);
      const address = String(body.address ?? "")
        .trim()
        .slice(0, 180);
      if (!name) return json({ error: "Empresa inválida." }, 400);
      const result = await serper(apiKey, "search", {
        q: `"${name}" ${address}`,
        gl: "br",
        hl: "pt-br",
        num: 10,
      });
      const organic = Array.isArray(result.organic) ? result.organic : [];
      const socialDomains = [
        "instagram.com",
        "facebook.com",
        "linkedin.com",
        "tiktok.com",
        "youtube.com",
        "x.com",
      ];
      const socialLinks = organic
        .filter((row: any) =>
          socialDomains.some((domain) => String(row.link ?? "").includes(domain)),
        )
        .map((row: any) => ({
          title: String(row.title ?? "Rede social"),
          url: String(row.link),
          snippet: row.snippet ? String(row.snippet) : null,
        }));
      return json({
        ok: true,
        details: {
          description: result.knowledgeGraph?.description ?? organic[0]?.snippet ?? null,
          website:
            result.knowledgeGraph?.website ??
            organic.find(
              (row: any) => !socialDomains.some((d) => String(row.link ?? "").includes(d)),
            )?.link ??
            null,
          imageUrl: result.knowledgeGraph?.imageUrl ?? null,
          attributes: result.knowledgeGraph?.attributes ?? {},
          socialLinks,
          results: organic
            .slice(0, 5)
            .map((row: any) => ({ title: row.title, url: row.link, snippet: row.snippet ?? null })),
        },
      });
    }
    const query = String(body.query ?? "").trim();
    const page = Math.min(20, Math.max(1, Number(body.page) || 1));
    if (query.length < 3 || query.length > 180)
      return json({ error: "Informe o tipo de empresa e a cidade." }, 400);
    const result = await serper(apiKey, "places", {
      q: query,
      gl: "br",
      hl: "pt-br",
      num: 10,
      page,
    });
    const raw = Array.isArray(result.places) ? result.places : [];
    const places = raw
      .map((item: any, index: number) => ({
        id: String(item.placeId ?? item.cid ?? `${page}-${index}`),
        placeId: item.placeId ? String(item.placeId) : null,
        cid: item.cid ? String(item.cid) : null,
        position: (page - 1) * 10 + Number(item.position ?? index + 1),
        name: String(item.title ?? "Empresa"),
        address: item.address ? String(item.address) : null,
        latitude: Number(item.latitude),
        longitude: Number(item.longitude),
        rating: Number.isFinite(Number(item.rating)) ? Number(item.rating) : null,
        ratingCount: Number.isFinite(Number(item.ratingCount)) ? Number(item.ratingCount) : null,
        category: item.type ? String(item.type) : null,
        types: Array.isArray(item.types) ? item.types.map(String) : [],
        phone: item.phoneNumber ? String(item.phoneNumber) : null,
        website: item.website ? String(item.website) : null,
        description: item.description ? String(item.description) : null,
        openingHours: item.openingHours ?? null,
      }))
      .filter((item: any) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
    return json({ ok: true, places, page, hasMore: raw.length >= 10 });
  } catch (error) {
    console.error("serper-places", error instanceof Error ? error.message : "erro");
    return json({ error: "Não foi possível buscar as empresas agora." }, 502);
  }
});
