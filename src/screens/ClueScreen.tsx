import { AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import { ClueInput } from '../components/game/ClueInput'
import { PassPhoneScreen } from '../components/game/PassPhoneScreen'
import { RoundTransition } from '../components/game/RoundTransition'
import { SecretWord } from '../components/game/SecretWord'
import { Avatar } from '../components/ui/Avatar'
import { GameTimer } from '../components/ui/GameTimer'
import { Loading } from '../components/ui/Loading'
import { useApp } from '../state/context'
import type { PublicPlayer } from '../game/types'

export function ClueScreen() {
  const { snapshot } = useApp()
  const room = snapshot.room!
  const [showRound, setShowRound] = useState(room.round > 1)

  if (room.mode === 'passplay') {
    return <PassPlayClue />
  }

  return (
    <>
      <AnimatePresence>
        {showRound && (
          <RoundTransition round={room.round} onDone={() => setShowRound(false)} />
        )}
      </AnimatePresence>
      {!showRound && <OnlineClue />}
    </>
  )
}

function OnlineClue() {
  const { snapshot, backend, safe } = useApp()
  const room = snapshot.room!
  const me = snapshot.me!
  const self = room.players.find((p) => p.id === me.playerId)
  const submitted = room.submittedIds.includes(me.playerId)
  const alive = room.players.filter((p) => !room.eliminatedIds.includes(p.id))

  if (!self) return <Loading label="Joining the round…" />

  return (
    <div className="clue-screen">
      <header className="phase-head">
        <div className="col" style={{ gap: 2 }}>
          <span className="t-eyebrow">Round {room.round}</span>
          <h1 className="t-title">DROP YOUR CLUE</h1>
        </div>
        <GameTimer deadline={room.deadline} total={room.timerSeconds} />
      </header>

      <div className="clue-screen__word">
        <SecretWord word={me.secret?.word ?? null} />
        <p className="t-body clue-screen__prompt">
          Give us something… but don&apos;t give it away.
        </p>
      </div>

      <ClueInput
        locked={submitted}
        lockedLabel="CLUE LOCKED 🔒"
        onSubmit={(text) => void safe(backend.submitClue(text))}
      />

      {submitted && (
        <p className="t-muted text-center" style={{ fontSize: '0.9rem' }}>
          Let&apos;s see what everyone else says.
        </p>
      )}

      <PlayerStatus
        players={alive}
        doneIds={room.submittedIds}
        meId={me.playerId}
      />
    </div>
  )
}

function PassPlayClue() {
  const { snapshot, backend, safe } = useApp()
  const room = snapshot.room!
  const me = snapshot.me!
  const current = room.players.find((p) => p.id === me.playerId)

  if (!current) return <Loading label="Next clue…" />

  return (
    <PassPhoneScreen
      key={`${room.passIndex}-${current.id}`}
      variant="action"
      name={current.name}
      seed={current.avatarSeed}
      avatarUrl={current.avatarUrl}
      stage={room.passRevealed ? 'reveal' : 'gate'}
      gateHint="Hand it over. Only the clue-giver looks."
      revealHint="Your turn"
      onProceed={() => void safe(backend.runPassTurn())}
      onHide={() => void safe(backend.runPassTurn())}
    >
      {me.secret && (
        <div className="col" style={{ gap: 16, width: '100%' }}>
          <SecretWord word={me.secret.word} />
          <ClueInput onSubmit={(text) => void safe(backend.submitClue(text))} />
        </div>
      )}
    </PassPhoneScreen>
  )
}

function PlayerStatus({
  players,
  doneIds,
  meId,
}: {
  players: PublicPlayer[]
  doneIds: string[]
  meId: string
}) {
  return (
    <div className="clue-status">
      <span className="t-eyebrow">Clues in</span>
      <div className="clue-status__grid">
        {players.map((p) => {
          const done = doneIds.includes(p.id)
          return (
            <div
              key={p.id}
              className={'clue-status__row ' + (done ? 'is-done' : '')}
            >
              <Avatar seed={p.avatarSeed} name={p.name} size={28} />
              <span className="clue-status__name">
                {p.name}
                {p.id === meId ? ' (you)' : ''}
              </span>
              {done ? (
                <span className="status-check">✓</span>
              ) : (
                <span className="status-dots" aria-label="waiting">
                  <span />
                  <span />
                  <span />
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
