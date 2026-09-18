import { MrWhiteGuess } from '../components/game/MrWhiteGuess'
import { PassPhoneScreen } from '../components/game/PassPhoneScreen'
import { GameTimer } from '../components/ui/GameTimer'
import { useApp } from '../state/context'

export function MrWhiteScreen() {
  const { snapshot, backend, safe } = useApp()
  const room = snapshot.room
  const me = snapshot.me
  if (!room || !me) return null
  const guesserId = room.mrWhiteGuessingId
  const guesser = room.players.find((p) => p.id === guesserId)

  if (room.mode === 'passplay' && guesser) {
    return (
      <PassPhoneScreen
        key={`${room.passIndex}-${guesser.id}`}
        variant="action"
        name={guesser.name}
        seed={guesser.avatarSeed}
        avatarUrl={guesser.avatarUrl}
        stage={room.passRevealed ? 'reveal' : 'gate'}
        gateHint="Everyone else, look away. This is the big one."
        revealHint="One shot"
        onProceed={() => void safe(backend.runPassTurn())}
        onHide={() => void safe(backend.runPassTurn())}
      >
        <MrWhiteGuess
          canGuess
          guesserName={guesser.name}
          onSubmit={(word) => void safe(backend.submitMrWhiteGuess(word))}
        />
      </PassPhoneScreen>
    )
  }

  const canGuess = me.playerId === guesserId

  return (
    <div className="mrwhite-screen">
      <div className="mrwhite-screen__timer">
        <GameTimer key={room.deadline ?? 'none'} deadline={room.deadline} total={room.timerSeconds} label="to guess" />
      </div>
      <MrWhiteGuess
        canGuess={canGuess}
        guesserName={guesser?.name ?? 'Mr. White'}
        onSubmit={(word) => void safe(backend.submitMrWhiteGuess(word))}
      />
    </div>
  )
}
