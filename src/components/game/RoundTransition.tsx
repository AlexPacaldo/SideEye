import { motion } from 'framer-motion'
import { useEffect } from 'react'

interface RoundTransitionProps {
  round: number
  onDone: () => void
}

export function RoundTransition({ round, onDone }: RoundTransitionProps) {
  useEffect(() => {
    const handle = window.setTimeout(onDone, 1700)
    return () => window.clearTimeout(handle)
  }, [onDone])

  return (
    <motion.div
      className="round-transition"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
    >
      <span className="t-eyebrow">Round</span>
      <span className="round-transition__num">{round}</span>
      <span className="t-body">New clues. Same liars.</span>
    </motion.div>
  )
}
