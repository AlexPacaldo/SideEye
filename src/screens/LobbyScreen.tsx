import { motion } from 'framer-motion'
import { Settings2, Play, Clock } from 'lucide-react'
import { useState } from 'react'
import { PartyInvite } from '../components/game/PartyInvite'
import { PlayerBubble } from '../components/game/PlayerBubble'
import { Decor } from '../components/ui/Decor'
import { Modal } from '../components/ui/Modal'
import { useApp } from '../state/context'

export function LobbyScreen() {
  const { snapshot, backend, safe } = useApp()
  const me = snapshot.me
  const [settingsOpen, setSettingsOpen] = useState(false)
  const room = snapshot.room
  if (!room) return null

  const isHost = room.hostId === me?.playerId
  const humans = room.players.filter((p) => !p.isBot)
  const readyCount = room.players.filter((p) => p.ready || p.isBot).length
  const allReady = room.players.every((p) => p.ready || p.isBot)
  const waitingOn = room.players.filter((p) => !p.ready && !p.isBot)

  return (
    <div className="lobby">
      <Decor variant="lobby" />

      <header className="lobby__head">
        <div className="col" style={{ gap: 2 }}>
          <span className="t-eyebrow">The party</span>
          <h1 className="t-title">
            {room.players.length} in the room
          </h1>
        </div>
        {isHost && (
          <button
            type="button"
            className="btn btn--soft btn--icon"
            onClick={() => setSettingsOpen(true)}
            aria-label="Party settings"
          >
            <Settings2 size={20} />
          </button>
        )}
      </header>

      {room.mode !== 'passplay' && <PartyInvite code={room.code} />}

      <div className="lobby__cluster-wrap">
        <div className="lobby__cluster">
          {room.players.map((player, i) => (
            <motion.div
              key={player.id}
              layout
              initial={{ opacity: 0, scale: 0.6, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{
                type: 'spring',
                stiffness: 300,
                damping: 22,
                delay: i * 0.04,
              }}
              className={
                'lobby__seat ' +
                (i % 2 === 0 ? 'lobby__seat--up' : 'lobby__seat--down')
              }
            >
              <PlayerBubble
                player={player}
                isSelf={player.id === me?.playerId}
                size={72}
              />
            </motion.div>
          ))}
        </div>
      </div>

      <div className="lobby__footer">
        {isHost ? (
          <>
            <button
              type="button"
              className={
                'btn btn--primary btn--lg btn--block ' +
                (allReady ? 'btn--ready-shine' : '')
              }
              onClick={() => void safe(backend.startGame())}
            >
              <Play size={20} fill="currentColor" />
              {allReady ? "EVERYONE'S READY — START" : 'START ANYWAY'}
            </button>
            {!allReady && waitingOn.length > 0 && (
              <p className="t-muted text-center" style={{ fontSize: '0.85rem' }}>
                Waiting on {waitingOn.map((p) => p.name).join(', ')}…
              </p>
            )}
          </>
        ) : (
          <button
            type="button"
            className={
              'btn btn--lg btn--block ' +
              (room.players.find((p) => p.id === me?.playerId)?.ready
                ? 'btn--soft'
                : 'btn--primary')
            }
            onClick={() => {
              const self = room.players.find((p) => p.id === me?.playerId)
              void safe(backend.setReady(!self?.ready))
            }}
          >
            {room.players.find((p) => p.id === me?.playerId)?.ready
              ? "YOU'RE READY ✓"
              : "I'M READY"}
          </button>
        )}

        <div className="lobby__meta">
          <span className="badge">
            {readyCount}/{room.players.length} ready
          </span>
          {humans.length > 1 && (
            <span className="badge">
              {humans.length} humans · {room.players.length - humans.length} bots
            </span>
          )}
        </div>
      </div>

      {isHost && (
        <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} labelledBy="lobby-settings">
          <SettingsPanel
            room={room}
            onClose={() => setSettingsOpen(false)}
            onSave={(patch) => {
              void safe(backend.updateSettings(patch))
              setSettingsOpen(false)
            }}
          />
        </Modal>
      )}
    </div>
  )
}

function SettingsPanel({
  room,
  onClose,
  onSave,
}: {
  room: { settings: import('../game/types').GameSettings }
  onClose: () => void
  onSave: (patch: Partial<import('../game/types').GameSettings>) => void
}) {
  const [settings, setSettings] = useState(room.settings)
  const timerOptions = [
    { label: 'Chill', clue: 120, discussion: 90 },
    { label: 'Normal', clue: 90, discussion: 60 },
    { label: 'Snappy', clue: 60, discussion: 40 },
  ]

  return (
    <div className="col" style={{ gap: 20 }}>
      <h2 id="lobby-settings" className="t-title">
        Party settings
      </h2>

      <div className="field-row">
        <div className="field">
          <span className="t-eyebrow">Undercover</span>
          <div className="segmented">
            {[1, 2].map((n) => (
              <button
                key={n}
                type="button"
                className={settings.undercoverCount === n ? 'is-active' : ''}
                onClick={() => setSettings((s) => ({ ...s, undercoverCount: n }))}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="t-eyebrow">Mr. White</span>
          <div className="segmented">
            <button
              type="button"
              className={settings.mrWhiteEnabled ? 'is-active' : ''}
              onClick={() => setSettings((s) => ({ ...s, mrWhiteEnabled: true }))}
            >
              On
            </button>
            <button
              type="button"
              className={!settings.mrWhiteEnabled ? 'is-active' : ''}
              onClick={() => setSettings((s) => ({ ...s, mrWhiteEnabled: false }))}
            >
              Off
            </button>
          </div>
        </div>
      </div>

      <div className="field">
        <span className="t-eyebrow">
          <Clock size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> Pace
        </span>
        <div className="segmented segmented--wide">
          {timerOptions.map((opt) => {
            const active =
              settings.clueSeconds === opt.clue &&
              settings.discussionSeconds === opt.discussion
            return (
              <button
                key={opt.label}
                type="button"
                className={active ? 'is-active' : ''}
                onClick={() =>
                  setSettings((s) => ({
                    ...s,
                    clueSeconds: opt.clue,
                    discussionSeconds: opt.discussion,
                  }))
                }
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      <p className="t-muted" style={{ fontSize: '0.82rem' }}>
        Mr. White joins at 4+ players. Undercover maxes out with the player count.
      </p>

      <div className="row" style={{ gap: 10 }}>
        <button type="button" className="btn btn--ghost grow" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn--primary grow"
          onClick={() => onSave(settings)}
        >
          Save
        </button>
      </div>
    </div>
  )
}
