import { motion } from 'framer-motion'
import { MessageSquare, Vote } from 'lucide-react'
import { useApp } from '../state/context'

export function ContinueScreen() {
  const { snapshot, backend, safe } = useApp()
  const room = snapshot.room
  if (!room) return null

  // Pass & play: one device, everyone in the room votes in person, so the
  // holder of the phone always decides — no decider logic applies.
  const isPassPlay = room.mode === 'passplay'

  // DECIDER (mirror of the server-side private.next_round / leave_room rule
  // byte-for-byte: the alive host else the alive player in the lowest seat).
  // Multiplayer only: non-deciders see a passive waiting state and can never
  // trigger nextRound, so a host who leaves or is eliminated never strands
  // the decision and no other player can hijack it.
  const hostAlive = !!room.hostId && !room.eliminatedIds.includes(room.hostId)
  const alivePlayers = room.players.filter(
    (p) => !room.eliminatedIds.includes(p.id),
  )
  const deciderId = hostAlive
    ? room.hostId
    : (alivePlayers[0]?.id ?? null)
  const isDecider =
    isPassPlay ||
    (!!deciderId && snapshot.me?.playerId !== undefined &&
      snapshot.me.playerId === deciderId)

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

      {isDecider ? (
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
      ) : (
        <p className="t-body" style={{ textAlign: 'center', marginTop: 4 }}>
          {snapshot.room?.players.some((p) => p.id === deciderId)
            ? 'Waiting for the decider to choose…'
            : ''}
        </p>
      )}
    </div>
  )
}