import { motion } from 'framer-motion'
import { Avatar } from '../ui/Avatar'
import type { PublicPlayer } from '../../game/types'

interface SuspicionCardProps {
  player: PublicPlayer
  clue?: string
  selected?: boolean
  disabled?: boolean
  isMe?: boolean
  talking?: boolean
  onClick?: () => void
  index?: number
}

export function SuspicionCard({
  player,
  clue,
  selected = false,
  disabled = false,
  isMe = false,
  talking = false,
  onClick,
  index = 0,
}: SuspicionCardProps) {
  return (
    <motion.button
      type="button"
      className={[
        'suspicion-card',
        selected ? 'suspicion-card--selected' : '',
        isMe ? 'suspicion-card--me' : '',
        talking ? 'suspicion-card--talking' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onClick}
      disabled={disabled || isMe}
      aria-pressed={selected}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, type: 'spring', stiffness: 300, damping: 24 }}
      whileTap={disabled || isMe ? undefined : { scale: 0.96 }}
    >
      <Avatar
        seed={player.avatarSeed}
        name={player.name}
        avatarUrl={player.avatarUrl}
        size={62}
        state={selected ? 'submitted' : 'default'}
        host={player.isHost}
        talking={talking}
      />
      <span className="suspicion-card__name">{player.name}</span>
      {clue && <span className="suspicion-card__clue">{clue}</span>}
    </motion.button>
  )
}
