import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { catalogPriceBreakdown, type CatalogPriceCurrency } from "@/lib/catalog-pricing";

type CatalogCurrency = "BRL" | "USD" | "PYG";
async function catalogRates(db: any) {
  const factors: Record<string, number> = {};
  for (const base of ["USD", "BRL", "PYG"]) {
    for (const quote of ["USD", "BRL", "PYG"]) {
      if (base === quote) {
        factors[`${base}-${quote}`] = 1;
        continue;
      }
      const { data, error } = await db.rpc("financial_rate_at", {
        p_base: base,
        p_quote: quote,
        p_at: new Date().toISOString(),
      });
      const rate = Number(data?.[0]?.rate);
      if (error || !Number.isFinite(rate) || rate <= 0)
        throw new Error(`Cotação de ${base} para ${quote} indisponível.`);
      factors[`${base}-${quote}`] = rate;
    }
  }
  return factors;
}
function catalogUnitPrice(item: any, rules: any, target: string, factors: Record<string, number>) {
  const detail = catalogPriceBreakdown(
    item,
    rules,
    target as CatalogPriceCurrency,
    (value, from, to) => {
      const factor = factors[`${from}-${to}`];
      return factor > 0 ? value * factor : null;
    },
  );
  if (detail.sale == null)
    throw new Error(`Cadastre o custo ou um preço manual para ${item.name}.`);
  return detail.sale;
}

export type PublicCatalogMedia = {
  id: string;
  kind: "image" | "video" | "link";
  url: string;
  label: string | null;
};

export type PublicCatalogSeller = {
  id: string;
  name: string;
  phone: string | null;
  region: string;
};

export type PublicCatalogItem = {
  id: string;
  name: string;
  spec: string;
  description: string | null;
  brand: string | null;
  sku: string | null;
  unit: string | null;
  image: string | null;
  media: PublicCatalogMedia[];
  infoGroupUrl: string | null;
  sellers: PublicCatalogSeller[];
  price: number | null;
  currency: "BRL" | "USD" | "PYG";
  available: boolean;
  stock: number;
  minQuantity: number;
  offer: boolean;
  group: string;
};

export type ShippingRegion = { name: string; fee: number; days: number | null };

export const CATALOG_MINIMUM_UNITS = 10;

export type CatalogFreightQuote = {
  percentage: number;
  amount: number;
  currency: "BRL" | "USD" | "PYG";
};

export type PublicCatalog = {
  exchangeRates: Record<string, number>;
  slug: string;
  title: string;
  description: string | null;
  about: string | null;
  cover: string | null;
  logo: string | null;
  banner: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  whatsapp: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactAddress: string | null;
  currency: "BRL" | "USD" | "PYG";
  showPrices: boolean;
  consultLabel: string;
  showAvailability: boolean;
  requireIdentification: boolean;
  ordersEnabled: boolean;
  successMessage: string | null;
  installmentsEnabled: boolean;
  installmentsMax: number;
  paymentMethods: string[];
  pickupEnabled: boolean;
  pickupAddress: string | null;
  deliveryEnabled: boolean;
  shippingMode: "gratis" | "fixo" | "combinar" | "regiao";
  shippingFee: number;
  shippingDays: number | null;
  shippingRegions: ShippingRegion[];
  brands: string[];
  items: PublicCatalogItem[];
};

/** Catálogo digital público: lido por link, sem login. Só devolve dados seguros de vitrine. */
export const getPublicCatalog = createServerFn({ method: "GET" })
  .validator((data) => z.object({ slug: z.string() }).parse(data))
  .handler(async ({ data }): Promise<PublicCatalog | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: catalog } = await supabaseAdmin
      .from("digital_catalogs")
      .select("*")
      .eq("slug", data.slug)
      .maybeSingle();

    if (!catalog || !catalog.is_published) return null;
    const { data: company } = await supabaseAdmin
      .from("company_settings")
      .select("phone,email,address,city,state")
      .limit(1)
      .maybeSingle();
    const c = catalog as Record<string, unknown>;
    const str = (k: string) => (typeof c[k] === "string" && c[k] ? (c[k] as string) : null);
    const bool = (k: string, fallback = false) =>
      typeof c[k] === "boolean" ? (c[k] as boolean) : fallback;

    let query = supabaseAdmin
      .from("inventory_items")
      .select(
        "id,name,sku,brand,description,variation,size,weight,volume,unit,image_url,price,cost,tax_percent,extra_cost,currency,quantity,reserved,min_quantity,is_active,product_id,category_id",
      )
      .eq("is_active", true);

    const itemIds = (catalog.item_ids ?? []) as string[];
    const categoryIds = (catalog.category_ids ?? []) as string[];
    const productIds = (catalog.product_ids ?? []) as string[];
    if (itemIds.length) query = query.in("id", itemIds);
    else if (categoryIds.length) query = query.in("category_id", categoryIds);
    else if (productIds.length) query = query.in("product_id", productIds);

    const sortMode = (str("sort_mode") ?? "nome") as string;
    if (sortMode === "preco") query = query.order("price", { ascending: true });
    else if (sortMode === "preco_desc") query = query.order("price", { ascending: false });
    else if (sortMode === "recentes") query = query.order("created_at", { ascending: false });
    else query = query.order("name", { ascending: true });

    const { data: rows } = await query;
    const items = rows ?? [];

    const [{ data: macros }, { data: subs }] = await Promise.all([
      supabaseAdmin.from("products").select("id,name"),
      supabaseAdmin.from("product_categories").select("id,name"),
    ]);
    const macroName = (id: string | null) =>
      (macros ?? []).find((m) => m.id === id)?.name ?? "Produtos";
    const subName = (id: string | null) => (subs ?? []).find((s) => s.id === id)?.name ?? "";

    let productConfigs: Record<string, Record<string, unknown>> = {};
    const { data: configFile } = await supabaseAdmin.storage
      .from("produtos")
      .download("catalog/product-config.json");
    if (configFile) {
      try {
        const parsed = JSON.parse(await configFile.text());
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) productConfigs = parsed;
      } catch {
        productConfigs = {};
      }
    }
    const configFor = (itemId: string) => productConfigs[itemId] ?? {};

    const mediaEntries = (item: (typeof items)[number]) => {
      const configuredMedia = configFor(item.id)["media"];
      if (!Array.isArray(configuredMedia)) return [];
      return configuredMedia.flatMap((entry, index) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
        const record = entry as Record<string, unknown>;
        const path = typeof record["path"] === "string" ? record["path"] : null;
        const url = typeof record["url"] === "string" ? record["url"] : null;
        if (!path && !url) return [];
        const kind =
          record["kind"] === "video" || record["kind"] === "image" ? record["kind"] : "link";
        return [
          {
            id: typeof record["id"] === "string" ? record["id"] : `${item.id}-${index}`,
            kind,
            path,
            url,
            label: typeof record["label"] === "string" ? record["label"] : null,
          },
        ];
      });
    };

    const allPaths = [
      ...items.map((i) => i.image_url),
      ...items.flatMap((item) => mediaEntries(item).map((entry) => entry.path)),
    ].filter((p): p is string => !!p);
    const paths = allPaths.filter((path) => !path.startsWith("/catalogo/"));
    const signed = new Map<string, string>(
      allPaths.filter((path) => path.startsWith("/catalogo/")).map((path) => [path, path]),
    );
    if (paths.length) {
      const { data: urls } = await supabaseAdmin.storage
        .from("produtos")
        .createSignedUrls(paths, 60 * 60 * 24 * 7);
      for (const u of urls ?? []) {
        if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
      }
    }

    const signOne = async (path: string | null) => {
      if (!path) return null;
      if (path.startsWith("/catalogo/")) return path;
      const { data: s } = await supabaseAdmin.storage
        .from("produtos")
        .createSignedUrl(path, 60 * 60 * 24 * 7);
      return s?.signedUrl ?? null;
    };
    const [cover, logo, banner] = await Promise.all([
      signOne(catalog.cover_url),
      signOne(str("logo_url")),
      signOne(str("banner_url") ?? "cc4778e7-458f-4f7a-b4d4-02409b0a65e9.png"),
    ]);

    const offers = (c["offer_item_ids"] ?? []) as string[];
    const showPrices = catalog.show_prices;

    const configuredSellerIds = (itemId: string) => {
      const value = configFor(itemId)["sellerIds"];
      return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
    };
    const explicitSellerIds = items.flatMap((item) => configuredSellerIds(item.id));
    const needsActiveSellers = items.some((item) => !configuredSellerIds(item.id).length);
    const activeSellerIds = new Set<string>();
    if (needsActiveSellers) {
      const { data: sellerRoles } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("role", "vendedor");
      for (const role of sellerRoles ?? []) activeSellerIds.add(role.user_id);
      // Rubens atua como vendedor no catálogo embora o papel global seja superadmin.
      activeSellerIds.add("7f511f75-2c4e-44a9-a8f6-c3c718ab2c43");
    }
    const sellerIds = [
      ...new Set([
        ...explicitSellerIds,
        ...activeSellerIds,
        ...(catalog.default_seller_id ? [catalog.default_seller_id] : []),
      ]),
    ];
    const sellerMap = new Map<string, PublicCatalogSeller>();
    if (sellerIds.length) {
      const [{ data: sellerProfiles }, { data: authUsers }] = await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("id,full_name,phone")
          .in("id", sellerIds)
          .eq("is_active", true),
        supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      ]);
      const whatsappBySeller = new Map(
        (authUsers?.users ?? []).flatMap((user) => {
          const whatsapp = user.user_metadata?.whatsapp;
          return sellerIds.includes(user.id) && typeof whatsapp === "string"
            ? [[user.id, whatsapp] as const]
            : [];
        }),
      );
      const { data: sellerTerritories } = await supabaseAdmin
        .from("integral_division_access")
        .select("user_id,region_code,territory_uf")
        .in("user_id", sellerIds)
        .eq("can_view", true);
      const territoryBySeller = new Map<string, string[]>();
      for (const territory of sellerTerritories ?? []) {
        const label = territory.territory_uf || territory.region_code;
        if (!label) continue;
        territoryBySeller.set(territory.user_id, [
          ...(territoryBySeller.get(territory.user_id) ?? []),
          String(label),
        ]);
      }
      const regionLabel = (seller: { id: string; full_name: string }) => {
        const name = seller.full_name.trim().toLocaleLowerCase("pt-BR");
        if (name === "junior" || name === "zé" || name === "ze") return "Atende todo o Brasil";
        const fixedRegions: Record<string, string> = {
          "enzo cabello": "Região Sul",
          luyd: "Região Sul",
          rubens: "Região Norte",
          "jorge luiz": "Região Nordeste",
          jorge: "Região Nordeste",
          jair: "Região Centro-Oeste",
          isabella: "Região Sudeste",
        };
        if (fixedRegions[name]) return fixedRegions[name];
        const labels = [...new Set(territoryBySeller.get(seller.id) ?? [])];
        if (!labels.length) return "Região não informada";
        return labels
          .map((value) =>
            value
              .replace(/_/g, " ")
              .replace(/\b\w/g, (letter) => letter.toLocaleUpperCase("pt-BR")),
          )
          .join(" · ");
      };
      for (const seller of sellerProfiles ?? []) {
        sellerMap.set(seller.id, {
          id: seller.id,
          name: seller.full_name,
          phone: seller.phone || whatsappBySeller.get(seller.id) || null,
          region: regionLabel(seller),
        });
      }
    }

    const sellersFor = (item: (typeof items)[number]) => {
      const configured = configuredSellerIds(item.id);
      const ids = configured.length
        ? configured
        : [...activeSellerIds, ...(catalog.default_seller_id ? [catalog.default_seller_id] : [])];
      return [...new Set(ids)]
        .map((id) => sellerMap.get(id))
        .filter((seller): seller is PublicCatalogSeller => !!seller)
        .sort((a, b) => {
          if (a.id === catalog.default_seller_id) return -1;
          if (b.id === catalog.default_seller_id) return 1;
          return a.name.localeCompare(b.name, "pt-BR");
        });
    };

    const exchangeRates = await catalogRates(supabaseAdmin);
    return {
      exchangeRates,
      slug: catalog.slug,
      title: catalog.title,
      description: catalog.description,
      about: str("about"),
      cover,
      logo,
      banner,
      primaryColor: str("primary_color"),
      accentColor: str("accent_color"),
      whatsapp: catalog.default_seller_id
        ? sellerMap.get(catalog.default_seller_id)?.phone || null
        : null,
      contactEmail: str("contact_email") || company?.email || null,
      contactPhone: str("contact_phone") || company?.phone || null,
      contactAddress:
        str("contact_address") ||
        [company?.address, company?.city, company?.state].filter(Boolean).join(" · ") ||
        null,
      currency: (catalog.currency ?? "USD") as "BRL" | "USD" | "PYG",
      showPrices,
      consultLabel: str("consult_label") ?? "Consultar",
      showAvailability: bool("show_availability", true),
      requireIdentification: bool("require_identification", true),
      ordersEnabled: bool("orders_enabled", false),
      successMessage: str("success_message"),
      installmentsEnabled: bool("installments_enabled", false),
      installmentsMax: Number(c["installments_max"] ?? 12) || 12,
      paymentMethods: (c["payment_methods"] ?? []) as string[],
      pickupEnabled: bool("pickup_enabled", true),
      pickupAddress: str("pickup_address"),
      deliveryEnabled: bool("delivery_enabled", false),
      shippingMode: (str("shipping_mode") ?? "combinar") as PublicCatalog["shippingMode"],
      shippingFee: Number(c["shipping_fee"] ?? 0) || 0,
      shippingDays: c["shipping_days"] == null ? null : Number(c["shipping_days"]),
      shippingRegions: ((c["shipping_regions"] ?? []) as ShippingRegion[]).map((r) => ({
        name: String(r?.name ?? ""),
        fee: Number(r?.fee ?? 0) || 0,
        days: r?.days == null ? null : Number(r.days),
      })),
      brands: [...new Set(items.map((i) => i.brand).filter((b): b is string => !!b))].sort(),
      items: items.map((i) => {
        const image = i.image_url ? (signed.get(i.image_url) ?? null) : null;
        const media: PublicCatalogMedia[] = [
          ...(image
            ? [{ id: `${i.id}-cover`, kind: "image" as const, url: image, label: i.name }]
            : []),
          ...mediaEntries(i).flatMap((entry) => {
            const url = entry.path ? signed.get(entry.path) : entry.url;
            if (!url) return [];
            return [{ id: entry.id, kind: entry.kind, url, label: entry.label }];
          }),
        ];
        const coverImage = image ?? media.find((entry) => entry.kind === "image")?.url ?? null;
        return {
          id: i.id,
          name: i.name,
          spec: [i.variation, i.size, i.weight, i.volume].filter(Boolean).join(" · "),
          description: i.description,
          brand: i.brand,
          sku: i.sku,
          unit: i.unit ?? null,
          image: coverImage,
          media,
          infoGroupUrl:
            typeof configFor(i.id)["infoGroupUrl"] === "string"
              ? (configFor(i.id)["infoGroupUrl"] as string)
              : null,
          sellers: sellersFor(i),
          price: showPrices
            ? catalogUnitPrice(i, c.pricing_rules, catalog.currency ?? "USD", exchangeRates)
            : null,
          currency: (catalog.currency ?? "USD") as "BRL" | "USD" | "PYG",
          available: Number(i.quantity ?? 0) - Number(i.reserved ?? 0) > 0,
          stock: Math.max(0, Number(i.quantity ?? 0) - Number(i.reserved ?? 0)),
          minQuantity: Math.max(1, Number((c.pricing_rules as any)?.products?.[i.id]?.min_quantity ?? i.min_quantity ?? 1)),
          offer: offers.includes(i.id),
          group: [macroName(i.product_id), subName(i.category_id)].filter(Boolean).join(" › "),
        };
      }),
    };
  });

const orderInput = z.object({
  slug: z.string().min(1),
  idempotencyKey: z.string().min(8).max(64),
  sellerId: z.string().uuid().optional().nullable(),
  customer: z.object({
    name: z.string().min(2).max(120),
    phone: z.string().max(40).optional().nullable(),
    email: z.string().email().max(160).optional().nullable().or(z.literal("")),
    document: z.string().max(40).optional().nullable(),
    city: z.string().max(80).optional().nullable(),
    state: z.string().max(80).optional().nullable(),
    country: z.string().max(80).optional().nullable(),
    address: z.string().max(240).optional().nullable(),
  }),
  delivery: z.object({
    mode: z.enum(["retirada", "entrega"]),
    state: z.string().max(80).optional().nullable(),
    region: z.string().max(80).optional().nullable(),
    address: z.string().max(240).optional().nullable(),
    payment_method: z.string().max(60).optional().nullable(),
    installments: z.number().int().min(1).max(36).optional().nullable(),
  }),
  notes: z.string().max(600).optional().nullable(),
  items: z
    .array(z.object({ item_id: z.string().uuid(), quantity: z.number().positive().max(100000) }))
    .min(1)
    .max(60),
});

export type CatalogOrderResult = { number: number; id: string; duplicated: boolean; total: number };

type CatalogOrderInput = z.infer<typeof orderInput>;

const freightInput = z.object({
  slug: z.string().min(1),
  state: z.string().min(2).max(80),
  city: z.string().max(80).optional().nullable(),
  items: z
    .array(z.object({ item_id: z.string().uuid(), quantity: z.number().positive().max(100000) }))
    .min(1)
    .max(60),
});

type CatalogFreightInput = z.infer<typeof freightInput>;

function totalUnits(items: CatalogFreightInput["items"]) {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

function assertMinimumUnits(items: CatalogFreightInput["items"]) {
  if (totalUnits(items) < CATALOG_MINIMUM_UNITS) {
    throw new Error(`O pedido mínimo é de ${CATALOG_MINIMUM_UNITS} unidades.`);
  }
}

function freightFieldFor(state: string) {
  const normalized = state
    .trim()
    .toLocaleUpperCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (normalized === "PY" || normalized === "PARAGUAI" || normalized === "PARAGUAY") {
    return "freight_py_percent" as const;
  }
  if (normalized === "SP" || normalized === "SAO PAULO") return "freight_sp_percent" as const;
  return "freight_other_brazil_percent" as const;
}

async function calculateCatalogFreight(data: CatalogFreightInput): Promise<CatalogFreightQuote> {
  assertMinimumUnits(data.items);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: catalog } = await supabaseAdmin
    .from("digital_catalogs")
    .select("id,is_published,orders_enabled,item_ids,category_ids,product_ids,currency,shipping_regions")
    .eq("slug", data.slug)
    .maybeSingle();
  if (!catalog?.is_published || !catalog.orders_enabled) {
    throw new Error("Este catálogo não está recebendo pedidos.");
  }

  const normalizePlace = (value: string) =>
    value.trim().toLocaleUpperCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const cityRule = data.city
    ? ((catalog.shipping_regions ?? []) as ShippingRegion[]).find(
        (region) => normalizePlace(region.name) === normalizePlace(data.city ?? ""),
      )
    : null;
  if (cityRule) {
    return {
      percentage: 0,
      amount: Math.round((Number(cityRule.fee ?? 0) || 0) * 100) / 100,
      currency: (catalog.currency ?? "USD") as CatalogFreightQuote["currency"],
    };
  }

  const requestedIds = [...new Set(data.items.map((item) => item.item_id))];
  const { data: inventory, error } = await supabaseAdmin
    .from("inventory_items")
    .select(
      "id,cost,currency,is_active,product_id,category_id,freight_sp_percent,freight_py_percent,freight_other_brazil_percent",
    )
    .in("id", requestedIds);
  if (error) throw new Error("Não foi possível calcular o frete.");
  const inventoryById = new Map((inventory ?? []).map((item) => [item.id, item]));
  const catalogCurrency = (catalog.currency ?? "USD") as CatalogFreightQuote["currency"];
  const rates = new Map<string, number>();
  for (const source of new Set((inventory ?? []).map((item) => item.currency ?? "USD"))) {
    if (source === catalogCurrency) {
      rates.set(source, 1);
      continue;
    }
    const { data: exchange, error: exchangeError } = await supabaseAdmin.rpc("financial_rate_at", {
      p_base: source,
      p_quote: catalogCurrency,
      p_at: new Date().toISOString(),
    });
    const rate = Number(exchange?.[0]?.rate ?? 0);
    if (exchangeError || !(rate > 0)) {
      throw new Error(`Cotação de ${source} para ${catalogCurrency} indisponível.`);
    }
    rates.set(source, rate);
  }

  const percentageField = freightFieldFor(data.state);
  let costTotal = 0;
  let freightTotal = 0;
  for (const line of data.items) {
    const item = inventoryById.get(line.item_id);
    if (!item?.is_active) throw new Error("Um produto do carrinho não está mais disponível.");
    const allowed = catalog.item_ids?.length
      ? catalog.item_ids.includes(item.id)
      : catalog.category_ids?.length
        ? !!item.category_id && catalog.category_ids.includes(item.category_id)
        : catalog.product_ids?.length
          ? !!item.product_id && catalog.product_ids.includes(item.product_id)
          : true;
    if (!allowed) throw new Error("Um produto do carrinho não pertence a este catálogo.");
    const sourceCurrency = item.currency ?? "USD";
    const lineCost = Number(item.cost ?? 0) * line.quantity * (rates.get(sourceCurrency) ?? 0);
    costTotal += lineCost;
    freightTotal += lineCost * (Number(item[percentageField] ?? 0) / 100);
  }

  const percentage = costTotal > 0 ? (freightTotal / costTotal) * 100 : 0;
  return {
    percentage: Math.round(percentage * 100) / 100,
    amount: Math.round(freightTotal * 100) / 100,
    currency: catalogCurrency,
  };
}

/** Calcula o frete sem expor o custo interno usado como base. */
export const quoteCatalogFreight = createServerFn({ method: "POST" })
  .validator((data) => freightInput.parse(data))
  .handler(async ({ data }) => calculateCatalogFreight(data));

async function registerCatalogContact(
  slug: string,
  customer: z.infer<typeof orderInput>["customer"],
  delivery: z.infer<typeof orderInput>["delivery"],
  notes: string | null | undefined,
  orderedItems: z.infer<typeof orderInput>["items"],
  orderNumber: number,
  sellerId: string | null,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: catalog } = await supabaseAdmin
    .from("digital_catalogs")
    .select("title,default_seller_id,product_ids,category_ids,item_ids,offer_item_ids")
    .eq("slug", slug)
    .single();
  if (!catalog) return;
  const linkedProductIds = new Set((catalog.product_ids ?? []).filter(Boolean));
  if (catalog.category_ids?.length) {
    const { data: categories } = await supabaseAdmin
      .from("product_categories")
      .select("product_id")
      .in("id", catalog.category_ids);
    for (const category of categories ?? []) {
      if (category.product_id) linkedProductIds.add(category.product_id);
    }
  }
  const catalogItemIds = [
    ...new Set([...(catalog.item_ids ?? []), ...(catalog.offer_item_ids ?? [])]),
  ];
  if (catalogItemIds.length) {
    const { data: items } = await supabaseAdmin
      .from("inventory_items")
      .select("product_id")
      .in("id", catalogItemIds);
    for (const item of items ?? []) {
      if (item.product_id) linkedProductIds.add(item.product_id);
    }
  }
  const productId = linkedProductIds.size === 1 ? [...linkedProductIds][0] : null;
  const orderedItemIds = [...new Set(orderedItems.map((item) => item.item_id))];
  const { data: orderedInventory } = await supabaseAdmin
    .from("inventory_items")
    .select("id,name")
    .in("id", orderedItemIds);
  const orderedItemName = new Map((orderedInventory ?? []).map((item) => [item.id, item.name]));
  const source = `catalogo:${slug}`;
  let { data: list } = await supabaseAdmin
    .from("contact_lists")
    .select("id")
    .eq("source", source)
    .maybeSingle();
  if (!list) {
    const { data: created, error } = await supabaseAdmin
      .from("contact_lists")
      .insert({
        name: `Catálogo — ${catalog.title}`,
        description: `Contatos originados no catálogo ${catalog.title}.`,
        source,
        product_id: productId,
      })
      .select("id")
      .single();
    if (error) throw error;
    list = created;
  } else {
    const { error } = await supabaseAdmin
      .from("contact_lists")
      .update({ product_id: productId })
      .eq("id", list.id);
    if (error) throw error;
  }

  const { data: leads, error: leadsError } = await supabaseAdmin
    .from("contact_leads")
    .select("id,phone,email,notes")
    .eq("list_id", list.id);
  if (leadsError) throw leadsError;
  const phone = customer.phone?.replace(/\D/g, "") || null;
  const email = customer.email?.trim().toLocaleLowerCase() || null;
  const existing = (leads ?? []).find((lead) => {
    const leadPhone = lead.phone?.replace(/\D/g, "") || null;
    const leadEmail = lead.email?.trim().toLocaleLowerCase() || null;
    return (phone && leadPhone === phone) || (email && leadEmail === email);
  });
  const orderNote = `Solicitação #${orderNumber} enviada pelo catálogo.`;
  const catalogDetails = [
    orderNote,
    customer.document ? `Documento: ${customer.document}` : null,
    customer.city ? `Cidade: ${customer.city}` : null,
    customer.state || delivery.state ? `Estado: ${customer.state || delivery.state}` : null,
    customer.country ? `País: ${customer.country}` : null,
    delivery.address || customer.address
      ? `Endereço: ${delivery.address || customer.address}`
      : null,
    `Recebimento: ${delivery.mode === "entrega" ? "Entrega" : "Retirada"}`,
    delivery.region ? `Região: ${delivery.region}` : null,
    delivery.payment_method ? `Forma de pagamento: ${delivery.payment_method}` : null,
    delivery.installments ? `Parcelas: ${delivery.installments}` : null,
    orderedItems.length
      ? `Produtos: ${orderedItems
          .map((item) => `${orderedItemName.get(item.item_id) ?? "Produto"} (${item.quantity})`)
          .join(", ")}`
      : null,
    notes ? `Observações: ${notes}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const payload = {
    name: customer.name,
    phone: customer.phone || null,
    email: email || null,
    city: customer.city || null,
    origin: `Catálogo ${catalog.title}`,
    product_id: productId,
    assigned_to: sellerId || catalog.default_seller_id || null,
    status: "novo",
  };
  if (existing) {
    const notes = existing.notes?.includes(orderNote)
      ? existing.notes
      : [existing.notes, catalogDetails].filter(Boolean).join("\n\n");
    const { error } = await supabaseAdmin
      .from("contact_leads")
      .update({ ...payload, notes })
      .eq("id", existing.id);
    if (error) throw error;
    return;
  }
  const { error } = await supabaseAdmin
    .from("contact_leads")
    .insert({ list_id: list.id, ...payload, notes: catalogDetails });
  if (error) throw error;
}

async function findCatalogCustomer(customer: CatalogOrderInput["customer"]) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const lookups: Array<["document" | "phone" | "whatsapp" | "email", string]> = [];
  if (customer.document?.trim()) lookups.push(["document", customer.document.trim()]);
  if (customer.phone?.trim()) {
    lookups.push(["phone", customer.phone.trim()], ["whatsapp", customer.phone.trim()]);
  }
  if (customer.email?.trim()) lookups.push(["email", customer.email.trim().toLocaleLowerCase()]);

  for (const [column, value] of lookups) {
    const { data, error } = await supabaseAdmin
      .from("customers")
      .select("id")
      .is("deleted_at", null)
      .eq(column, value)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data) return data.id;
  }

  const { data, error } = await supabaseAdmin
    .from("customers")
    .insert({
      name: customer.name.trim(),
      phone: customer.phone?.trim() || null,
      whatsapp: customer.phone?.trim() || null,
      email: customer.email?.trim().toLocaleLowerCase() || null,
      document: customer.document?.trim() || null,
      city: customer.city?.trim() || null,
      state: customer.state?.trim() || null,
      country: customer.country?.trim() || "Brasil",
      address: customer.address?.trim() || null,
      origin: "catalogo",
      status: "ativo",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function enforceCatalogRateLimit(catalogId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const bucket = `cat:${catalogId}`;
  const now = new Date();
  const { data, error } = await supabaseAdmin
    .from("catalog_rate_limits")
    .select("window_start,hits")
    .eq("bucket", bucket)
    .maybeSingle();
  if (error) throw error;
  const inCurrentWindow =
    !!data && now.getTime() - new Date(data.window_start).getTime() < 60 * 60 * 1000;
  const hits = inCurrentWindow ? Number(data.hits) + 1 : 1;
  if (hits > 60) throw new Error("Muitos pedidos em pouco tempo. Tente novamente mais tarde.");
  const { error: saveError } = await supabaseAdmin.from("catalog_rate_limits").upsert(
    {
      bucket,
      hits,
      window_start: inCurrentWindow && data ? data.window_start : now.toISOString(),
    },
    { onConflict: "bucket" },
  );
  if (saveError) throw saveError;
}

async function createCatalogRequest(input: CatalogOrderInput): Promise<CatalogOrderResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("orders")
    .select("id,number,total")
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    return {
      id: existing.id,
      number: existing.number,
      total: Number(existing.total ?? 0),
      duplicated: true,
    };
  }

  const { data: catalog, error: catalogError } = await supabaseAdmin
    .from("digital_catalogs")
    .select(
      "id,slug,currency,pricing_rules,default_seller_id,is_published,orders_enabled,item_ids,category_ids,product_ids",
    )
    .eq("slug", input.slug)
    .maybeSingle();
  if (catalogError) throw catalogError;
  if (!catalog?.is_published || !catalog.orders_enabled) {
    throw new Error("Este catálogo não está recebendo pedidos.");
  }
  await enforceCatalogRateLimit(catalog.id);

  const sellerId = input.sellerId || catalog.default_seller_id || null;
  if (sellerId) {
    const [{ data: seller }, { data: sellerRole }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("id", sellerId)
        .eq("is_active", true)
        .maybeSingle(),
      supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("user_id", sellerId)
        .eq("role", "vendedor")
        .maybeSingle(),
    ]);
    if (!seller || (!sellerRole && sellerId !== catalog.default_seller_id)) {
      throw new Error("O vendedor escolhido não está disponível para receber solicitações.");
    }
  }

  const requestedIds = [...new Set(input.items.map((line) => line.item_id))];
  const { data: inventory, error: inventoryError } = await supabaseAdmin
    .from("inventory_items")
    .select(
      "id,name,sku,barcode,unit,price,cost,tax_percent,extra_cost,currency,quantity,reserved,is_active,product_id,category_id",
    )
    .in("id", requestedIds);
  if (inventoryError) throw inventoryError;
  const inventoryById = new Map((inventory ?? []).map((item) => [item.id, item]));
  const exchangeRates = await catalogRates(supabaseAdmin);
  const lines = input.items.map((line) => {
    const item = inventoryById.get(line.item_id);
    if (!item?.is_active) throw new Error("Um produto do carrinho não está mais disponível.");
    const allowed = catalog.item_ids?.length
      ? catalog.item_ids.includes(item.id)
      : catalog.category_ids?.length
        ? !!item.category_id && catalog.category_ids.includes(item.category_id)
        : catalog.product_ids?.length
          ? !!item.product_id && catalog.product_ids.includes(item.product_id)
          : true;
    if (!allowed) throw new Error("Um produto do carrinho não pertence a este catálogo.");
    if (Number(item.quantity) - Number(item.reserved) < line.quantity) {
      throw new Error(`Estoque insuficiente para ${item.name}.`);
    }
    const unitPrice = catalogUnitPrice(
      item,
      (catalog as any).pricing_rules,
      catalog.currency ?? "USD",
      exchangeRates,
    );
    return {
      item_id: item.id,
      description: item.name,
      sku: item.sku,
      barcode: item.barcode,
      unit: item.unit,
      quantity: line.quantity,
      unit_price: unitPrice,
      discount: 0,
      total: Math.round(line.quantity * unitPrice * 100) / 100,
    };
  });
  const productsTotal = lines.reduce((sum, line) => sum + line.total, 0);
  const customerId = await findCatalogCustomer(input.customer);
  const { data: nextNumber, error: numberError } = await supabaseAdmin.rpc("sales_next_number", {
    p_scope: "orders",
  });
  if (numberError) throw numberError;

  const { data: order, error: orderError } = await supabaseAdmin
    .from("orders")
    .insert({
      number: nextNumber,
      customer_id: customerId,
      product_id: null,
      seller_id: sellerId,
      currency: catalog.currency,
      discount: 0,
      total: productsTotal,
      status: "pre_pedido",
      kind: "pre_pedido",
      stock_state: "nenhum",
      notes: input.notes?.trim() || null,
      origin: "catalogo",
      whatsapp: input.customer.phone?.trim() || null,
      order_date: new Date().toISOString().slice(0, 10),
      catalog_id: catalog.id,
      catalog_slug: catalog.slug,
      delivery: input.delivery,
      shipping_fee: 0,
      shipping_cost: 0,
      idempotency_key: input.idempotencyKey,
    })
    .select("id,number")
    .single();
  if (orderError) {
    if (orderError.code === "23505") {
      const { data: duplicated } = await supabaseAdmin
        .from("orders")
        .select("id,number,total")
        .eq("idempotency_key", input.idempotencyKey)
        .single();
      if (duplicated) {
        return {
          id: duplicated.id,
          number: duplicated.number,
          total: Number(duplicated.total ?? 0),
          duplicated: true,
        };
      }
    }
    throw orderError;
  }

  try {
    const { error: linesError } = await supabaseAdmin
      .from("order_items")
      .insert(lines.map((line) => ({ ...line, order_id: order.id })));
    if (linesError) throw linesError;
    return {
      id: order.id,
      number: order.number,
      total: productsTotal,
      duplicated: false,
    };
  } catch (error) {
    await supabaseAdmin.from("orders").delete().eq("id", order.id);
    throw error;
  }
}

/** Recebe uma solicitação pública. O estoque só será reservado após a revisão do vendedor. */
export const submitCatalogOrder = createServerFn({ method: "POST" })
  .validator((data) => orderInput.parse(data))
  .handler(async ({ data }): Promise<CatalogOrderResult> => {
    assertMinimumUnits(data.items);
    const freight =
      data.delivery.mode === "entrega"
        ? await calculateCatalogFreight({
            slug: data.slug,
            state: data.delivery.state || data.customer.state || "",
            items: data.items,
          })
        : null;
    const out = await createCatalogRequest(data);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: savedLines, error: linesError } = await supabaseAdmin
      .from("order_items")
      .select("total")
      .eq("order_id", out.id);
    if (linesError) throw new Error("O pedido foi criado, mas o total não pôde ser confirmado.");
    const productsTotal = (savedLines ?? []).reduce(
      (sum, line) => sum + Number(line.total ?? 0),
      0,
    );
    const shippingFee = freight?.amount ?? 0;
    const finalTotal = Math.round((productsTotal + shippingFee) * 100) / 100;
    const { error: updateError } = await supabaseAdmin
      .from("orders")
      .update({
        shipping_fee: shippingFee,
        shipping_cost: shippingFee,
        shipping_percentage: freight?.percentage ?? null,
        shipping_address: data.delivery.address || data.customer.address || null,
        shipping_city: data.customer.city || null,
        shipping_state: data.delivery.state || data.customer.state || null,
        total: finalTotal,
      })
      .eq("id", out.id);
    if (updateError) throw new Error("O pedido foi criado, mas o frete não pôde ser registrado.");
    await registerCatalogContact(
      data.slug,
      data.customer,
      data.delivery,
      data.notes,
      data.items,
      out.number,
      data.sellerId || null,
    );
    return {
      id: out.id,
      number: out.number,
      total: finalTotal,
      duplicated: !!out.duplicated,
    };
  });
