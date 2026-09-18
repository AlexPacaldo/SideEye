import { EliminationReveal } from '../components/game/EliminationReveal'
import { useApp } from '../state/context'

export function EliminationScreen() {
  const { snapshot, backend, safe } = useApp()
  const room = snapshot.room

  if (!room) return null
  const last = room.lastEliminated

  const footer = (
    <div className="row center" style={{ gap: 14, marginTop: 22 }}>
      <button
        type="button"
        className="btn btn--ghost"
        onClick={() => void safe(backend.advance())}
      >
        CONTINUE <span aria-hidden="true">→</span>
      </button>
    </div>
  )

  if (!last) {
    return (
      <div className="elimination">
        <span className="reaction reaction--float" aria-hidden="true">
          🤷
        </span>
        <span className="big-message">NOBODY&apos;S LEAVING.</span>
        <p className="t-body">
          The room couldn&apos;t decide. One more round of clues.
        </p>
        {footer}
      </div>
    )
  }

  const player = room.players.find((p) => p.id === last.playerId)
  if (!player) return null

  return (
    <div className="reveal-screen">
      <EliminationReveal player={player} role={last.role} />
      {last.role === 'mrwhite' && (
        <p className="t-body text-center" style={{ marginTop: 20 }}>
          But wait…
        </p>
      )}
      {footer}
    </div>
  )
}
