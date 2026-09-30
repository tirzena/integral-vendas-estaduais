import type { Currency, LivePair } from "@/lib/rates.functions";

type ChacoExchangeItem = {
  isoCode: string;
  purchasePrice: number;
  salePrice: number;
  purchaseArbitrage?: number;
  saleArbitrage?: number;
  updatedAt?: string;
};

type ChacoExchangeResponse = {
  updateTs?: string;
  items?: ChacoExchangeItem[];
};

const SOURCE = "Câmbios Chaco";
const ENDPOINT = "https://www.cambioschaco.com.py/api/branch_office/1/exchange/";

function pair(
  base: Currency,
  quote: Currency,
  rate: number,
  time: number,
  sourceUpdatedAt: string,
): LivePair {
  return {
    base,
    quote,
    rate,
    previousClose: rate,
    changePct: 0,
    time,
    series: [rate],
    source: SOURCE,
    sourceUpdatedAt,
  };
}

/** Consulta a fonte oficial no navegador, pois o provedor bloqueia IPs de datacenter. */
export async function fetchChacoLiveRates() {
  const response = await fetch(ENDPOINT, { headers: { Accept: "*/*" } });
  if (!response.ok) throw new Error(`Câmbios Chaco HTTP ${response.status}`);
  const data = (await response.json()) as ChacoExchangeResponse;
  const usd = data.items?.find((item) => item.isoCode === "USD");
  const brl = data.items?.find((item) => item.isoCode === "BRL");
  if (!usd || !brl) throw new Error("Cotações de USD ou BRL não encontradas");

  const updatedAt = data.updateTs ?? usd.updatedAt ?? brl.updatedAt ?? new Date().toISOString();
  const time = Math.floor(new Date(updatedAt).getTime() / 1000);
  if (!Number.isFinite(time)) throw new Error("Horário de atualização inválido");

  const midpoint = (purchase: number, sale: number) => {
    if (!(purchase > 0) || !(sale > 0)) throw new Error("Cotação de compra ou venda inválida");
    return (purchase + sale) / 2;
  };
  const usdPyg = midpoint(usd.purchasePrice, usd.salePrice);
  const brlPyg = midpoint(brl.purchasePrice, brl.salePrice);
  const usdBrl =
    (brl.purchaseArbitrage ?? 0) > 0 && (brl.saleArbitrage ?? 0) > 0
      ? midpoint(brl.purchaseArbitrage!, brl.saleArbitrage!)
      : usdPyg / brlPyg;
  const sourceUpdatedAt = new Date(time * 1000).toISOString();
  const pairs = [
    pair("USD", "BRL", usdBrl, time, sourceUpdatedAt),
    pair("BRL", "USD", 1 / usdBrl, time, sourceUpdatedAt),
    pair("USD", "PYG", usdPyg, time, sourceUpdatedAt),
    pair("PYG", "USD", 1 / usdPyg, time, sourceUpdatedAt),
    pair("BRL", "PYG", brlPyg, time, sourceUpdatedAt),
    pair("PYG", "BRL", 1 / brlPyg, time, sourceUpdatedAt),
  ];

  return {
    ok: true as const,
    pairs,
    source: SOURCE,
    sourceUpdatedAt,
    fetchedAt: new Date().toISOString(),
  };
}
