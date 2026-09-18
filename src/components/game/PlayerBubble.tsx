import { Avatar, type AvatarState } from '../ui/Avatar'
import type { PublicPlayer } from '../../game/types'

interface PlayerBubbleProps {
  player: PublicPlayer
  isSelf?: boolean
  isTurn?: boolean
  submitted?: boolean
  eliminated?: boolean
  talking?: boolean
  status?: string
  size?: number
  onClick?: () => void
  selected?: boolean
  disabled?: boolean
  showReady?: boolean
}

export function PlayerBubble({
  player,
  isSelf = false,
  isTurn = false,
  submitted = false,
  eliminated = false,
  talking = false,
  status,
  size = 64,
  onClick,
  selected = false,
  disabled = false,
  showReady = true,
}: PlayerBubbleProps) {
  const state: AvatarState = eliminated
    ? 'eliminated'
    : !player.connected
      ? 'disconnected'
      : isTurn
        ? 'turn'
        : submitted
          ? 'submitted'
          : player.ready && showReady
            ? 'ready'
            : 'default'

  const label = talking
    ? 'talking'
    : (status ??
      (eliminated
        ? 'out'
        : !player.connected
          ? 'away'
          : isTurn
            ? 'your turn'
            : submitted
              ? 'locked'
              : player.ready && showReady
                ? 'ready'
                : 'not ready'))

  const className = [
    'player-bubble',
    isSelf ? 'player-bubble--self' : '',
    isTurn ? 'player-bubble--turn' : '',
    talking ? 'player-bubble--talking' : '',
    player.ready && showReady && !isTurn && !eliminated ? 'player-bubble--ready' : '',
    eliminated ? 'player-bubble--eliminated' : '',
    onClick ? 'player-bubble--clickable' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const inner = (
    <>
      <Avatar
        seed={player.avatarSeed}
        name={player.name}
        avatarUrl={player.avatarUrl}
        size={size}
        state={state}
        host={player.isHost}
        talking={talking}
      />
      <span className="player-bubble__name">{player.name}</span>
      <span className="player-bubble__status">{label}</span>
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        onClick={onClick}
        disabled={disabled}
        aria-pressed={selected}
        style={{ background: 'none', border: 'none', padding: 0 }}
      >
        {inner}
      </button>
    )
  }

  return <div className={className}>{inner}</div>
}
