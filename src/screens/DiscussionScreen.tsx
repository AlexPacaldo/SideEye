import { motion } from 'framer-motion'
import { ClueStack } from '../components/game/ClueStack'
import { GameTimer } from '../components/ui/GameTimer'
import { useApp } from '../state/context'
import { buildClueEntries } from '../game/entries'

export function DiscussionScreen() {
  const { snapshot, backend, safe } = useApp()
  const room = snapshot.room
  const me = snapshot.me
  if (!room || !me) return null
  const entries = buildClueEntries(room, me.playerId)

  return (
    <div className="discussion-screen">
      <header className="phase-head">
        <div className="col" style={{ gap: 2 }}>
          <span className="t-eyebrow">Round {room.round}</span>
          <h1 className="t-title">LOOK AROUND.</h1>
        </div>
        <GameTimer
          deadline={room.deadline}
          total={room.timerSeconds}
          label="to talk"
        />
      </header>

      <motion.p
        className="big-message"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        Someone here is lying. <span aria-hidden="true">👀</span>
      </motion.p>
      <p className="t-body">Talk it out. Then point fingers.</p>

      <ClueStack entries={entries} />

      <button
        type="button"
        className="btn btn--primary btn--lg btn--block"
        onClick={() => void safe(backend.advance())}
      >
        SKIP TO VOTE
      </button>
    </div>
  )
}
