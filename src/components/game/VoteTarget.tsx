import type { PublicPlayer } from '../../game/types'
import { SuspicionCard } from './SuspicionCard'

interface VoteTargetProps {
  players: PublicPlayer[]
  clues: Map<string, string>
  selected: string | null
  onSelect: (id: string) => void
  meId: string
  disabled?: boolean
  talking?: Record<string, boolean>
}

export function VoteTarget({
  players,
  clues,
  selected,
  onSelect,
  meId,
  disabled = false,
  talking,
}: VoteTargetProps) {
  return (
    <div className="suspicion-grid" role="radiogroup" aria-label="Choose who to vote out">
      {players.map((player, i) => (
        <SuspicionCard
          key={player.id}
          player={player}
          clue={clues.get(player.id)}
          selected={selected === player.id}
          isMe={player.id === meId}
          disabled={disabled}
          talking={talking?.[player.id]}
          onClick={() => onSelect(player.id)}
          index={i}
        />
      ))}
    </div>
  )
}
