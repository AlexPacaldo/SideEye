import { motion } from 'framer-motion'

export interface ClueEntry {
  playerId: string
  name: string
  text: string
  isYou?: boolean
  blank?: boolean
}

interface ClueStackProps {
  entries: ClueEntry[]
  revealedCount?: number
}

export function ClueStack({ entries, revealedCount }: ClueStackProps) {
  return (
    <div className="clue-stack">
      {entries.map((entry, i) => {
        const revealed = revealedCount === undefined || i < revealedCount
        return (
          <motion.div
            key={entry.playerId}
            className={[
              'clue-line',
              entry.isYou ? 'clue-line--you' : '',
              entry.blank || !revealed ? 'clue-line--blank' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            initial={revealedCount === undefined ? false : { opacity: 0, y: 10 }}
            animate={
              revealedCount === undefined
                ? undefined
                : revealed
                  ? { opacity: 1, y: 0 }
                  : { opacity: 0.35, y: 0 }
            }
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
          >
            <span className="clue-line__who">
              {entry.name}
              {entry.isYou ? ' (you)' : ''}
            </span>
            <span className="clue-line__word">
              {entry.blank || !revealed ? '· · ·' : entry.text}
            </span>
          </motion.div>
        )
      })}
    </div>
  )
}
