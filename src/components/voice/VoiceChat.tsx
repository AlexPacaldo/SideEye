import { Mic, MicOff, Phone } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useApp } from '../../state/context'
import {
  getVoice,
  joinVoice,
  leaveVoice,
  subscribeVoice,
  toggleVoiceMute,
} from '../../voice'
import { Modal } from '../ui/Modal'

export function VoiceChat() {
  const { snapshot } = useApp()
  const room = snapshot.room
  const me = snapshot.me
  const voice = useSyncExternalStore(subscribeVoice, getVoice)
  const [open, setOpen] = useState(false)
  const lastCode = useRef<string | null>(null)

  useEffect(() => {
    if (!room || room.mode !== 'online') return
    if (lastCode.current && lastCode.current !== room.code) {
      leaveVoice()
    }
    lastCode.current = room.code
  })

  useEffect(
    () => () => {
      leaveVoice()
    },
    [],
  )

  if (!room || room.mode !== 'online') return null

  const isHost = room.hostId === me?.playerId
  const live = voice.status === 'live'
  const joining = voice.status === 'joining'
  const classNames = [
    'room-bar__voice',
    live ? (voice.muted ? 'is-muted' : 'is-live') : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <>
      <button
        type="button"
        className={classNames}
        onClick={() => setOpen(true)}
        aria-label={
          live
            ? voice.muted
              ? 'Voice chat muted'
              : 'Voice chat on'
            : 'Open voice chat'
        }
      >
        {live ? (
          voice.muted ? (
            <MicOff size={16} />
          ) : (
            <Mic size={16} />
          )
        ) : (
          <Phone size={16} />
        )}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} labelledBy="voice-title">
        <div className="voice-panel">
          <div className="voice-panel__head">
            <h2 id="voice-title" className="t-title">
              Voice chat
            </h2>
            {live && (
              <span className="badge">{voice.connected + 1} on</span>
            )}
          </div>

          {voice.status === 'error' && (
            <p className="t-body" style={{ color: 'var(--danger)' }}>
              {voice.error}
            </p>
          )}

          {joining && <p className="t-body">Connecting…</p>}

          {live ? (
            <div className="col" style={{ gap: 14 }}>
              <div className="voice-row">
                <span className="t-muted">
                  {isHost
                    ? 'You host the voice room'
                    : 'Connected to the party voice'}
                </span>
                {voice.connected > 0 && (
                  <span className="badge">
                    {voice.connected}{' '}
                    {voice.connected === 1 ? 'voice' : 'voices'}
                  </span>
                )}
              </div>
              <button
                type="button"
                className="btn btn--soft btn--block"
                onClick={toggleVoiceMute}
              >
                {voice.muted ? <MicOff size={18} /> : <Mic size={18} />}
                {voice.muted ? 'UNMUTE' : 'MUTE'}
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--block"
                onClick={() => {
                  leaveVoice()
                  setOpen(false)
                }}
              >
                <Phone size={18} />
                LEAVE VOICE
              </button>
            </div>
          ) : (
            <>
              <p className="t-muted">
                {isHost
                  ? 'Start the party voice room — it stays on for the whole game.'
                  : 'Talk to your party — voice stays on for the whole game.'}
              </p>
              <button
                type="button"
                className="btn btn--primary btn--block"
                disabled={joining}
                onClick={() => void joinVoice(room.code, isHost)}
              >
                <Phone size={18} />
                {joining ? 'CONNECTING…' : 'JOIN VOICE'}
              </button>
            </>
          )}

          {voice.status === 'error' && (
            <button
              type="button"
              className="btn btn--primary btn--block"
              onClick={() => {
                leaveVoice()
                setOpen(false)
              }}
            >
              CLOSE
            </button>
          )}
        </div>
      </Modal>
    </>
  )
}