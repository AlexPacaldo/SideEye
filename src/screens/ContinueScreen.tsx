import { motion } from 'framer-motion'
import { MessageSquare, Vote } from 'lucide-react'
import { useApp } from '../state/context'

export function ContinueScreen() {
  const { snapshot, backend, safe } = useApp()
  const room = snapshot.room
  if (!room) return null

  const out = room.lastEliminated
    ? room.players.find((p) => p.id === room.lastEliminated!.playerId)
    : undefined

  return (
    <div className="discussion-screen">
      <header className="phase-head">
        <div className="col" style={{ gap: 2 }}>
          <span className="t-eyebrow">Round {room.round}</span>
          <h1 className="t-title">KEEP GOING.</h1>
        </div>
      </header>

      <motion.p
        className="big-message"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {out ? (
          <>
            {out.name.toUpperCase()} IS OUT. <span aria-hidden="true">👋</span>
          </>
        ) : (
          <>THE ROUND IS OVER.</>
        )}
      </motion.p>
      <p className="t-body">
        Another round of clues, or straight to the vote?
      </p>

      <div className="row" style={{ gap: 12, marginTop: 4 }}>
        <button
          type="button"
          className="btn btn--ghost btn--lg grow"
          onClick={() => void safe(backend.nextRound(false))}
        >
          <MessageSquare size={18} /> SAY MORE CLUES
        </button>
        <button
          type="button"
          className="btn btn--primary btn--lg grow"
          onClick={() => void safe(backend.nextRound(true))}
        >
          <Vote size={18} /> VOTE NOW
        </button>
      </div>
    </div>
  )
}