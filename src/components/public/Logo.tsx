type LogoProps = { compact?: boolean; subtitle?: string }

export function Logo({ compact = false, subtitle }: LogoProps) {
  return (
    <div className={`brand ${compact ? 'brand--compact' : ''}`} aria-label="sistemaintegral">
      <div className="brand__word">sistemaintegral</div>
      {!compact && <div className="brand__line" />}
      {subtitle && <div className="brand__subtitle">{subtitle}</div>}
    </div>
  )
}
