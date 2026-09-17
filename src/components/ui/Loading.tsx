interface LoadingProps {
  label?: string
  fullscreen?: boolean
  hint?: string
}

export function Loading({ label = 'Loading…', fullscreen = false, hint }: LoadingProps) {
  return (
    <div className={`loading ${fullscreen ? 'loading--fullscreen' : ''}`}>
      <div className="loading__orbs" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="loading__orb"
            style={{
              animation: `drift 2.2s ease-in-out ${i * 0.18}s infinite`,
            }}
          />
        ))}
      </div>
      <div className="col center" style={{ gap: 6 }}>
        <span className="loading__text">{label}</span>
        {hint && <span className="t-muted" style={{ fontSize: '0.85rem' }}>{hint}</span>}
      </div>
    </div>
  )
}
