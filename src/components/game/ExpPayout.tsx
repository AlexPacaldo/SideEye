import { useEffect, useState } from 'react'
import type { LeaderboardEntry } from '../../backend'
import { breakdownExp, levelInfo, EXP_PER_LEVEL } from '../../game/exp'
import { useApp } from '../../state/context'

export function ExpPayout() {
  const { snapshot, backend } = useApp()
  const room = snapshot.room
  const [board, setBoard] = useState<LeaderboardEntry[] | null>(null)

  useEffect(() => {
    let active = true
    void backend.getPartyLeaderboard().then((b) => {
      if (active) setBoard(b)
    })
    return () => {
      active = false
    }
  }, [backend])

  if (!room || !room.winner || !room.reveal) return null
  const meId = room.mode === 'passplay' ? room.hostId : snapshot.me?.playerId
  const myReveal = meId ? room.reveal.find((r) => r.playerId === meId) : undefined
  if (!myReveal) return null

  const survived = myReveal.eliminatedRound == null
  const breakdown = breakdownExp(room.winner, myReveal.role, survived, room.round)
  const me = board?.find((e) => e.isMe) ?? null
  const top = board ? board.slice(0, 5) : null
  const level = me?.level ?? levelInfo(0).level
  const intoLevel = me?.intoLevel ?? 0

  const rows: Array<{ label: string; value: number }> = [
    { label: 'Finished the game', value: breakdown.play },
    { label: 'Win bonus', value: breakdown.win },
    { label: 'Survived', value: breakdown.survivor },
    { label: 'Rounds bonus', value: breakdown.rounds },
  ]

  return (
    <div className="exp-card">
      <div className="exp-card__head">
        <div className="col" style={{ gap: 2, alignItems: 'flex-start' }}>
          <span className="t-eyebrow" style={{ color: 'var(--accent-2)' }}>
            Level {level}
          </span>
          <span className="exp-card__total">+{breakdown.total} EXP</span>
        </div>
        <div
          className="exp-card__bar"
          role="progressbar"
          aria-label={`Level ${level} progress`}
          aria-valuenow={intoLevel}
          aria-valuemin={0}
          aria-valuemax={EXP_PER_LEVEL}
        >
          <span style={{ width: `${Math.min(100, (intoLevel / EXP_PER_LEVEL) * 100)}%` }} />
        </div>
      </div>

      <ul className="exp-card__rows">
        {rows.map((r) => (
          <li key={r.label}>
            <span>{r.label}</span>
            <b>{r.value > 0 ? `+${r.value}` : '—'}</b>
          </li>
        ))}
      </ul>

      <div className="board-mini">
        <span className="t-eyebrow">Party leaderboard</span>
        {top === null ? (
          <span className="t-muted" style={{ fontSize: '0.8rem' }}>
            Loading…
          </span>
        ) : top.length === 0 ? (
          <span className="t-muted" style={{ fontSize: '0.8rem' }}>
            No one on the board yet.
          </span>
        ) : (
          <ul className="board-mini__list">
            {top.map((e) => (
              <li key={e.playerId} className={e.isMe ? 'board-mini__row--me' : ''}>
                <span className="board-mini__rank">{e.rank}</span>
                <span className="board-mini__name">
                  {e.name}
                  {e.isMe ? ' (you)' : ''}
                </span>
                <span className="board-mini__xp">{e.exp.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
        {me && me.games > 0 && (
          <span className="board-mini__me">
            Your rank: <b>#{me.rank}</b> · {me.exp.toLocaleString()} XP · {me.wins}/{me.games} wins
          </span>
        )}
      </div>
    </div>
  )
}