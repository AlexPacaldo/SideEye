import { Copy, Check } from 'lucide-react'
import { useState } from 'react'
import { useApp } from '../../state/context'

export function PartyInvite({ code, compact = false }: { code: string; compact?: boolean }) {
  const { toast } = useApp()
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      /* clipboard may be unavailable */
    }
    setCopied(true)
    toast('Party code copied', 'success')
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="party-invite">
      <span className="party-invite__perf" aria-hidden="true" />
      <div className="party-invite__stub">
        <div className="col" style={{ gap: 4 }}>
          <span className="t-eyebrow">Your party code</span>
          <span className="party-invite__code" aria-label={`Party code ${code}`}>
            {code.split('').map((c, i) => (
              <span key={i} style={{ animationDelay: `${i * 60}ms` }}>
                {c}
              </span>
            ))}
          </span>
        </div>
        <button
          type="button"
          className="btn btn--soft btn--sm"
          onClick={copy}
          aria-label="Copy party code"
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {!compact && (
        <p className="t-body" style={{ marginTop: 12, fontSize: '0.9rem' }}>
          Share this code with your friends — they tap <strong>Join a party</strong> to get in.
        </p>
      )}
    </div>
  )
}
