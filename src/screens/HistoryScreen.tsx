import { ArrowLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { GameRecord } from '../backend'
import { Loading } from '../components/ui/Loading'
import { ROLE_META } from '../game/identity'
import type { Role } from '../game/types'
import { useApp } from '../state/context'

const WINNER_LABEL: Record<string, string> = {
  civilians: 'Civilians won',
  infiltrators: 'Infiltrators won',
  mr_white: 'Mr. White won',
  undercover: 'Infiltrators won',
  mrwhite: 'Mr. White won',
}

export function HistoryScreen({ onBack, onPlay }: { onBack: () => void; onPlay: () => void }) {
  const { backend } = useApp()
  const [records, setRecords] = useState<GameRecord[] | null>(null)

  useEffect(() => {
    void backend.getHistory().then(setRecords)
  }, [backend])

  return (
    <div className="subscreen">
      <button type="button" className="btn btn--ghost btn--sm" onClick={onBack}>
        <ArrowLeft size={18} /> Back
      </button>

      <header className="subscreen__head">
        <h1 className="t-title">Game history</h1>
        <p className="t-body">Every betrayal, neatly filed.</p>
      </header>

      {records === null ? (
        <Loading label="Digging up the past…" />
      ) : records.length === 0 ? (
        <div className="empty">
          <span className="empty__glyph" aria-hidden="true">
            🗂️
          </span>
          <span className="big-message">NO DRAMA YET.</span>
          <p className="t-body">Your games will show up here.</p>
          <button type="button" className="btn btn--primary" onClick={onPlay}>
            PLAY A GAME
          </button>
        </div>
      ) : (
        <ul className="history-list">
          {records.map((record) => {
            const meta = ROLE_META[(record.yourRole as Role) ?? 'civilian']
            const date = new Date(record.playedAt)
            return (
              <li key={record.id} className="history-row">
                <span
                  className="history-row__badge"
                  style={{ background: meta.soft, color: meta.color }}
                >
                  {meta.glyph}
                </span>
                <span className="col grow" style={{ gap: 2 }}>
                  <span className="t-section">
                    {WINNER_LABEL[record.winner] ?? 'Game over'}
                  </span>
                  <span className="t-muted" style={{ fontSize: '0.82rem' }}>
                    {record.rounds} rounds · you were {meta.label} · {record.code}
                  </span>
                </span>
                <span className="t-muted" style={{ fontSize: '0.78rem' }}>
                  {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
