import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "produtos";
const CATALOG_CONFIG_PATH = "catalog/product-config.json";

export type ProductCatalogMedia = {
  id: string;
  kind: "image" | "video" | "link";
  path?: string;
  url?: string;
  label?: string | null;
};

export type ProductCatalogConfig = {
  media: ProductCatalogMedia[];
  infoGroupUrl: string | null;
  sellerIds: string[];
};

export type ProductCatalogConfigMap = Record<string, ProductCatalogConfig>;

/** Envia uma foto de produto e devolve o caminho guardado no banco. */
export async function uploadProductImage(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
  if (error) throw error;
  return path;
}

/** Envia uma foto ou um vídeo usado no carrossel público do produto. */
export async function uploadProductMedia(file: File) {
  if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
    throw new Error("Use uma foto ou um vídeo.");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("O arquivo deve ter no máximo 10 MB.");
  }
  return uploadProductImage(file);
}

async function readProductCatalogConfigs(): Promise<ProductCatalogConfigMap> {
  const { data, error } = await supabase.storage.from(BUCKET).download(CATALOG_CONFIG_PATH);
  if (error) {
    if (/not found|object not found/i.test(error.message)) return {};
    throw error;
  }
  try {
    const parsed = JSON.parse(await data.text());
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as ProductCatalogConfigMap)
      : {};
  } catch {
    return {};
  }
}

/** Lê de uma vez a configuração pública de mídia e contatos dos produtos. */
export function useProductCatalogConfigs() {
  return useQuery({
    queryKey: ["product-catalog-configs"],
    queryFn: readProductCatalogConfigs,
    staleTime: 5 * 60 * 1000,
  });
}

/** Atualiza a configuração de um produto sem expor o arquivo ao catálogo público. */
export async function saveProductCatalogConfig(itemId: string, config: ProductCatalogConfig) {
  const current = await readProductCatalogConfigs();
  const next: ProductCatalogConfigMap = { ...current, [itemId]: config };
  const body = new Blob([JSON.stringify(next)], { type: "application/json" });
  const { error } = await supabase.storage.from(BUCKET).upload(CATALOG_CONFIG_PATH, body, {
    upsert: true,
    contentType: "application/json",
    cacheControl: "60",
  });
  if (error) throw error;
}

/** Gera links temporários para mostrar as fotos dentro do sistema. */
export function useProductImages(paths: (string | null | undefined)[]) {
  const list = [...new Set(paths.filter((p): p is string => !!p))].sort();
  return useQuery({
    queryKey: ["product-images", list.join("|")],
    enabled: list.length > 0,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const local = list.filter((path) => path.startsWith("/catalogo/"));
      const stored = list.filter((path) => !path.startsWith("/catalogo/"));
      const { data } = stored.length
        ? await supabase.storage.from(BUCKET).createSignedUrls(stored, 60 * 60 * 2)
        : { data: [] };
      const map: Record<string, string> = Object.fromEntries(local.map((path) => [path, path]));
      for (const u of data ?? []) if (u.path && u.signedUrl) map[u.path] = u.signedUrl;
      return map;
    },
  });
}
