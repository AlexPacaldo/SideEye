import { motion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Avatar } from '../ui/Avatar'

interface PassPhoneScreenProps {
  name: string
  seed: number
  avatarUrl?: string | null
  stage: 'gate' | 'reveal'
  variant?: 'secret' | 'action'
  children?: ReactNode
  gateHint?: string
  revealHint?: string
  proceedLabel?: string
  hideLabel?: string
  onProceed: () => void
  onHide: () => void
}

const HOLD_MS = 700

export function PassPhoneScreen({
  name,
  seed,
  avatarUrl,
  stage,
  variant = 'secret',
  children,
  gateHint = 'No peeking.',
  revealHint = 'Ready?',
  proceedLabel,
  hideLabel = 'HIDE & PASS',
  onProceed,
  onHide,
}: PassPhoneScreenProps) {
  const [revealed, setRevealed] = useState(false)
  const [progress, setProgress] = useState(0)
  const raf = useRef<number | null>(null)
  const start = useRef(0)

  const stopHold = useCallback(() => {
    if (raf.current != null) {
      cancelAnimationFrame(raf.current)
      raf.current = null
    }
    setProgress(0)
  }, [])

  const beginHold = useCallback(() => {
    start.current = performance.now()
    const loop = () => {
      const pct = Math.min(1, (performance.now() - start.current) / HOLD_MS)
      setProgress(pct)
      if (pct >= 1) {
        raf.current = null
        setProgress(0)
        setRevealed(true)
        return
      }
      raf.current = requestAnimationFrame(loop)
    }
    raf.current = requestAnimationFrame(loop)
  }, [])

  useEffect(() => () => stopHold(), [stopHold])

  if (stage === 'gate') {
    return (
      <div className="pass-phone">
        <span className="pass-phone__hint">Pass the phone to</span>
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 280, damping: 20 }}
          className="col center"
          style={{ gap: 12 }}
        >
          <Avatar seed={seed} name={name} avatarUrl={avatarUrl} size={96} state="turn" />
          <span className="pass-phone__to">{name.toUpperCase()}</span>
        </motion.div>
        <span className="pass-phone__eye" aria-hidden="true">
          👀
        </span>
        <p className="t-body">{gateHint}</p>
        <button type="button" className="btn btn--primary btn--lg btn--block" onClick={onProceed}>
          {proceedLabel ?? `I'M ${name.toUpperCase()}`}
        </button>
      </div>
    )
  }

  return (
    <div className="pass-phone">
      <span className="pass-phone__hint">{revealHint}</span>
      {revealed ? (
        <>
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            className="col center"
            style={{ gap: 8, width: '100%' }}
          >
            {children}
          </motion.div>
          {variant === 'secret' && (
            <>
              <p className="t-body">Memorize it. Then hide it.</p>
              <button
                type="button"
                className="btn btn--primary btn--lg btn--block"
                onClick={onHide}
              >
                {hideLabel}
              </button>
            </>
          )}
        </>
      ) : (
        <>
          <button
            type="button"
            className="btn btn--soft btn--lg btn--block"
            onPointerDown={beginHold}
            onPointerUp={stopHold}
            onPointerLeave={stopHold}
            onPointerCancel={stopHold}
            style={{ position: 'relative', overflow: 'hidden' }}
          >
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: 0,
                transformOrigin: 'left center',
                transform: `scaleX(${progress})`,
                background: 'color-mix(in srgb, var(--primary) 26%, transparent)',
              }}
            />
            <span style={{ position: 'relative' }}>HOLD TO REVEAL</span>
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setRevealed(true)}
          >
            or tap to reveal
          </button>
        </>
      )}
    </div>
  )
}
