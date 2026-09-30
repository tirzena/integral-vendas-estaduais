import { useEffect, useRef, useState } from "react";
import { translateUi } from "@/lib/i18n.functions";

export type Lang = "pt" | "es" | "en";

export const LANGS: { value: Lang; label: string; flag: string }[] = [
  { value: "pt", label: "Português", flag: "🇧🇷" },
  { value: "es", label: "Español", flag: "🇪🇸" },
  { value: "en", label: "English", flag: "🇺🇸" },
];

const STORAGE_KEY = "app_lang";
const EVENT = "app-lang-change";

export function getLang(): Lang {
  if (typeof window === "undefined") return "pt";
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "es" || v === "en" ? v : "pt";
}

export function setLang(lang: Lang) {
  window.localStorage.setItem(STORAGE_KEY, lang);
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** Lê o idioma atual e re-renderiza quando ele muda. */
export function useLang(): Lang {
  const [lang, setState] = useState<Lang>("pt");
  useEffect(() => {
    setState(getLang());
    const h = () => setState(getLang());
    window.addEventListener(EVENT, h);
    return () => window.removeEventListener(EVENT, h);
  }, []);
  return lang;
}

/* ------------------------------------------------------------------ */
/* Dicionário base: termos frequentes traduzidos na hora, sem esperar   */
/* o serviço de tradução.                                               */
/* ------------------------------------------------------------------ */
const SEED: Record<string, { es: string; en: string }> = {
  "Dashboard": { es: "Panel", en: "Dashboard" },
  "Geral": { es: "General", en: "General" },
  "Comercial": { es: "Comercial", en: "Sales" },
  "Operação": { es: "Operación", en: "Operations" },
  "Financeiro": { es: "Financiero", en: "Finance" },
  "Pessoas": { es: "Personas", en: "People" },
  "Sistema": { es: "Sistema", en: "System" },
  "Administração": { es: "Administración", en: "Administration" },
  "CRM": { es: "CRM", en: "CRM" },
  "Atendimentos": { es: "Atenciones", en: "Conversations" },
  "Disparador de mensagens": { es: "Disparador de mensajes", en: "Message blaster" },
  "Tráfego pago": { es: "Tráfico pago", en: "Paid traffic" },
  "Listas de contatos": { es: "Listas de contactos", en: "Contact lists" },
  "Clientes": { es: "Clientes", en: "Customers" },
  "Categorias e estoque": { es: "Categorías e inventario", en: "Categories & inventory" },
  "Pedidos e orçamentos": { es: "Pedidos y presupuestos", en: "Orders & quotes" },
  "Entregas": { es: "Entregas", en: "Deliveries" },
  "Fornecedores": { es: "Proveedores", en: "Suppliers" },
  "Tarefas": { es: "Tareas", en: "Tasks" },
  "Scripts e treinamentos": { es: "Guiones y capacitaciones", en: "Scripts & training" },
  "Ranking e bonificações": { es: "Ranking y bonificaciones", en: "Ranking & bonuses" },
  "Cotações e câmbio": { es: "Cotizaciones y cambio", en: "Quotes & exchange" },
  "Membros": { es: "Miembros", en: "Members" },
  "Avisos internos": { es: "Avisos internos", en: "Internal notices" },
  "Chat interno": { es: "Chat interno", en: "Internal chat" },
  "Configurações": { es: "Configuración", en: "Settings" },
  "Visão interna (admin)": { es: "Vista interna (admin)", en: "Internal view (admin)" },
  "Salvar": { es: "Guardar", en: "Save" },
  "Cancelar": { es: "Cancelar", en: "Cancel" },
  "Excluir": { es: "Eliminar", en: "Delete" },
  "Editar": { es: "Editar", en: "Edit" },
  "Novo": { es: "Nuevo", en: "New" },
  "Nova": { es: "Nueva", en: "New" },
  "Buscar": { es: "Buscar", en: "Search" },
  "Carregando…": { es: "Cargando…", en: "Loading…" },
  "Nome": { es: "Nombre", en: "Name" },
  "Nome completo": { es: "Nombre completo", en: "Full name" },
  "E-mail": { es: "Correo electrónico", en: "Email" },
  "Telefone": { es: "Teléfono", en: "Phone" },
  "Situação": { es: "Estado", en: "Status" },
  "Categoria": { es: "Categoría", en: "Category" },
  "Subcategoria": { es: "Subcategoría", en: "Subcategory" },
  "Produto": { es: "Producto", en: "Product" },
  "Produtos": { es: "Productos", en: "Products" },
  "Preço": { es: "Precio", en: "Price" },
  "Valor": { es: "Valor", en: "Amount" },
  "Total": { es: "Total", en: "Total" },
  "Quantidade": { es: "Cantidad", en: "Quantity" },
  "Descrição": { es: "Descripción", en: "Description" },
  "Observações": { es: "Observaciones", en: "Notes" },
  "Responsável": { es: "Responsable", en: "Owner" },
  "Ações": { es: "Acciones", en: "Actions" },
  "Data": { es: "Fecha", en: "Date" },
  "Moeda": { es: "Moneda", en: "Currency" },
  "Vendedor": { es: "Vendedor", en: "Salesperson" },
  "Vendas": { es: "Ventas", en: "Sales" },
  "Pedidos": { es: "Pedidos", en: "Orders" },
  "Orçamentos": { es: "Presupuestos", en: "Quotes" },
  "Sair": { es: "Salir", en: "Sign out" },
  "Todos": { es: "Todos", en: "All" },
  "Todas": { es: "Todas", en: "All" },
  "Idioma": { es: "Idioma", en: "Language" },
};

const NON_TEXT = /^[\s\d.,:;/%+\-–—()[\]{}#*@$₲€£R§|•·<>=~^]*$/;
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "CODE", "PRE", "SVG", "PATH"]);
const ATTRS = ["placeholder", "title", "aria-label", "alt"] as const;

function cacheKey(lang: Lang) {
  return `app_i18n_cache_${lang}`;
}

function loadCache(lang: Lang): Record<string, string> {
  try {
    return JSON.parse(window.localStorage.getItem(cacheKey(lang)) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function saveCache(lang: Lang, map: Record<string, string>) {
  try {
    window.localStorage.setItem(cacheKey(lang), JSON.stringify(map));
  } catch {
    /* cache cheio: ignora */
  }
}

function translatable(value: string) {
  const t = value.trim();
  if (t.length < 2 || t.length > 300) return false;
  if (NON_TEXT.test(t)) return false;
  if (!/[a-zA-ZÀ-ÿ]/.test(t)) return false;
  return true;
}

type Original = { text: string };

/**
 * Motor de tradução da interface: percorre o DOM, guarda o texto original de
 * cada nó e aplica a tradução do idioma escolhido. Textos ainda desconhecidos
 * são enviados em lote para o serviço de tradução e ficam em cache.
 */
export function I18nRuntime() {
  const lang = useLang();
  const originals = useRef(new WeakMap<Node, Original>());
  const attrOriginals = useRef(new WeakMap<Element, Record<string, string>>());
  const dict = useRef<Record<string, string>>({});
  const pending = useRef(new Set<string>());
  const requested = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applyRef = useRef<() => void>(() => {});

  useEffect(() => {
    document.documentElement.lang = lang === "pt" ? "pt-BR" : lang;

    if (lang === "pt") {
      dict.current = {};
    } else {
      const seed: Record<string, string> = {};
      for (const [pt, v] of Object.entries(SEED)) seed[pt] = v[lang];
      dict.current = { ...seed, ...loadCache(lang) };
    }
    pending.current.clear();
    requested.current.clear();

    function translateValue(raw: string): string | null {
      const trimmed = raw.trim();
      if (!translatable(trimmed)) return null;
      const hit = dict.current[trimmed];
      if (hit) return raw.replace(trimmed, hit);
      if (lang !== "pt" && !requested.current.has(trimmed)) pending.current.add(trimmed);
      return null;
    }

    function walk(root: Node) {
      const iter = document.createNodeIterator(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
        acceptNode(node) {
          const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
          if (!el) return NodeFilter.FILTER_REJECT;
          if (SKIP_TAGS.has(el.tagName)) return NodeFilter.FILTER_REJECT;
          if (el.closest("[data-no-i18n]")) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      let node: Node | null;
      while ((node = iter.nextNode())) {
        if (node.nodeType === Node.TEXT_NODE) {
          const stored = originals.current.get(node);
          const source = stored ? stored.text : node.textContent ?? "";
          if (!source.trim()) continue;
          if (lang === "pt") {
            if (stored && node.textContent !== source) node.textContent = source;
            continue;
          }
          const next = translateValue(source);
          if (next && next !== node.textContent) {
            if (!stored) originals.current.set(node, { text: source });
            node.textContent = next;
          } else if (!stored) {
            originals.current.set(node, { text: source });
          }
        } else {
          const el = node as Element;
          for (const attr of ATTRS) {
            const stored = attrOriginals.current.get(el)?.[attr];
            const current = el.getAttribute(attr);
            if (current == null && stored == null) continue;
            const source = stored ?? current ?? "";
            if (!source.trim()) continue;
            if (lang === "pt") {
              if (stored && current !== source) el.setAttribute(attr, source);
              continue;
            }
            const next = translateValue(source);
            const map = attrOriginals.current.get(el) ?? {};
            if (!(attr in map)) {
              map[attr] = source;
              attrOriginals.current.set(el, map);
            }
            if (next && next !== current) el.setAttribute(attr, next);
          }
        }
      }
    }

    function flush() {
      if (lang === "pt" || pending.current.size === 0) return;
      const batch = Array.from(pending.current).slice(0, 60);
      batch.forEach((t) => {
        pending.current.delete(t);
        requested.current.add(t);
      });
      translateUi({ data: { lang, texts: batch } })
        .then((res) => {
          if (!res || Object.keys(res).length === 0) return;
          dict.current = { ...dict.current, ...res };
          saveCache(lang, dict.current);
          applyRef.current();
        })
        .catch(() => {});
    }

    function apply() {
      walk(document.body);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 400);
    }

    applyRef.current = apply;
    apply();

    let frame = 0;
    const observer = new MutationObserver(() => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        apply();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [lang]);

  return null;
}
