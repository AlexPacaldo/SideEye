import { useEffect, useState } from 'react'
import { EliminationReveal } from '../components/game/EliminationReveal'
import { GameTimer } from '../components/ui/GameTimer'
import { useApp } from '../state/context'

export function EliminationScreen() {
  const { snapshot, backend, safe } = useApp()
  const room = snapshot.room
  const deadline = room?.deadline ?? null
  const total = room?.timerSeconds ?? 4

  const [ready, setReady] = useState(!deadline)
  useEffect(() => {
    if (!deadline) {
      setReady(true)
      return
    }
    const start = Date.now()
    const check = () =>
      setReady(Date.now() - start >= (total ?? 4) * 1000)
    check()
    const handle = window.setTimeout(check, (total ?? 4) * 1000)
    return () => window.clearTimeout(handle)
  }, [deadline, total])

  if (!room) return null
  const last = room.lastEliminated

  const continueButton = (
    <button
      type="button"
      className="btn btn--ghost"
      disabled={!ready}
      onClick={() => void safe(backend.advance())}
    >
      {ready ? 'CONTINUE' : 'Revealing…'} <span aria-hidden="true">{ready ? '→' : ''}</span>
    </button>
  )

  const footer = (
    <div className="row center" style={{ gap: 14, marginTop: 22 }}>
      <GameTimer
        key={deadline ?? 'none'}
        deadline={deadline}
        total={room.timerSeconds}
        size={44}
        label="revealing"
      />
      {continueButton}
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