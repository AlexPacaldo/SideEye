import { Mic, MicOff, Phone } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../../state/context'
import {
  getVoice,
  getVoiceRemotes,
  joinVoice,
  leaveVoice,
  subscribeVoice,
  toggleVoiceMute,
  useVoiceTalking,
} from '../../voice'
import { Modal } from '../ui/Modal'

function RemoteAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.srcObject = stream
    const tryPlay = () => {
      el.play().catch(() => {})
    }
    tryPlay()
    const retry = () => {
      tryPlay()
      window.removeEventListener('pointerdown', retry)
    }
    window.addEventListener('pointerdown', retry)
    return () => {
      window.removeEventListener('pointerdown', retry)
      el.srcObject = null
    }
  }, [stream])

  return <audio ref={ref} autoPlay playsInline style={{ display: 'none' }} />
}

export function VoiceChat() {
  const { snapshot } = useApp()
  const room = snapshot.room
  const me = snapshot.me
  const voice = useSyncExternalStore(subscribeVoice, getVoice)
  const remotes = useSyncExternalStore(subscribeVoice, getVoiceRemotes)
  const talking = useVoiceTalking()
  const [open, setOpen] = useState(false)
  const lastCode = useRef<string | null>(null)
  const lastHost = useRef<string | null>(null)
  const wanted = useRef(false)

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

  const connected = room != null && room.mode === 'online'
  const isHost = room && connected ? room.hostId === me?.playerId : false
  const myName =
    me && room
      ? (room.players.find((p) => p.id === me.playerId)?.name ?? 'You')
      : 'You'

  useEffect(() => {
    if (!connected || !me) return
    const changed =
      lastHost.current != null && lastHost.current !== room?.hostId
    lastHost.current = room?.hostId ?? null
    if (!changed) return
    const wasActive = wanted.current
    leaveVoice()
    if (wasActive && room?.code) {
      void joinVoice(room.code, isHost, {
        playerId: me.playerId,
        name: myName,
      })
    }
  }, [connected, me, room?.hostId, room?.code, isHost, myName])

  if (!room || room.mode !== 'online') return null

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
      {remotes.map((entry) => (
        <RemoteAudio key={entry.id} stream={entry.stream} />
      ))}
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

      {createPortal(
        <Modal open={open} onClose={() => setOpen(false)} labelledBy="voice-title">
          <div className="voice-panel">
            <div className="voice-panel__head">
              <h2 id="voice-title" className="t-title">
                Voice chat
              </h2>
              {live && <span className="badge">{voice.connected + 1} on</span>}
            </div>

            {voice.status === 'error' && (
              <p className="t-body" style={{ color: 'var(--danger)' }}>
                {voice.error}
              </p>
            )}

            {voice.status === 'joining' && (
              <p className="t-body">
                {voice.issue ? voice.issue : 'Connecting…'}
              </p>
            )}

            {live ? (
              <div className="col" style={{ gap: 14 }}>
                {voice.linking && (
                  <p className="t-muted">Linking to the party…</p>
                )}
                {voice.issue && (
                  <p
                    className="t-body"
                    style={{ color: 'var(--danger)', fontSize: '0.92rem' }}
                  >
                    {voice.issue}
                  </p>
                )}
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
                {remotes.length > 0 && (
                  <div className="voice-list">
                    {remotes.map((r) => (
                      <div
                        key={r.id}
                        className={
                          'voice-list__row' +
                          (talking[r.playerId]
                            ? ' voice-list__row--talking'
                            : '')
                        }
                      >
                        <span
                          className={
                            'voice-list__dot' +
                            (talking[r.playerId]
                              ? ' voice-list__dot--talking'
                              : '')
                          }
                        />
                        <span className="voice-list__name">{r.name}</span>
                      </div>
                    ))}
                  </div>
                )}
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
                    wanted.current = false
                    leaveVoice()
                    setOpen(false)
                  }}
                >
                  <Phone size={18} />
                  LEAVE VOICE
                </button>
                <p
                  className="t-muted text-center"
                  style={{ fontSize: '0.72rem', margin: 0 }}
                >
                  channel {voice.selfId ?? room.code}
                </p>
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
                  onClick={() => {
                    wanted.current = true
                    void joinVoice(room.code, isHost, {
                      playerId: me?.playerId ?? '',
                      name: myName,
                    })
                  }}
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
        </Modal>,
        document.body,
      )}
    </>
  )
}