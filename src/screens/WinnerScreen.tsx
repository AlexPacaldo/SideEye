import { WinnerReveal } from '../components/game/WinnerReveal'
import { useApp } from '../state/context'

export function WinnerScreen() {
  const { snapshot, backend, safe } = useApp()
  const room = snapshot.room

  if (!room || !room.winner || !room.reveal) return null

  return (
    <div className="reveal-screen">
      <WinnerReveal
        winner={room.winner}
        reveal={room.reveal}
        players={room.players}
        mrWhiteGuessCorrect={room.mrWhiteGuessCorrect}
        onReplay={() => void safe(backend.replay())}
        onLobby={() => void safe(backend.returnToLobby())}
        onLeave={() => void safe(backend.leaveRoom())}
      />
    </div>
  )
}
