import { useEffect, useMemo, useState } from 'react'
import type { ChatMessage } from '../backend'
import { useApp } from '../state/context'

export interface PartyChat {
  messages: ChatMessage[]
  loaded: boolean
  send: (text: string) => Promise<void>
}

export function usePartyChat(): PartyChat {
  const { backend, snapshot, safe } = useApp()
  const code = snapshot.room?.code ?? null

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    const unsubscribe = backend.subscribeChat((m) => {
      if (!active) return
      setMessages((prev) =>
        prev.some((x) => x.id === m.id) ? prev : [...prev, m].slice(-100),
      )
    })
    void backend.listMessages().then((list) => {
      if (!active) return
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id))
        return [...prev, ...list.filter((m) => !seen.has(m.id))].slice(-100)
      })
      setLoaded(true)
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [backend, code])

  const send = useMemo(
    () => async (text: string): Promise<void> => {
      await safe(backend.sendMessage(text))
    },
    [backend, safe],
  )

  return { messages, loaded, send }
}