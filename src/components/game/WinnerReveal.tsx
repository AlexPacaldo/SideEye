import { motion } from 'framer-motion'
import { Avatar } from '../ui/Avatar'
import { ROLE_META } from '../../game/identity'
import { useConfetti } from '../../hooks/useConfetti'
import { ExpPayout } from './ExpPayout'
import type { CastReveal, PublicPlayer, Winner } from '../../game/types'

interface WinnerRevealProps {
  winner: Winner
  reveal: CastReveal[]
  players: PublicPlayer[]
  mrWhiteGuessCorrect?: boolean | null
  onReplay: () => void
  onLobby: () => void
  onLeave: () => void
}

const COPY: Record<Winner, { title: string; sub: string; emoji: string }> = {
  civilians: {
    title: 'CIVILIANS WIN!',
    sub: 'You caught them all.',
    emoji: '🎉',
  },
  undercover: {
    title: 'UNDERCOVER WINS!',
    sub: 'Blended in. Got away with it.',
    emoji: '🕶️',
  },
  mrwhite: {
    title: 'MR. WHITE WINS!',
    sub: 'No word needed. Just vibes.',
    emoji: '🃏',
  },
}

export function WinnerReveal({
  winner,
  reveal,
  players,
  mrWhiteGuessCorrect,
  onReplay,
  onLobby,
  onLeave,
}: WinnerRevealProps) {
  useConfetti(true)
  const copy = COPY[winner]

  const findPlayer = (id: string) => players.find((p) => p.id === id)

  return (
    <div className="winner">
      <motion.span
        className="reaction reaction--float"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 14 }}
        aria-hidden="true"
      >
        {copy.emoji}
      </motion.span>

      <motion.h1
        className="winner__title"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 240, damping: 18 }}
      >
        {copy.title}
      </motion.h1>

      <p className="t-body" style={{ fontSize: '1.05rem' }}>
        {copy.sub}
      </p>

      {mrWhiteGuessCorrect != null && (
        <span className="badge" style={{ background: 'var(--surface-2)' }}>
          Mr. White {mrWhiteGuessCorrect ? 'guessed it right' : 'guessed wrong'}
        </span>
      )}

      <ExpPayout />

      <div className="col" style={{ gap: 10, width: '100%', marginTop: 8 }}>
        <span className="t-eyebrow">The cast</span>
        <div className="winner__cast">
          {reveal.map((entry, i) => {
            const player = findPlayer(entry.playerId)
            const meta = ROLE_META[entry.role]
            return (
              <motion.div
                key={entry.playerId}
                className={`cast-card ${
                  entry.eliminatedRound != null ? 'cast-card--eliminated' : ''
                }`}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.06 }}
              >
                <Avatar
                  seed={player?.avatarSeed ?? i}
                  name={player?.name ?? 'Player'}
                  avatarUrl={player?.avatarUrl}
                  size={44}
                  state={entry.eliminatedRound != null ? 'eliminated' : 'default'}
                />
                <span className="cast-card__meta">
                  <span className="cast-card__name">
                    {player?.name ?? 'Player'}
                  </span>
                  <span className="cast-card__role" style={{ color: meta.color }}>
                    {meta.short}
                  </span>
                  <span className="cast-card__word">
                    {entry.word ? `“${entry.word}”` : 'No word'}
                  </span>
                </span>
              </motion.div>
            )
          })}
        </div>
      </div>

      <div className="col" style={{ gap: 10, width: 'min(420px, 100%)', marginTop: 12 }}>
        <button type="button" className="btn btn--primary btn--lg btn--block" onClick={onReplay}>
          RUN IT BACK
        </button>
        <div className="row" style={{ gap: 10 }}>
          <button type="button" className="btn btn--soft grow" onClick={onLobby}>
            BACK TO PARTY
          </button>
          <button type="button" className="btn btn--ghost grow" onClick={onLeave}>
            LEAVE
          </button>
        </div>
      </div>
    </div>
  )
}
