import { AnimatePresence, motion } from 'framer-motion'
import { Eye } from 'lucide-react'
import { PassPhoneScreen } from '../components/game/PassPhoneScreen'
import { RoleRevealCard } from '../components/game/RoleRevealCard'
import { Avatar } from '../components/ui/Avatar'
import { Loading } from '../components/ui/Loading'
import { useApp } from '../state/context'
import type { PublicPlayer } from '../game/types'

export function RoleRevealScreen() {
  const { snapshot, backend, safe } = useApp()
  const room = snapshot.room!
  const me = snapshot.me!

  if (room.mode === 'passplay') {
    return <PassPlayRoleReveal />
  }

  const self = room.players.find((p) => p.id === me.playerId)
  const secret = me.secret
  const seen = room.submittedIds

  return (
    <div className="role-screen">
      <header className="role-screen__head">
        <span className="t-eyebrow">Round {room.round}</span>
        <h1 className="t-title">Your word is…</h1>
        <p className="t-body">Keep it to yourself. Seriously.</p>
      </header>

      {secret ? (
        <>
          <RoleRevealCard
            role={secret.role}
            word={secret.word}
            revealed={true}
          />
          <div className="role-screen__actions">
            <button
              type="button"
              className="btn btn--primary btn--lg btn--block"
              onClick={() => void safe(backend.acknowledgeRole())}
            >
              {seen.includes(me.playerId) ? 'STILL WAITING…' : "GOT IT — I'M READY"}
            </button>
          </div>
        </>
      ) : (
        <Loading
          label="Dealing the cards…"
          hint={self ? 'Your role appears the moment it\u2019s your turn.' : undefined}
        />
      )}

      <SeenRow players={room.players} seen={seen} />
    </div>
  )
}

function PassPlayRoleReveal() {
  const { snapshot, backend, safe } = useApp()
  const room = snapshot.room
  const me = snapshot.me
  if (!room || !me) return null

  const current = room.players.find((p) => p.id === me.playerId)
  if (!current) {
    return <Loading label="Shuffling the roles…" />
  }

  return (
    <PassPhoneScreen
      key={`${room.passIndex}-${current.id}`}
      name={current.name}
      seed={current.avatarSeed}
      avatarUrl={current.avatarUrl}
      stage={room.passRevealed ? 'reveal' : 'gate'}
      gateHint="No peeking. Everyone else, look away."
      revealHint="Ready? Hold the button."
      onProceed={() => void safe(backend.runPassTurn())}
      onHide={() => void safe(backend.runPassTurn())}
    >
      {me.secret && (
        <RoleRevealCard
          role={me.secret.role}
          word={me.secret.word}
          revealed
        />
      )}
    </PassPhoneScreen>
  )
}

function SeenRow({ players, seen }: { players: PublicPlayer[]; seen: string[] }) {
  return (
    <div className="seen-row">
      <AnimatePresence initial={false}>
        {players.map((p) => {
          const done = seen.includes(p.id)
          return (
            <motion.span
              key={p.id}
              className="seen-row__item"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: done ? 1 : 0.45, y: 0 }}
            >
              <Avatar seed={p.avatarSeed} name={p.name} size={26} />
              <span>{p.name}</span>
              {done ? <span className="status-check">✓</span> : <Eye size={15} />}
            </motion.span>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
