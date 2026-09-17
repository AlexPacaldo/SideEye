import { ClueReveal } from '../components/game/ClueReveal'
import { buildClueEntries } from '../game/entries'
import { useApp } from '../state/context'

export function ClueRevealScreen() {
  const { snapshot, backend, safe } = useApp()
  const room = snapshot.room!
  const me = snapshot.me!
  const entries = buildClueEntries(room, me.playerId)

  return (
    <div className="reveal-screen">
      <header className="phase-head">
        <div className="col" style={{ gap: 2 }}>
          <span className="t-eyebrow">Round {room.round}</span>
          <h1 className="t-title">THE CLUES ARE IN</h1>
        </div>
      </header>
      <p className="t-body">Every word, in order. Read them carefully.</p>
      <ClueReveal entries={entries} onDone={() => void safe(backend.advance())} />
    </div>
  )
}
