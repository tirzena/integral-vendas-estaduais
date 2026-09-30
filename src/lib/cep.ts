export type CepAddress = {
  cep: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
  latitude: string;
  longitude: string;
};

const digits = (value: string) => value.replace(/\D/g, "").slice(0, 8);

export function formatCep(value: string) {
  const clean = digits(value);
  return clean.length > 5 ? `${clean.slice(0, 5)}-${clean.slice(5)}` : clean;
}

/** Consulta endereço e coordenadas pelo CEP, com fallback quando a geolocalização não estiver disponível. */
export async function lookupCep(value: string): Promise<CepAddress> {
  const cep = digits(value);
  if (cep.length !== 8) throw new Error("Informe um CEP com 8 números.");
  try {
    const response = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`);
    if (!response.ok) throw new Error("CEP não encontrado.");
    const data = await response.json();
    const coordinates = data.location?.coordinates ?? {};
    return {
      cep: formatCep(cep),
      street: data.street ?? "",
      neighborhood: data.neighborhood ?? "",
      city: data.city ?? "",
      state: data.state ?? "",
      latitude: coordinates.latitude == null ? "" : String(coordinates.latitude),
      longitude: coordinates.longitude == null ? "" : String(coordinates.longitude),
    };
  } catch {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    if (!response.ok) throw new Error("CEP não encontrado.");
    const data = await response.json();
    if (data.erro) throw new Error("CEP não encontrado.");
    return {
      cep: formatCep(cep),
      street: data.logradouro ?? "",
      neighborhood: data.bairro ?? "",
      city: data.localidade ?? "",
      state: data.uf ?? "",
      latitude: "",
      longitude: "",
    };
  }
}
