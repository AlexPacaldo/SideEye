import { motion, useReducedMotion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { Avatar } from '../ui/Avatar'
import type { PublicPlayer, TallyEntry } from '../../game/types'

interface VoteRevealProps {
  tally: TallyEntry[]
  players: PublicPlayer[]
  onDone: () => void
  runoff?: boolean
  eliminatedId?: string | null
  tie?: boolean
}

export function VoteReveal({
  tally,
  players,
  onDone,
  runoff = false,
  eliminatedId = null,
  tie = false,
}: VoteRevealProps) {
  const reduce = useReducedMotion()
  const total = useMemo(() => tally.reduce((s, t) => s + t.count, 0), [tally])
  const [shown, setShown] = useState(reduce ? total : 0)

  useEffect(() => {
    if (shown >= total) {
      const handle = window.setTimeout(onDone, 1500)
      return () => window.clearTimeout(handle)
    }
    if (reduce) {
      setShown(total)
      return
    }
    const handle = window.setTimeout(() => setShown((s) => s + 1), 260)
    return () => window.clearTimeout(handle)
  }, [shown, total, onDone, reduce])

  const nameOf = (id: string) =>
    players.find((p) => p.id === id)?.name ?? 'Someone'
  const seedOf = (id: string) => players.find((p) => p.id === id)?.avatarSeed ?? 0

  const rows = tally
    .filter((t) => t.count > 0)
    .map((t, idx, arr) => {
      const priorSum = arr.slice(0, idx).reduce((sum, item) => sum + item.count, 0)
      const visible = Math.max(0, Math.min(t.count, shown - priorSum))
      return { ...t, visible }
    })

  const leader = rows[0]
  const done = shown >= total

  return (
    <div className="col" style={{ gap: 20 }}>
      <p className="t-eyebrow text-center">
        {runoff ? 'Runoff results' : 'Reading the room'}
      </p>

      <div className="tally">
        {rows.map((row) => (
          <div className="tally__row" key={row.playerId}>
            <span className="tally__name">
              <Avatar seed={seedOf(row.playerId)} name={nameOf(row.playerId)} size={26} />
            </span>
            <span className="tally__bar">
              {Array.from({ length: row.visible }).map((_, i) => (
                <span
                  key={i}
                  className="tally__dot"
                  style={{
                    animationDelay: `${i * 40}ms`,
                    background:
                      row.playerId === leader?.playerId
                        ? 'var(--primary)'
                        : 'var(--ink-faint)',
                  }}
                />
              ))}
            </span>
            <span className="tally__count">{row.visible}</span>
          </div>
        ))}
      </div>

      {!done && (
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShown(total)}>
          Skip ahead
        </button>
      )}

      {done && tie && (
        <motion.div
          className="col center"
          style={{ gap: 4 }}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 20 }}
        >
          <span className="t-eyebrow">Wait a second…</span>
          <span className="big-message">IT&apos;S A TIE.</span>
        </motion.div>
      )}

      {done && !tie && eliminatedId && (
        <motion.p
          className="big-message text-center"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 20 }}
        >
          {nameOf(eliminatedId).toUpperCase()} IS OUT.
        </motion.p>
      )}
    </div>
  )
}
