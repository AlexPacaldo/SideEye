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

  if (room.mode === 'passplay') {
    const order = room.passOrder
    return (
      <div className="discussion-screen">
        <header className="phase-head">
          <div className="col" style={{ gap: 2 }}>
            <span className="t-eyebrow">Round {room.round}</span>
            <h1 className="t-title">SAY IT IN ORDER.</h1>
          </div>
        </header>

        <motion.p
          className="big-message"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          Someone here is lying. <span aria-hidden="true">👀</span>
        </motion.p>
        <p className="t-body">
          Take turns saying your clue out loud, in this order.
        </p>

        <ol className="talk-order">
          {order.map((id, i) => {
            const player = room.players.find((p) => p.id === id)
            return (
              <li key={id} className="talk-order__item">
                <span className="talk-order__num">{i + 1}</span>
                {player?.name ?? 'Player'}
              </li>
            )
          })}
        </ol>

        <button
          type="button"
          className="btn btn--primary btn--lg btn--block"
          onClick={() => void safe(backend.advance())}
        >
          READY FOR VOTES
        </button>
      </div>
    )
  }

  return (
    <div className="discussion-screen">
      <header className="phase-head">
        <div className="col" style={{ gap: 2 }}>
          <span className="t-eyebrow">Round {room.round}</span>
          <h1 className="t-title">LOOK AROUND.</h1>
        </div>
        <GameTimer
          key={room.deadline ?? 'none'}
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
