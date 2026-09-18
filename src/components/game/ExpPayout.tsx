import { useEffect, useState } from 'react'
import type { LeaderboardEntry, PlayerStats } from '../../backend'
import { breakdownExp, levelInfo, EXP_PER_LEVEL } from '../../game/exp'
import { useApp } from '../../state/context'

export function ExpPayout() {
  const { snapshot, backend } = useApp()
  const room = snapshot.room
  const [board, setBoard] = useState<LeaderboardEntry[] | null>(null)
  const [me, setMe] = useState<PlayerStats | null>(null)

  useEffect(() => {
    let active = true
    void backend.getLeaderboard().then((b) => {
      if (active) setBoard(b.slice(0, 5))
    })
    void backend.getMyStats().then((s) => {
      if (active) setMe(s)
    })
    return () => {
      active = false
    }
  }, [backend])

  if (!room || !room.winner || !room.reveal) return null
  const meId = snapshot.me?.playerId
  const myReveal = meId ? room.reveal.find((r) => r.playerId === meId) : undefined
  if (!myReveal) return null

  const survived = myReveal.eliminatedRound == null
  const breakdown = breakdownExp(room.winner, myReveal.role, survived, room.round)
  const level = me?.level ?? levelInfo(me?.exp ?? 0).level
  const intoLevel = me?.intoLevel ?? me?.exp ?? 0

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
        <span className="t-eyebrow">Top spies</span>
        {board === null ? (
          <span className="t-muted" style={{ fontSize: '0.8rem' }}>
            Loading…
          </span>
        ) : board.length === 0 ? (
          <span className="t-muted" style={{ fontSize: '0.8rem' }}>
            No one on the board yet.
          </span>
        ) : (
          <ul className="board-mini__list">
            {board.map((e) => (
              <li key={e.userId} className={e.isMe ? 'board-mini__row--me' : ''}>
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