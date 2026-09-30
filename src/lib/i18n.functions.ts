import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  lang: z.enum(["es", "en"]),
  texts: z.array(z.string().min(1).max(400)).min(1).max(60),
});

const LANG_NAME: Record<string, string> = {
  es: "espanhol (Espanha/América Latina)",
  en: "inglês (EUA)",
};

/**
 * Traduz textos curtos da interface (pt-BR -> es/en) usando o gateway de IA,
 * com cache persistente em `ui_translations`.
 */
export const translateUi = createServerFn({ method: "POST" })
  .validator((data: unknown) => schema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const unique = Array.from(new Set(data.texts.map((t) => t.trim()).filter(Boolean)));
    const out: Record<string, string> = {};

    const { data: cached } = await supabaseAdmin
      .from("ui_translations")
      .select("source, translated")
      .eq("lang", data.lang)
      .in("source", unique);

    for (const row of cached ?? []) out[row.source] = row.translated;

    const missing = unique.filter((t) => !(t in out));
    if (missing.length === 0) return out;

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return out;

    const prompt = [
      `Traduza cada item de português do Brasil para ${LANG_NAME[data.lang]}.`,
      "É interface de um sistema ERP/CRM. Mantenha o tom curto de interface, preserve maiúsculas iniciais,",
      "pontuação, emojis, símbolos de moeda, siglas (SKU, CRM, PDV, WhatsApp) e nomes próprios como OS.",
      "Não traduza nomes de pessoas, empresas ou códigos.",
      'Responda apenas JSON no formato {"items":["traducao1","traducao2"]} na mesma ordem e quantidade da entrada.',
      "",
      JSON.stringify(missing),
    ].join("\n");

    let translated: string[] = [];
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
        }),
      });
      if (!res.ok) return out;
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = json.choices?.[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(content) as { items?: unknown };
      if (Array.isArray(parsed.items)) translated = parsed.items.map((v) => String(v));
    } catch {
      return out;
    }

    if (translated.length !== missing.length) return out;

    const rows = missing.map((source, i) => ({
      lang: data.lang,
      source,
      translated: translated[i]!,
    }));
    for (const row of rows) out[row.source] = row.translated;

    await supabaseAdmin.from("ui_translations").upsert(rows, { onConflict: "lang,source" });

    return out;
  });
