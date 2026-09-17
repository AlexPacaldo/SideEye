import { useMemo } from 'react'
import { VoteReveal } from '../components/game/VoteReveal'
import { useApp } from '../state/context'

export function VoteRevealScreen() {
  const { snapshot, backend, safe } = useApp()
  const room = snapshot.room!

  const { eliminatedId, tie } = useMemo(() => {
    const tally = room.tally ?? []
    const restriction = room.runoffIds ?? undefined
    const entries = restriction
      ? tally.filter((t) => restriction.includes(t.playerId))
      : tally
    const max = entries.reduce((m, e) => Math.max(m, e.count), 0)
    const leaders =
      max > 0 ? entries.filter((e) => e.count === max).map((e) => e.playerId) : []
    return {
      eliminatedId: leaders.length === 1 ? leaders[0] : null,
      tie: leaders.length > 1,
    }
  }, [room.tally, room.runoffIds])

  return (
    <div className="reveal-screen">
      <VoteReveal
        tally={room.tally ?? []}
        players={room.players}
        runoff={room.phase === 'voteReveal' && room.runoffIds != null}
        eliminatedId={eliminatedId}
        tie={tie}
        onDone={() => void safe(backend.advance())}
      />
    </div>
  )
}
