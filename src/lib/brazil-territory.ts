import { brazilStates } from "@/data/brazil-state-map";

export const BRAZIL_REGIONS = {
  Norte: { codes: ["11", "12", "13", "14", "15", "16", "17"], color: "#28d7b0" },
  Nordeste: { codes: ["21", "22", "23", "24", "25", "26", "27", "28", "29"], color: "#ef7d9e" },
  "Centro-Oeste": { codes: ["50", "51", "52", "53"], color: "#f5b85a" },
  Sudeste: { codes: ["31", "32", "33", "35"], color: "#6aa9f4" },
  Sul: { codes: ["41", "42", "43"], color: "#ad8de8" },
} as const;

export type BrazilRegion = keyof typeof BRAZIL_REGIONS;
export type TerritorySelection = { mode: "national" | "state" | "region"; code?: string };

const normalize = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();

export function stateCodeFor(value?: string | null): string | null {
  if (!value) return null;
  const normalized = normalize(value);
  if (normalized === "BRASILIA" || normalized === "DISTRITO FEDERAL") return "53";
  const entry = Object.entries(brazilStates).find(
    ([code, state]) => code === normalized || state.uf === normalized || normalize(state.name) === normalized,
  );
  return entry?.[0] ?? null;
}

export function regionForState(code: string): BrazilRegion | null {
  return (Object.keys(BRAZIL_REGIONS) as BrazilRegion[]).find(
    (region) => (BRAZIL_REGIONS[region].codes as readonly string[]).includes(code),
  ) ?? null;
}

export function matchesTerritory(state: string | null | undefined, selection: TerritorySelection): boolean {
  if (selection.mode === "national") return true;
  const code = stateCodeFor(state);
  if (!code) return false;
  if (selection.mode === "state") return code === selection.code;
  return regionForState(code) === selection.code;
}
