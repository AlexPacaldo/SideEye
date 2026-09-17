import { motion } from 'framer-motion'
import { Avatar } from '../ui/Avatar'
import { ROLE_META } from '../../game/identity'
import type { PublicPlayer, Role } from '../../game/types'

interface EliminationRevealProps {
  player: PublicPlayer
  role: Role
}

const REACTIONS: Record<Role, string> = {
  civilian: '😬',
  undercover: '🎯',
  mrwhite: '😳',
}

export function EliminationReveal({ player, role }: EliminationRevealProps) {
  const meta = ROLE_META[role]
  return (
    <div className="elimination">
      <motion.div
        initial={{ scale: 0.7, rotate: -8, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
      >
        <Avatar
          seed={player.avatarSeed}
          name={player.name}
          avatarUrl={player.avatarUrl}
          size={104}
          state="eliminated"
        />
      </motion.div>

      <div className="elimination__big">
        {player.name.toUpperCase()} IS OUT!
      </div>

      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.25, type: 'spring', stiffness: 300, damping: 20 }}
        className="col center"
        style={{ gap: 8 }}
      >
        <span className="t-eyebrow">They were…</span>
        <span
          className="badge"
          style={{
            background: meta.soft,
            color: meta.color,
            borderColor: 'transparent',
            fontSize: '0.95rem',
            padding: '10px 22px',
            letterSpacing: '0.12em',
          }}
        >
          <span aria-hidden="true">{meta.glyph}</span>
          {meta.short}
        </span>
        <span className="reaction">{REACTIONS[role]}</span>
      </motion.div>
    </div>
  )
}
