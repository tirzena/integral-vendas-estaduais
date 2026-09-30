import { useEffect, useState, type FormEvent } from 'react'
import { ArrowRight, CheckCircle2, LoaderCircle, LockKeyhole, MapPin, ShieldCheck, ShoppingBag, Store, UserRound } from 'lucide-react'
import { Logo } from './Logo'
import { ProductCarousel } from './ProductCarousel'
import { brazilStates, loadMunicipalities, regions, type RegionId } from '@/data/locations'

type PublicEntryProps = { onLogin: () => void }

export function PublicEntry({ onLogin }: PublicEntryProps) {
  const [path, setPath] = useState<'retail' | 'wholesale'>('retail')
  const [submitted, setSubmitted] = useState(false)
  const [region, setRegion] = useState<RegionId | ''>('')
  const [stateCode, setStateCode] = useState('')
  const [municipality, setMunicipality] = useState('')
  const [municipalities, setMunicipalities] = useState<string[]>([])
  const [municipalityStatus, setMunicipalityStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [municipalityReload, setMunicipalityReload] = useState(0)

  const availableStates = region ? brazilStates.filter((state) => state.region === region) : []
  const selectedRegionName = regions.find((item) => item.id === region)?.name ?? ''
  const selectedStateName = brazilStates.find((state) => state.code === stateCode)?.name ?? ''

  useEffect(() => {
    if (!stateCode) return

    const controller = new AbortController()
    setMunicipalityStatus('loading')

    loadMunicipalities(stateCode, controller.signal)
      .then((items) => {
        setMunicipalities(items)
        setMunicipalityStatus('ready')
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setMunicipalityStatus('error')
      })

    return () => controller.abort()
  }, [stateCode, municipalityReload])

  function changeRegion(nextRegion: RegionId | '') {
    setRegion(nextRegion)
    setStateCode('')
    setMunicipality('')
    setMunicipalities([])
    setMunicipalityStatus('idle')
  }

  function changeState(nextState: string) {
    setStateCode(nextState)
    setMunicipality('')
    setMunicipalities([])
    setMunicipalityStatus(nextState ? 'loading' : 'idle')
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitted(true)
  }

  return (
    <div className="integral-public public-page">
      <header className="public-header">
        <Logo />
        <div className="public-header__actions">
          <button className="text-button text-button--light" type="button" disabled title="Validação indisponível nesta demonstração"><ShieldCheck size={18} /> Validar produto (indisponível)</button>
          <button className="button button--pink button--compact" type="button" onClick={onLogin}><UserRound size={17} /> Entrar</button>
        </div>
      </header>

      <main className="public-main">
        <section className="public-hero">
          <div className="public-hero__copy">
            <h1>Produto oficial.<br />Atendimento no<br />lugar certo.</h1>
            <div className="brand-rule" />
            <p>Você é direcionado de forma privada para o atendimento autorizado mais próximo, conforme seu estado e município.</p>
            <div className="path-selector" aria-label="Escolha seu atendimento">
              <button type="button" className={path === 'retail' ? 'path-card path-card--active-green' : 'path-card'} onClick={() => setPath('retail')}>
                <ShoppingBag size={28} />
                <span><strong>Quero comprar</strong><small>Atendimento autorizado na sua região.</small></span>
                <ArrowRight size={21} />
              </button>
              <button type="button" className={path === 'wholesale' ? 'path-card path-card--active-pink' : 'path-card'} onClick={() => setPath('wholesale')}>
                <Store size={28} />
                <span><strong>Quero revender</strong><small>Cadastro na rede de distribuição.</small></span>
                <ArrowRight size={21} />
              </button>
            </div>
          </div>
          <div className="product-stage">
            <ProductCarousel />
          </div>
        </section>

        <section className="intake-panel" aria-live="polite">
          {submitted ? (
            <div className="intake-success">
              <CheckCircle2 size={46} />
              <h2>Prévia do encaminhamento</h2>
              <p>Simulação concluída. Seu contato não foi enviado a ninguém e nenhum atendimento foi aberto.</p>
              <div className="route-result"><span>Território confirmado</span><strong>{municipality}/{stateCode} · {selectedRegionName}</strong></div>
              <div className="route-result"><span>Destino</span><strong>{path === 'retail' ? 'Revendedor municipal' : 'Direção municipal'}</strong></div>
              <div className="route-result"><span>Status</span><strong>Somente demonstração</strong></div>
              <button className="button button--primary button--wide" type="button" onClick={() => setSubmitted(false)}>Fazer novo encaminhamento</button>
            </div>
          ) : (
            <form onSubmit={submit}>
              <div className="intake-panel__title">
                <ShieldCheck size={36} />
                <div><h2>Encontre seu atendimento autorizado</h2><p>Preencha os dados para ser direcionado à sua região.</p></div>
              </div>
              <label>Nome completo<input required placeholder="Digite seu nome" /></label>
              <div className="location-flow">
                <label>1. Região do Brasil
                  <select required value={region} onChange={(event) => changeRegion(event.target.value as RegionId | '')}>
                    <option value="" disabled>Selecione a região</option>
                    {regions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </label>
                <div className="form-grid">
                  <label>2. Estado
                    <select required value={stateCode} disabled={!region} onChange={(event) => changeState(event.target.value)}>
                      <option value="" disabled>{region ? 'Selecione o estado' : 'Escolha a região antes'}</option>
                      {availableStates.map((state) => <option key={state.code} value={state.code}>{state.name} ({state.code})</option>)}
                    </select>
                  </label>
                  <label>3. Município
                    <span className="select-with-status">
                      <select
                        required
                        value={municipality}
                        disabled={municipalityStatus !== 'ready'}
                        aria-busy={municipalityStatus === 'loading'}
                        onChange={(event) => setMunicipality(event.target.value)}
                      >
                        <option value="" disabled>
                          {municipalityStatus === 'loading' ? 'Carregando municípios' : municipalityStatus === 'error' ? 'Falha ao carregar' : stateCode ? 'Selecione o município' : 'Escolha o estado antes'}
                        </option>
                        {municipalities.map((name) => <option key={name} value={name}>{name}</option>)}
                      </select>
                      {municipalityStatus === 'loading' && <LoaderCircle className="select-spinner" size={17} aria-hidden="true" />}
                    </span>
                  </label>
                </div>
                {municipalityStatus === 'error' && <button className="location-retry" type="button" onClick={() => setMunicipalityReload((value) => value + 1)}>Tentar carregar os municípios novamente</button>}
                {municipality && (
                  <div className="territory-preview" aria-live="polite">
                    <MapPin size={17} />
                    <span>Rota territorial</span>
                    <strong>{selectedRegionName} › {selectedStateName} › {municipality}</strong>
                  </div>
                )}
              </div>
              <label>Produto de interesse<select required defaultValue=""><option value="" disabled>Selecione o produto</option><option>Produto Tirzena</option><option>Produto Retrazin</option></select></label>
              <button className="button button--pink button--wide" type="submit"><ArrowRight size={18} /> Simular encaminhamento</button>
              <p className="privacy-note"><LockKeyhole size={17} /> Esta página simula o fluxo localmente. Os dados digitados não são enviados nem salvos pelo sistema.</p>
            </form>
          )}
        </section>
      </main>
      <footer className="public-footer"><Logo compact /><nav aria-label="Informações"><span>Privacidade</span><span>Termos</span><span>Ajuda</span></nav></footer>
    </div>
  )
}
