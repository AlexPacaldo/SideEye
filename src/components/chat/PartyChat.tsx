import { MessageCircle, Send } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePartyChat } from '../../hooks/usePartyChat'
import { useApp } from '../../state/context'
import { Modal } from '../ui/Modal'

function timeLabel(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function PartyChat() {
  const { snapshot } = useApp()
  const { messages, loaded, send } = usePartyChat()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [lastSeenCount, setLastSeenCount] = useState(0)
  const listRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const meId = snapshot.me?.playerId ?? ''

  const unread = !open && messages.length > lastSeenCount

  useEffect(() => {
    if (open) {
      const el = inputRef.current
      if (el) el.focus()
    }
  }, [open])

  useEffect(() => {
    if (open && loaded) {
      const el = listRef.current
      if (el) el.scrollTop = el.scrollHeight
    }
  }, [open, loaded, messages.length])

  useEffect(() => {
    const vv = window.visualViewport
    const update = () => {
      const root = document.documentElement
      root.style.setProperty('--chat-sheet-top', `${vv ? vv.offsetTop : 0}px`)
      root.style.setProperty('--chat-sheet-h', `${vv ? vv.height : window.innerHeight}px`)
    }
    update()
    if (vv) {
      vv.addEventListener('resize', update)
      vv.addEventListener('scroll', update)
    }
    window.addEventListener('resize', update)
    return () => {
      if (vv) {
        vv.removeEventListener('resize', update)
        vv.removeEventListener('scroll', update)
      }
      window.removeEventListener('resize', update)
    }
  }, [])

  const submit = async () => {
    const clean = text.trim()
    if (!clean || sending) return
    setSending(true)
    await send(clean)
    setSending(false)
    setText('')
  }

  return (
    <>
      <button
        type="button"
        className="room-bar__voice chat__trigger"
        onClick={() => {
          setLastSeenCount(messages.length)
          setOpen(true)
        }}
        aria-label={unread ? 'Party chat with new messages' : 'Open party chat'}
      >
        <MessageCircle size={16} />
        {unread && <span className="chat__badge" aria-hidden="true" />}
      </button>

      {createPortal(
        <Modal open={open} onClose={() => setOpen(false)} labelledBy="chat-title" variant="sheet">
          <div className="chat-panel">
            <div className="chat-panel__head">
              <h2 id="chat-title" className="t-title">
                Party chat
              </h2>
              <span className="badge">{messages.length}</span>
            </div>

            <div className="chat-list" ref={listRef}>
              {messages.length === 0 ? (
                <p className="t-muted" style={{ textAlign: 'center', padding: '18px 0' }}>
                  {loaded ? 'No messages yet — say hi!' : 'Loading…'}
                </p>
              ) : (
                messages.map((m) => {
                  const mine = m.playerId === meId
                  return (
                    <div
                      key={m.id}
                      className={'chat-msg' + (mine ? ' chat-msg--mine' : '')}
                    >
                      <span className="chat-msg__meta">
                        {!mine && <strong className="chat-msg__name">{m.name}</strong>}
                        <span className="chat-msg__time">{timeLabel(m.createdAt)}</span>
                      </span>
                      <span className="chat-msg__bubble">{m.text}</span>
                    </div>
                  )
                })
              )}
            </div>

            <form
              className="chat-entry"
              onSubmit={(e) => {
                e.preventDefault()
                void submit()
              }}
            >
              <input
                ref={inputRef}
                className="chat-entry__input"
                value={text}
                maxLength={300}
                placeholder="Say something…"
                enterKeyHint="send"
                onChange={(e) => setText(e.target.value)}
              />
              <button
                type="submit"
                className="btn btn--primary chat-entry__send"
                disabled={sending || !text.trim()}
                aria-label="Send message"
              >
                <Send size={16} />
              </button>
            </form>
          </div>
        </Modal>,
        document.body,
      )}
    </>
  )
}