import { ArrowLeft, Trophy } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { LeaderboardEntry } from '../backend'
import { Avatar } from '../components/ui/Avatar'
import { Loading } from '../components/ui/Loading'
import { ROLE_META } from '../game/identity'
import { useApp } from '../state/context'

export function LeaderboardScreen({
  onBack,
  onPlay,
}: {
  onBack: () => void
  onPlay: () => void
}) {
  const { backend } = useApp()
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null)

  useEffect(() => {
    void backend.getLeaderboard().then(setEntries)
  }, [backend])

  return (
    <div className="subscreen">
      <button type="button" className="btn btn--ghost btn--sm" onClick={onBack}>
        <ArrowLeft size={18} /> Back
      </button>

      <header className="subscreen__head">
        <h1 className="t-title">Leaderboard</h1>
        <p className="t-body">The spies who stay undercover the longest.</p>
      </header>

      {entries === null ? (
        <Loading label="Checking the spies…" />
      ) : entries.length === 0 ? (
        <div className="empty">
          <span className="empty__glyph" aria-hidden="true">
            🏆
          </span>
          <span className="big-message">NO SPIES YET.</span>
          <p className="t-body">Finish your first game to climb the board.</p>
          <button type="button" className="btn btn--primary" onClick={onPlay}>
            PLAY A GAME
          </button>
        </div>
      ) : (
        <ul className="board-list">
          {entries.map((entry, i) => (
            <li key={entry.userId} className={'board-row' + (entry.isMe ? ' board-row--me' : '')}>
              <span className="board-row__rank">
                {entry.rank <= 3 ? (
                  <span className="board-row__medal" aria-hidden="true">
                    {['🥇', '🥈', '🥉'][entry.rank - 1]}
                  </span>
                ) : (
                  entry.rank
                )}
              </span>
              <Avatar seed={i} name={entry.name} avatarUrl={entry.avatarUrl} size={38} />
              <span className="col grow" style={{ gap: 2 }}>
                <span className="t-section">
                  {entry.name}
                  {entry.isMe && (
                    <span className="board-row__you" style={{ color: ROLE_META.mrwhite.color }}>
                      {' '}
                      (you)
                    </span>
                  )}
                </span>
                <span className="t-muted" style={{ fontSize: '0.82rem' }}>
                  {entry.wins}/{entry.games} wins
                </span>
              </span>
              <span className="board-row__level">{`LV ${entry.level}`}</span>
              <span className="board-row__exp">
                {entry.exp.toLocaleString()}
                <small> XP</small>
              </span>
            </li>
          ))}
        </ul>
      )}

      <span className="board-foot">
        <Trophy size={14} /> 100 XP = 1 level. Mr. White wins pay out big.
      </span>
    </div>
  )
}