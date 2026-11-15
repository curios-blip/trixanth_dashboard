export function Panel({ title, actions, children, className = '', flush = false }) {
  return (
    <section className={`panel ${className}`}>
      {(title || actions) && (
        <div className="panel-head">
          {title && <h2>{title}</h2>}
          {actions && <div className="panel-actions">{actions}</div>}
        </div>
      )}
      <div className={flush ? 'panel-body flush' : 'panel-body'}>{children}</div>
    </section>
  )
}

export function Dot({ state }) {
  return <span className={`dot ${state}`} aria-hidden />
}

export function Readout({ label, value, unit, tone }) {
  return (
    <div className="readout">
      <span className="readout-label">{label}</span>
      <span className={tone ? `readout-value ${tone}` : 'readout-value'}>
        {value ?? '—'}
        {value != null && unit && <span className="readout-unit">{unit}</span>}
      </span>
    </div>
  )
}

export function Chip({ active, children, ...rest }) {
  return (
    <button className={active ? 'chip on' : 'chip'} {...rest}>
      {children}
    </button>
  )
}

export function Empty({ children }) {
  return <p className="empty">{children}</p>
}

export const fmt = (n, d = 2) =>
  n == null || Number.isNaN(n) ? null : Number(n).toFixed(d)

export function duration(s) {
  if (s == null) return null
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return m > 0 ? `${m}m ${String(sec).padStart(2, '0')}s` : `${sec}s`
}
