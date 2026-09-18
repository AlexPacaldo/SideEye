import { motion } from 'framer-motion'
import { Lock } from 'lucide-react'
import { useMemo, useState } from 'react'
import { VoteTarget } from '../components/game/VoteTarget'
import { Avatar } from '../components/ui/Avatar'
import { GameTimer } from '../components/ui/GameTimer'
import { Loading } from '../components/ui/Loading'
import { useApp } from '../state/context'
import type { PublicPlayer, RoomSnapshot } from '../game/types'

function candidatesFor(room: RoomSnapshot, voterId: string): PublicPlayer[] {
  const alive = room.players.filter((p) => !room.eliminatedIds.includes(p.id))
  const pool =
    room.phase === 'runoff' && room.runoffIds
      ? alive.filter((p) => room.runoffIds!.includes(p.id))
      : alive
  return pool.filter((p) => p.id !== voterId)
}

function clueMap(room: RoomSnapshot): Map<string, string> {
  const map = new Map<string, string>()
  room.clues
    .filter((c) => c.round === room.round)
    .forEach((c) => map.set(c.playerId, c.text))
  return map
}

export function VotingScreen() {
  const { snapshot } = useApp()
  const room = snapshot.room
  if (!room) return null

  if (room.mode === 'passplay') return <VotingPassPlay />

  return <VotingOnline />
}

function VotingOnline() {
  const { snapshot, backend, safe } = useApp()
  const room = snapshot.room!
  const me = snapshot.me!
  const voted = room.submittedIds.includes(me.playerId)
  const [selected, setSelected] = useState<string | null>(null)
  const candidates = useMemo(() => candidatesFor(room, me.playerId), [room, me.playerId])
  const clues = useMemo(() => clueMap(room), [room])
  const alive = room.players.filter((p) => !room.eliminatedIds.includes(p.id))

  return (
    <div className="voting-screen">
      <header className="phase-head">
        <div className="col" style={{ gap: 2 }}>
          <span className="t-eyebrow">
            {room.phase === 'runoff' ? 'Runoff vote' : `Round ${room.round}`}
          </span>
          <h1 className="t-title">
            {room.phase === 'runoff' ? "RUN IT BACK." : "WHO'S ACTING SUS?"}
          </h1>
        </div>
        <GameTimer deadline={room.deadline} total={room.timerSeconds} />
      </header>

      {room.phase === 'runoff' && (
        <p className="t-body">
          No clear answer. Vote again — and&nbsp;this time, mean it.
        </p>
      )}

      {voted ? (
        <div className="col center" style={{ gap: 14, padding: '30px 0' }}>
          <span className="big-message">
            VOTE LOCKED. <span aria-hidden="true">👀</span>
          </span>
          <p className="t-body">No take-backs. Waiting on the rest…</p>
        </div>
      ) : (
        <>
          <VoteTarget
            players={candidates}
            clues={clues}
            selected={selected}
            onSelect={setSelected}
            meId={me.playerId}
          />
          <ConfirmBar
            selected={selected}
            players={room.players}
            onCancel={() => setSelected(null)}
            onConfirm={() => {
              if (selected) void safe(backend.castVote(selected))
            }}
          />
        </>
      )}

      <VoterStatus players={alive} doneIds={room.submittedIds} meId={me.playerId} />
    </div>
  )
}

function VotingPassPlay() {
  const { snapshot, backend, safe } = useApp()
  const room = snapshot.room!
  const me = snapshot.me!
  const current = room.players.find((p) => p.id === me.playerId)
  const [selected, setSelected] = useState<string | null>(null)
  const candidates = useMemo(() => candidatesFor(room, me.playerId), [room, me.playerId])
  const clues = useMemo(() => clueMap(room), [room])
  const total = room.passOrder.length
  const done = room.submittedIds.length
  const alive = room.players.filter((p) => !room.eliminatedIds.includes(p.id))

  if (!current) return <Loading label="Next vote…" />

  return (
    <div className="voting-screen">
      <header className="phase-head">
        <div className="col" style={{ gap: 2 }}>
          <span className="t-eyebrow">
            {room.phase === 'runoff' ? 'Runoff vote' : `Round ${room.round}`}
          </span>
          <h1 className="t-title">
            {room.phase === 'runoff' ? 'RUN IT BACK.' : "WHO'S ACTING SUS?"}
          </h1>
        </div>
        <span className="vote-count">
          {done >= total ? 'ALL IN' : `VOTE ${done + 1} / ${total}`}
        </span>
      </header>

      {room.phase === 'runoff' && (
        <p className="t-body">
          No clear answer. Vote again — and&nbsp;this time, mean it.
        </p>
      )}

      {done >= total ? (
        <div className="col center" style={{ gap: 14, padding: '30px 0' }}>
          <span className="big-message">
            ALL VOTES IN. <span aria-hidden="true">👀</span>
          </span>
          <p className="t-body">Counting…</p>
        </div>
      ) : (
        <>
          <p className="t-body">Agree in person, then tap a name.</p>
          <VoteTarget
            players={candidates}
            clues={clues}
            selected={selected}
            onSelect={setSelected}
            meId={me.playerId}
          />
          <button
            type="button"
            className="btn btn--primary btn--lg btn--block"
            disabled={!selected}
            onClick={() => {
              if (selected) void safe(backend.castVote(selected))
              setSelected(null)
            }}
          >
            <Lock size={18} /> LOCK IT IN
          </button>
        </>
      )}

      <VoterStatus players={alive} doneIds={room.submittedIds} meId={me.playerId} />
    </div>
  )
}

function ConfirmBar({
  selected,
  players,
  onCancel,
  onConfirm,
}: {
  selected: string | null
  players: PublicPlayer[]
  onCancel: () => void
  onConfirm: () => void
}) {
  const name = players.find((p) => p.id === selected)?.name
  return (
    <motion.div
      className="confirm-bar"
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
    >
      {selected ? (
        <div className="confirm-bar__inner">
          <span className="confirm-bar__text">
            VOTE FOR <strong>{name?.toUpperCase()}</strong>?
          </span>
          <div className="row" style={{ gap: 10 }}>
            <button type="button" className="btn btn--ghost" onClick={onCancel}>
              CANCEL
            </button>
            <button type="button" className="btn btn--primary" onClick={onConfirm}>
              LOCK IN
            </button>
          </div>
        </div>
      ) : (
        <span className="confirm-bar__hint">Tap a player to accuse them</span>
      )}
    </motion.div>
  )
}

function VoterStatus({
  players,
  doneIds,
  meId,
}: {
  players: PublicPlayer[]
  doneIds: string[]
  meId: string
}) {
  return (
    <div className="clue-status">
      <span className="t-eyebrow">Votes in</span>
      <div className="clue-status__grid">
        {players.map((p) => {
          const done = doneIds.includes(p.id)
          return (
            <div key={p.id} className={'clue-status__row ' + (done ? 'is-done' : '')}>
              <Avatar seed={p.avatarSeed} name={p.name} size={28} />
              <span className="clue-status__name">
                {p.name}
                {p.id === meId ? ' (you)' : ''}
              </span>
              {done ? (
                <span className="status-check">✓</span>
              ) : (
                <span className="status-dots" aria-label="waiting">
                  <span />
                  <span />
                  <span />
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
