/**
 * Leitor de listas de fornecedor (WhatsApp, e-mail, planilha colada ou CSV simples).
 * Puro e testável: não acessa banco, apenas transforma texto em linhas normalizadas.
 */

export type NumberFormat = "auto" | "br" | "us";

export type ParsedRow = {
  lineNo: number;
  raw: string;
  code: string | null;
  barcode: string | null;
  description: string;
  variation: string | null;
  qty: number | null;
  unit: string | null;
  value: number | null;
  currency: Currency | null;
  invalid: string | null;
};

export type Currency = "BRL" | "USD" | "PYG";

export type ColumnMap = {
  code?: number;
  barcode?: number;
  description?: number;
  variation?: number;
  qty?: number;
  unit?: number;
  value?: number;
  currency?: number;
};

export type ParseOptions = {
  numberFormat?: NumberFormat;
  columns?: ColumnMap | null;
  defaultCurrency?: Currency | null;
};

const UNITS = ["un", "und", "unid", "unidade", "unidades", "pc", "pcs", "peca", "pecas", "cx", "caixa", "kg", "g", "l", "ml", "m", "par", "pares"];

export function normalizeText(s: string) {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Converte "1.234,56" / "1,234.56" / "1234.56" em número, respeitando o formato escolhido. */
export function parseNumber(input: string, format: NumberFormat = "auto"): number | null {
  if (input == null) return null;
  let s = String(input).trim().replace(/\s/g, "").replace(/[^\d.,-]/g, "");
  if (!s || !/\d/.test(s)) return null;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  let decimal: "," | "." | null = null;
  if (format === "br") decimal = hasComma ? "," : null;
  else if (format === "us") decimal = hasDot ? "." : null;
  else if (hasComma && hasDot) decimal = s.lastIndexOf(",") > s.lastIndexOf(".") ? "," : ".";
  else if (hasComma) decimal = /,\d{1,2}$/.test(s) ? "," : null;
  else if (hasDot) decimal = /\.\d{1,2}$/.test(s) && (s.match(/\./g) ?? []).length === 1 ? "." : null;

  if (decimal === ",") s = s.replace(/\./g, "").replace(",", ".");
  else if (decimal === ".") s = s.replace(/,/g, "");
  else s = s.replace(/[.,]/g, "");

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function detectCurrency(text: string): Currency | null {
  const t = text.toLowerCase();
  if (/(us\$|usd|d[oó]lar|dolares|d[oó]lares)/.test(t)) return "USD";
  if (/(r\$|brl|reais|real)\b/.test(t)) return "BRL";
  if (/(g\$|₲|pyg|guaran)/.test(t)) return "PYG";
  return null;
}

function splitColumns(line: string): string[] {
  if (line.includes("\t")) return line.split("\t");
  if (line.includes(";")) return line.split(";");
  if ((line.match(/,/g) ?? []).length >= 2) return line.split(",");
  if (/\s{2,}|\s\|\s/.test(line)) return line.split(/\s*\|\s*|\s{2,}/);
  return [];
}

function isHeader(cols: string[]) {
  const joined = normalizeText(cols.join(" "));
  return /(descricao|produto|nome)/.test(joined) && /(qtd|quantidade|estoque|preco|valor|custo)/.test(joined);
}

function looksLikeCode(v: string) {
  return /^[a-z0-9][a-z0-9._/-]{2,}$/i.test(v) && /\d/.test(v);
}

/** Analisa o texto colado e devolve uma linha por produto informado. */
export function parseSupplierList(text: string, options: ParseOptions = {}): ParsedRow[] {
  const { numberFormat = "auto", columns = null, defaultCurrency = null } = options;
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^[-=_*#]+$/.test(l));

  const rows: ParsedRow[] = [];
  lines.forEach((line, index) => {
    const lineNo = index + 1;
    const cols = splitColumns(line).map((c) => c.trim());
    if (cols.length >= 2 && isHeader(cols)) return;

    if (cols.length >= 2) {
      rows.push(fromColumns(cols, line, lineNo, numberFormat, columns, defaultCurrency));
      return;
    }
    rows.push(fromFreeText(line, lineNo, numberFormat, defaultCurrency));
  });
  return rows;
}

function fromColumns(
  cols: string[],
  raw: string,
  lineNo: number,
  numberFormat: NumberFormat,
  map: ColumnMap | null,
  defaultCurrency: Currency | null,
): ParsedRow {
  const at = (i?: number) => (i === undefined ? null : (cols[i] ?? "").trim() || null);
  let code: string | null = null;
  let barcode: string | null = null;
  let description = "";
  let variation: string | null = null;
  let qty: number | null = null;
  let unit: string | null = null;
  let value: number | null = null;
  let currency: Currency | null = null;

  if (map) {
    code = at(map.code);
    barcode = at(map.barcode);
    description = at(map.description) ?? "";
    variation = at(map.variation);
    qty = parseNumber(at(map.qty) ?? "", numberFormat);
    unit = at(map.unit);
    value = parseNumber(at(map.value) ?? "", numberFormat);
    const cur = at(map.currency);
    currency = (cur && detectCurrency(cur)) || defaultCurrency;
  } else {
    const numeric: { index: number; value: number }[] = [];
    cols.forEach((c, i) => {
      const n = parseNumber(c, numberFormat);
      if (n !== null && /^[^a-z]*$/i.test(c.replace(/(us\$|r\$|g\$|₲|usd|brl|pyg)/gi, "").trim())) {
        numeric.push({ index: i, value: n });
      }
    });
    // primeiro texto longo é a descrição; código é um token curto alfanumérico antes dela
    const textCols = cols
      .map((c, i) => ({ c, i }))
      .filter(({ c, i }) => !numeric.some((n) => n.index === i) && c.length > 0);
    const descEntry = textCols.slice().sort((a, b) => b.c.length - a.c.length)[0];
    description = descEntry?.c ?? "";
    for (const t of textCols) {
      if (t.i === descEntry?.i) continue;
      if (!code && looksLikeCode(t.c)) code = t.c;
      else if (!unit && UNITS.includes(normalizeText(t.c))) unit = t.c;
      else if (!variation) variation = t.c;
    }
    const bar = cols.find((c) => /^\d{8,14}$/.test(c.trim()));
    if (bar) barcode = bar.trim();
    const pool = numeric.filter((n) => String(cols[n.index]).trim() !== barcode);
    const priced = pool.filter((n) => /(us\$|r\$|g\$|₲|usd|brl|pyg)/i.test(String(cols[n.index])));
    if (pool.length === 1) {
      value = pool[0]!.value;
    } else if (pool.length >= 2) {
      if (priced.length === 1) {
        value = priced[0]!.value;
        const rest = pool.filter((n) => n.index !== priced[0]!.index);
        qty = rest[0]!.value;
      } else {
        // sem marcação de moeda: a coluna anterior é a quantidade e a última é o valor
        const ordered = pool.slice().sort((a, b) => a.index - b.index);
        qty = ordered[ordered.length - 2]!.value;
        value = ordered[ordered.length - 1]!.value;
      }
    }
    currency = detectCurrency(raw) ?? defaultCurrency;
  }

  const invalid = !description && !code && !barcode ? "Linha sem identificação de produto" : null;
  return {
    lineNo,
    raw,
    code,
    barcode,
    description: description.trim(),
    variation,
    qty,
    unit,
    value,
    currency,
    invalid,
  };
}

function fromFreeText(
  line: string,
  lineNo: number,
  numberFormat: NumberFormat,
  defaultCurrency: Currency | null,
): ParsedRow {
  let rest = ` ${line} `;
  const currency = detectCurrency(line) ?? defaultCurrency;

  let barcode: string | null = null;
  const barMatch = rest.match(/(?<![\d.,])(\d{12,14})(?![\d.,])/);
  if (barMatch) {
    barcode = barMatch[1]!;
    rest = rest.replace(barMatch[0], " ");
  }

  let code: string | null = null;
  const codeMatch = rest.match(/(?:^|\s)(?:cod\.?|c[oó]digo|sku|ref\.?)\s*[:#]?\s*([a-z0-9._/-]{2,})/i);
  if (codeMatch) {
    code = codeMatch[1]!;
    rest = rest.replace(codeMatch[0], " ");
  }

  let qty: number | null = null;
  let unit: string | null = null;
  const qtyMatch = rest.match(
    new RegExp(`(\\d[\\d.,]*)\\s*(${UNITS.join("|")})\\b`, "i"),
  ) ?? rest.match(/(?:^|\s)(?:qtd\.?|quantidade|estoque)\s*[:=]?\s*(\d[\d.,]*)/i);
  if (qtyMatch) {
    qty = parseNumber(qtyMatch[1]!, numberFormat);
    unit = qtyMatch[2] ?? null;
    rest = rest.replace(qtyMatch[0], " ");
  }

  let value: number | null = null;
  const priceMatch =
    rest.match(/(?:us\$|r\$|g\$|₲|usd|brl|pyg)\s*(\d[\d.,]*)/i) ??
    rest.match(/(\d[\d.,]*)\s*(?:us\$|r\$|g\$|₲|usd|brl|pyg|d[oó]lares?|reais|guaranis?)/i) ??
    rest.match(/(?:^|\s)(?:pre[cç]o|valor|custo)\s*[:=]?\s*(\d[\d.,]*)/i);
  if (priceMatch) {
    value = parseNumber(priceMatch[1]!, numberFormat);
    rest = rest.replace(priceMatch[0], " ");
  } else {
    const trailing = rest.match(/(\d[\d.,]*)\s*$/);
    if (trailing) {
      value = parseNumber(trailing[1]!, numberFormat);
      rest = rest.replace(trailing[0], " ");
    }
  }

  const description = rest
    .replace(/(^|\s)[-–—:;|]+(\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const invalid = !description && !code && !barcode ? "Linha sem identificação de produto" : null;
  return { lineNo, raw: line, code, barcode, description, variation: null, qty, unit, value, currency, invalid };
}

/* ------------------------------------------------------------------ */
/* Correspondência segura com o estoque                                */
/* ------------------------------------------------------------------ */

export type MatchItem = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  variation: string | null;
  quantity: number | null;
  cost: number | null;
  price: number | null;
  currency: Currency;
  product_id: string | null;
};

export type MatchState =
  | "exata"
  | "sugestao"
  | "ambigua"
  | "nao_encontrada"
  | "invalida"
  | "duplicada"
  | "sem_valor";

export type MatchedRow = ParsedRow & {
  state: MatchState;
  itemId: string | null;
  itemName: string | null;
  matchedBy: string | null;
  candidates: { id: string; name: string }[];
  notes: string[];
};

export type Alias = { supplier_code: string | null; alias_normalized: string | null; inventory_item_id: string };

/** Aplica a prioridade: código/SKU/código de barras > alias confirmado > nome normalizado exato. */
export function matchRows(rows: ParsedRow[], items: MatchItem[], aliases: Alias[] = []): MatchedRow[] {
  const bySku = new Map<string, MatchItem[]>();
  const byBarcode = new Map<string, MatchItem[]>();
  const byName = new Map<string, MatchItem[]>();
  const push = (map: Map<string, MatchItem[]>, key: string | null | undefined, item: MatchItem) => {
    const k = normalizeText(key ?? "");
    if (!k) return;
    map.set(k, [...(map.get(k) ?? []), item]);
  };
  for (const item of items) {
    push(bySku, item.sku, item);
    push(byBarcode, item.barcode, item);
    push(byName, item.name, item);
    if (item.variation) push(byName, `${item.name} ${item.variation}`, item);
  }
  const aliasCode = new Map<string, string>();
  const aliasName = new Map<string, string>();
  for (const a of aliases) {
    if (a.supplier_code) aliasCode.set(normalizeText(a.supplier_code), a.inventory_item_id);
    if (a.alias_normalized) aliasName.set(a.alias_normalized, a.inventory_item_id);
  }
  const itemById = new Map(items.map((i) => [i.id, i]));

  const seen = new Map<string, number>();
  return rows.map((row) => {
    const notes: string[] = [];
    const base = { ...row, candidates: [] as { id: string; name: string }[], notes };
    if (row.invalid) {
      return { ...base, state: "invalida" as MatchState, itemId: null, itemName: null, matchedBy: null };
    }

    const codeKey = normalizeText(row.code ?? "");
    const barKey = normalizeText(row.barcode ?? "");
    const nameKey = normalizeText(row.description ?? "");
    const nameVarKey = normalizeText(`${row.description ?? ""} ${row.variation ?? ""}`);

    let item: MatchItem | null = null;
    let matchedBy: string | null = null;
    let ambiguous = false;
    const pick = (list: MatchItem[] | undefined, label: string) => {
      if (item || !list || list.length === 0) return;
      if (list.length > 1) {
        ambiguous = true;
        base.candidates = list.map((i) => ({ id: i.id, name: i.name }));
        return;
      }
      item = list[0]!;
      matchedBy = label;
    };

    if (barKey) pick(byBarcode.get(barKey), "código de barras");
    if (codeKey) pick(bySku.get(codeKey), "SKU");
    if (!item && codeKey && aliasCode.has(codeKey)) {
      const found = itemById.get(aliasCode.get(codeKey)!);
      if (found) {
        item = found;
        matchedBy = "código do fornecedor";
      }
    }
    if (!item && nameKey && aliasName.has(nameKey)) {
      const found = itemById.get(aliasName.get(nameKey)!);
      if (found) {
        item = found;
        matchedBy = "apelido confirmado";
      }
    }
    if (!item && nameVarKey) pick(byName.get(nameVarKey), "nome exato");
    if (!item && nameKey) pick(byName.get(nameKey), "nome exato");

    let suggestions: MatchItem[] = [];
    if (!item && !ambiguous && nameKey) {
      const tokens = nameKey.split(" ").filter((t) => t.length > 2);
      suggestions = items
        .map((i) => {
          const target = normalizeText(`${i.name} ${i.variation ?? ""} ${i.sku ?? ""}`);
          const hits = tokens.filter((t) => target.includes(t)).length;
          return { i, score: tokens.length ? hits / tokens.length : 0 };
        })
        .filter((s) => s.score >= 0.6)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map((s) => s.i);
    }

    let state: MatchState;
    if (item) state = "exata";
    else if (ambiguous) state = "ambigua";
    else if (suggestions.length > 0) {
      state = "sugestao";
      base.candidates = suggestions.map((i) => ({ id: i.id, name: i.name }));
    } else state = "nao_encontrada";

    if (item) {
      const key = (item as MatchItem).id;
      const count = (seen.get(key) ?? 0) + 1;
      seen.set(key, count);
      if (count > 1) {
        state = "duplicada";
        notes.push("Produto repetido na própria lista");
      }
    }

    if (row.qty === null && row.value === null && (state === "exata" || state === "duplicada")) {
      state = "sem_valor";
      notes.push("Linha sem quantidade e sem valor");
    }
    if (row.qty !== null && row.qty < 0) notes.push("Quantidade negativa");
    if (row.value !== null && row.value <= 0) notes.push("Valor zerado ou negativo");
    if (row.value !== null && !row.currency) notes.push("Moeda ausente na linha");

    const chosen = item as MatchItem | null;
    return {
      ...base,
      state,
      itemId: chosen?.id ?? null,
      itemName: chosen?.name ?? null,
      matchedBy,
    };
  });
}

/** Hash estável do texto + fornecedor, usado para impedir aplicar a mesma lista duas vezes. */
export async function contentHash(supplierId: string, text: string) {
  const payload = `${supplierId}::${normalizeText(text)}`;
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  let h = 0;
  for (let i = 0; i < payload.length; i += 1) h = (h * 31 + payload.charCodeAt(i)) | 0;
  return `fallback-${h}`;
}
