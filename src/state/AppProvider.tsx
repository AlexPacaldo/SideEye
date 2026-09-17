import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { getBackend } from '../backend'
import type { Snapshot } from '../game/types'
import {
  AppContext,
  type AppContextValue,
  type ToastItem,
  type ToastTone,
} from './context'

const EMPTY: Snapshot = { user: null, room: null, me: null, connected: false }

export function AppProvider({ children }: { children: ReactNode }) {
  const backend = useMemo(() => getBackend(), [])
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY)
  const [ready, setReady] = useState(false)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timers = useRef<number[]>([])

  useEffect(() => {
    let active = true
    const unsubscribe = backend.subscribe((s) => {
      if (active) setSnapshot({ ...s })
    })
    void backend.init().then(() => {
      if (active) setReady(true)
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [backend])

  useEffect(() => {
    return () => {
      timers.current.forEach((t) => window.clearTimeout(t))
    }
  }, [])

  const toast = useCallback((message: string, tone: ToastTone = 'default') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setToasts((prev) => [...prev, { id, message, tone }])
    const handle = window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
      timers.current = timers.current.filter((t) => t !== handle)
    }, 3200)
    timers.current.push(handle)
  }, [])

  const safe = useCallback(
    async <T,>(promise: Promise<T>): Promise<T | undefined> => {
      try {
        return await promise
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Something went sideways.'
        toast(message, 'danger')
        return undefined
      }
    },
    [toast],
  )

  const value: AppContextValue = {
    snapshot,
    ready,
    backend,
    toasts,
    toast,
    safe,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
