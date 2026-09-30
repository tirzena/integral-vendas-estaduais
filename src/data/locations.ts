export type RegionId = 'norte' | 'nordeste' | 'centro-oeste' | 'sudeste' | 'sul'

export type BrazilState = {
  code: string
  name: string
  region: RegionId
}

export const regions: Array<{ id: RegionId; name: string }> = [
  { id: 'norte', name: 'Norte' },
  { id: 'nordeste', name: 'Nordeste' },
  { id: 'centro-oeste', name: 'Centro-Oeste' },
  { id: 'sudeste', name: 'Sudeste' },
  { id: 'sul', name: 'Sul' },
]

export const brazilStates: BrazilState[] = [
  { code: 'AC', name: 'Acre', region: 'norte' },
  { code: 'AP', name: 'Amapá', region: 'norte' },
  { code: 'AM', name: 'Amazonas', region: 'norte' },
  { code: 'PA', name: 'Pará', region: 'norte' },
  { code: 'RO', name: 'Rondônia', region: 'norte' },
  { code: 'RR', name: 'Roraima', region: 'norte' },
  { code: 'TO', name: 'Tocantins', region: 'norte' },
  { code: 'AL', name: 'Alagoas', region: 'nordeste' },
  { code: 'BA', name: 'Bahia', region: 'nordeste' },
  { code: 'CE', name: 'Ceará', region: 'nordeste' },
  { code: 'MA', name: 'Maranhão', region: 'nordeste' },
  { code: 'PB', name: 'Paraíba', region: 'nordeste' },
  { code: 'PE', name: 'Pernambuco', region: 'nordeste' },
  { code: 'PI', name: 'Piauí', region: 'nordeste' },
  { code: 'RN', name: 'Rio Grande do Norte', region: 'nordeste' },
  { code: 'SE', name: 'Sergipe', region: 'nordeste' },
  { code: 'DF', name: 'Distrito Federal', region: 'centro-oeste' },
  { code: 'GO', name: 'Goiás', region: 'centro-oeste' },
  { code: 'MT', name: 'Mato Grosso', region: 'centro-oeste' },
  { code: 'MS', name: 'Mato Grosso do Sul', region: 'centro-oeste' },
  { code: 'ES', name: 'Espírito Santo', region: 'sudeste' },
  { code: 'MG', name: 'Minas Gerais', region: 'sudeste' },
  { code: 'RJ', name: 'Rio de Janeiro', region: 'sudeste' },
  { code: 'SP', name: 'São Paulo', region: 'sudeste' },
  { code: 'PR', name: 'Paraná', region: 'sul' },
  { code: 'RS', name: 'Rio Grande do Sul', region: 'sul' },
  { code: 'SC', name: 'Santa Catarina', region: 'sul' },
]

type IbgeMunicipality = { id: number; nome: string }

const municipalityCache = new Map<string, string[]>()

export async function loadMunicipalities(stateCode: string, signal?: AbortSignal) {
  const cached = municipalityCache.get(stateCode)
  if (cached) return cached

  const response = await fetch(
    `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${stateCode}/municipios?orderBy=nome`,
    signal ? { signal } : {},
  )

  if (!response.ok) throw new Error('Não foi possível carregar os municípios.')

  const data = await response.json() as IbgeMunicipality[]
  const municipalities = data.map((municipality) => municipality.nome)
  municipalityCache.set(stateCode, municipalities)
  return municipalities
}
