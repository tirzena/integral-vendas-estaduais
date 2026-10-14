import { informationSourceUrl } from "./product-information";

export type StudyProduct = {
  id: string;
  name: string;
  brand: string | null;
  product_id: string | null;
  image_url: string | null;
  variation: string | null;
  size: string | null;
  volume: string | null;
  weight: string | null;
  public_description: string | null;
  intended_use: string | null;
  usage_instructions: string | null;
  information_source_url: string | null;
};

export const studyText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export function studySource(value: string | null) {
  const url = informationSourceUrl(value);
  if (!url) return null;
  const host = new URL(url).hostname;
  const belongs = (domain: string) => host === domain || host.endsWith("." + domain);
  const kind =
    belongs("pubmed.ncbi.nlm.nih.gov") || belongs("pmc.ncbi.nlm.nih.gov")
      ? "Literatura científica"
      : belongs("dailymed.nlm.nih.gov")
        ? "Bula de referência"
        : belongs("fda.gov") || belongs("gov.br") || belongs("ema.europa.eu")
          ? "Referência regulatória"
          : "Documentação externa";
  return { url, host, kind };
}

export function filterStudyProducts(
  items: StudyProduct[],
  options: {
    search: string;
    category: string;
    source: string;
    progress: string;
    studied: Set<string>;
  },
) {
  const query = studyText(options.search.trim());
  return items.filter((item) => {
    if (options.category !== "todos" && item.product_id !== options.category) return false;
    if (
      query &&
      !studyText(
        [item.name, item.brand, item.public_description, item.intended_use]
          .filter(Boolean)
          .join(" "),
      ).includes(query)
    )
      return false;
    const source = studySource(item.information_source_url);
    if (options.source === "with" && !source) return false;
    if (options.source === "pending" && source) return false;
    if (options.progress === "done" && !options.studied.has(item.id)) return false;
    if (options.progress === "pending" && options.studied.has(item.id)) return false;
    return true;
  });
}

export function readStudyProgress(raw: string | null): string[] {
  try {
    const value: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(value)
      ? [...new Set(value.filter((id): id is string => typeof id === "string"))]
      : [];
  } catch {
    return [];
  }
}

export const STUDY_GLOSSARY = [
  [
    "Apresentação",
    "Forma em que o produto é identificado: composição, concentração, volume, embalagem e fabricante. Apresentações diferentes precisam de documentação própria.",
  ],
  [
    "Mecanismo de ação",
    "Explicação de como uma substância interage com o organismo. Um mecanismo possível, sozinho, não comprova benefício clínico.",
  ],
  [
    "Estudo pré-clínico",
    "Pesquisa em laboratório ou em animais. Seus resultados não demonstram, por si só, eficácia em pessoas.",
  ],
  [
    "Estudo clínico",
    "Pesquisa com participantes humanos, com objetivos e critérios definidos. É necessário conferir população, resultados e limitações.",
  ],
  [
    "Indicação",
    "Condição ou finalidade específica para a qual um produto é utilizado. Uma indicação autorizada depende do produto e da agência responsável.",
  ],
  [
    "Registro sanitário",
    "Autorização vinculada a um produto e a uma autoridade sanitária. A autorização em um país não comprova autorização em outro.",
  ],
  [
    "Molécula e marca",
    "Estudos sobre uma substância não comprovam automaticamente a composição, qualidade ou equivalência de todas as marcas que usam seu nome.",
  ],
  [
    "Eficácia e segurança",
    "Eficácia se refere aos resultados demonstrados; segurança, aos riscos conhecidos no contexto estudado. As duas precisam ser avaliadas.",
  ],
  [
    "Bula",
    "Documento específico do medicamento que reúne indicações, contraindicações, riscos e orientações autorizadas para aquela apresentação.",
  ],
  [
    "Fonte primária",
    "Documento original: estudo, bula, instrução do fabricante ou publicação da autoridade sanitária. Leia a fonte e confira a data.",
  ],
] as const;
