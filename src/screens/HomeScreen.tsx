import { AnimatePresence, motion } from 'framer-motion'
import { Bot, ChevronRight, DoorOpen, Plus, Smartphone, Users } from 'lucide-react'
import { useState } from 'react'
import { useApp } from '../state/context'
import { Decor } from '../components/ui/Decor'
import { Modal } from '../components/ui/Modal'
import { GAME, MOTIF_COPY } from '../game/identity'
import { DEFAULT_SETTINGS } from '../game/types'
import type { GameSettings } from '../game/types'

interface HomeScreenProps {
  onNavigate: (view: 'friends' | 'history' | 'auth') => void
}

export function HomeScreen({ onNavigate }: HomeScreenProps) {
  const { snapshot, backend, safe } = useApp()
  const [setupOpen, setSetupOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const [passOpen, setPassOpen] = useState(false)

  const user = snapshot.user

  return (
    <div className="home">
      <div className="home__hero">
        <Decor variant="home" />
        <span className="badge badge--primary" style={{ alignSelf: 'center' }}>
          Party game · 3–12 players
        </span>
        <h1 className="t-hero home__title">
          <span>{GAME.name}</span>
        </h1>
        <p className="home__tagline">{GAME.tagline}</p>
        <p className="t-body home__blurb">{GAME.blurb}</p>
        <div className="home__motif-row" aria-hidden="true">
          {MOTIF_COPY.map((m, i) => (
            <span key={m} style={{ animationDelay: `${i * 0.35}s` }}>
              {m}
            </span>
          ))}
        </div>
      </div>

      <div className="home__actions">
        <motion.button
          type="button"
          className="action-card action-card--primary"
          whileTap={{ scale: 0.985 }}
          onClick={() => setSetupOpen(true)}
        >
          <span className="action-card__glyph" aria-hidden="true">
            <Plus size={30} strokeWidth={2.6} />
          </span>
          <span className="action-card__body">
            <span className="action-card__title">START A PARTY</span>
            <span className="action-card__sub">Open a room and share the code</span>
          </span>
          <ChevronRight className="action-card__chev" size={22} />
        </motion.button>

        <div className="home__action-row">
          <motion.button
            type="button"
            className="action-card action-card--tile"
            whileTap={{ scale: 0.98 }}
            onClick={() => setJoinOpen(true)}
          >
            <span className="action-card__glyph" aria-hidden="true">
              <DoorOpen size={26} strokeWidth={2.6} />
            </span>
            <span className="action-card__title">JOIN A PARTY</span>
            <span className="action-card__sub">Got a code?</span>
          </motion.button>

          <motion.button
            type="button"
            className="action-card action-card--tile"
            whileTap={{ scale: 0.98 }}
            onClick={() => setPassOpen(true)}
          >
            <span className="action-card__glyph" aria-hidden="true">
              <Smartphone size={26} strokeWidth={2.6} />
            </span>
            <span className="action-card__title">PASS &amp; PLAY</span>
            <span className="action-card__sub">One phone, whole couch</span>
          </motion.button>
        </div>

        <motion.button
          type="button"
          className="action-card action-card--slim"
          whileTap={{ scale: 0.99 }}
          onClick={() =>
            safe(
              backend.createRoom({
                name: user?.name ?? 'You',
                mode: 'online',
                settings: DEFAULT_SETTINGS,
                fillBots: true,
              }),
            )
          }
        >
          <span className="action-card__glyph action-card__glyph--sm" aria-hidden="true">
            <Bot size={22} strokeWidth={2.6} />
          </span>
          <span className="action-card__body">
            <span className="action-card__title">PLAY WITH BOTS</span>
            <span className="action-card__sub">No friends online? No problem.</span>
          </span>
          <ChevronRight className="action-card__chev" size={20} />
        </motion.button>
      </div>

      {!user && (
        <div className="signin-prompt">
          <div className="col" style={{ gap: 2 }}>
            <span className="t-section">Save your games</span>
            <span className="t-muted" style={{ fontSize: '0.88rem' }}>
              Sign in to build a friends list and game history.
            </span>
          </div>
          <button
            type="button"
            className="btn btn--soft btn--sm"
            onClick={() => onNavigate('auth')}
          >
            Sign in
          </button>
        </div>
      )}

      <div className="home__secondary">
        <button type="button" className="link-chip" onClick={() => onNavigate('friends')}>
          <Users size={18} /> Friends
        </button>
        <button type="button" className="link-chip" onClick={() => onNavigate('history')}>
          <ChevronRight size={18} /> Game history
        </button>
      </div>

      <HowItPlays />

      <AnimatePresence>
        {setupOpen && (
          <SetupModal
            onClose={() => setSetupOpen(false)}
            onStart={(name, settings) => {
              setSetupOpen(false)
              void safe(
                backend.createRoom({ name, mode: 'online', settings }),
              )
            }}
            defaultName={user?.name ?? ''}
          />
        )}
        {joinOpen && (
          <JoinModal
            onClose={() => setJoinOpen(false)}
            onJoin={(code, name) => {
              setJoinOpen(false)
              void safe(backend.joinRoom(code, name))
            }}
            defaultName={user?.name ?? ''}
          />
        )}
        {passOpen && (
          <PassModal
            onClose={() => setPassOpen(false)}
            onStart={(names) => {
              setPassOpen(false)
              void safe(
                backend.createRoom({
                  name: names[0] ?? 'Player 1',
                  mode: 'passplay',
                  settings: DEFAULT_SETTINGS,
                  passNames: names,
                }),
              )
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function HowItPlays() {
  return (
    <div className="how">
      <span className="t-eyebrow">How it plays</span>
      <div className="how__steps">
        <div className="how__step">
          <span className="how__glyph" aria-hidden="true">
            ◈
          </span>
          <span>
            <strong>Everyone gets a word.</strong> Almost everyone.
          </span>
        </div>
        <span className="how__arrow" aria-hidden="true">
          →
        </span>
        <div className="how__step">
          <span className="how__glyph" aria-hidden="true">
            ✎
          </span>
          <span>
            <strong>Drop one-word clues.</strong> Vague is safe.
          </span>
        </div>
        <span className="how__arrow" aria-hidden="true">
          →
        </span>
        <div className="how__step">
          <span className="how__glyph" aria-hidden="true">
            ?
          </span>
          <span>
            <strong>Vote out the fake.</strong> Trust no one.
          </span>
        </div>
      </div>
    </div>
  )
}

function SetupModal({
  defaultName,
  onClose,
  onStart,
}: {
  defaultName: string
  onClose: () => void
  onStart: (name: string, settings: GameSettings) => void
}) {
  const [name, setName] = useState(defaultName)
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS)

  return (
    <Modal open onClose={onClose} labelledBy="setup-title">
      <div className="col" style={{ gap: 18 }}>
        <h2 id="setup-title" className="t-title">
          Start a party
        </h2>
        <label className="field">
          <span className="t-eyebrow">Your name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="What should we call you?"
            maxLength={16}
          />
        </label>

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

        <p className="t-muted" style={{ fontSize: '0.85rem' }}>
          You can change these anytime in the lobby.
        </p>

        <button
          type="button"
          className="btn btn--primary btn--lg btn--block"
          onClick={() => onStart(name.trim() || 'You', settings)}
        >
          OPEN THE PARTY
        </button>
      </div>
    </Modal>
  )
}

function JoinModal({
  defaultName,
  onClose,
  onJoin,
}: {
  defaultName: string
  onClose: () => void
  onJoin: (code: string, name: string) => void
}) {
  const [code, setCode] = useState('')
  const [name, setName] = useState(defaultName)

  return (
    <Modal open onClose={onClose} labelledBy="join-title">
      <div className="col" style={{ gap: 18 }}>
        <h2 id="join-title" className="t-title">
          Join a party
        </h2>
        <label className="field">
          <span className="t-eyebrow">Party code</span>
          <input
            className="code-input"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 5))}
            placeholder="A7K2Q"
            autoFocus
          />
        </label>
        <label className="field">
          <span className="t-eyebrow">Your name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 16))}
            placeholder="What should we call you?"
          />
        </label>
        <button
          type="button"
          className="btn btn--primary btn--lg btn--block"
          disabled={code.length < 5}
          onClick={() => onJoin(code, name.trim() || 'Player')}
        >
          SLIDE IN
        </button>
      </div>
    </Modal>
  )
}

function PassModal({
  onClose,
  onStart,
}: {
  onClose: () => void
  onStart: (names: string[]) => void
}) {
  const [names, setNames] = useState<string[]>(['', '', ''])
  const canStart = names.filter((n) => n.trim()).length >= 3

  return (
    <Modal open onClose={onClose} labelledBy="pass-title">
      <div className="col" style={{ gap: 16 }}>
        <h2 id="pass-title" className="t-title">
          Pass &amp; play
        </h2>
        <p className="t-body" style={{ fontSize: '0.92rem' }}>
          One phone, passed around. Everyone gets a secret peek.
        </p>
        <div className="col" style={{ gap: 8 }}>
          {names.map((value, i) => (
            <div className="row" key={i} style={{ gap: 10 }}>
              <span className="pass-num">{i + 1}</span>
              <input
                className="pass-name-input"
                value={value}
                placeholder={`Player ${i + 1}`}
                maxLength={16}
                onChange={(e) => {
                  const next = [...names]
                  next[i] = e.target.value
                  setNames(next)
                }}
              />
              {names.length > 3 && (
                <button
                  type="button"
                  className="btn btn--icon btn--soft"
                  onClick={() => setNames(names.filter((_, idx) => idx !== i))}
                  aria-label="Remove player"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        {names.length < 10 && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setNames([...names, ''])}
          >
            + Add another
          </button>
        )}
        <button
          type="button"
          className="btn btn--primary btn--lg btn--block"
          disabled={!canStart}
          onClick={() => onStart(names.map((n, i) => n.trim() || `Player ${i + 1}`))}
        >
          PASS THE PHONE
        </button>
      </div>
    </Modal>
  )
}
