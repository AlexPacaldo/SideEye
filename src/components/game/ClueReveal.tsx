import { useReducedMotion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { ClueStack, type ClueEntry } from './ClueStack'

interface ClueRevealProps {
  entries: ClueEntry[]
  onDone: () => void
}

export function ClueReveal({ entries, onDone }: ClueRevealProps) {
  const reduce = useReducedMotion()
  const [count, setCount] = useState(reduce ? entries.length : 0)

  useEffect(() => {
    if (reduce) return
    const total = entries.length
    if (count >= total) {
      const handle = window.setTimeout(onDone, 900)
      return () => window.clearTimeout(handle)
    }
    const handle = window.setTimeout(
      () => setCount((c) => c + 1),
      count === 0 ? 350 : 650,
    )
    return () => window.clearTimeout(handle)
  }, [count, entries.length, onDone, reduce])

  const skip = () => {
    setCount(entries.length)
  }

  const done = count >= entries.length

  return (
    <div className="col" style={{ gap: 18 }}>
      <ClueStack entries={entries} revealedCount={count} />
      {!done && (
        <button type="button" className="btn btn--ghost btn--sm" onClick={skip}>
          Skip ahead
        </button>
      )}
    </div>
  )
}
