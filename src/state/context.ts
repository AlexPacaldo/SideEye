import { createContext, useContext } from 'react'
import type { Backend } from '../backend'
import type { Snapshot } from '../game/types'

export type ToastTone = 'default' | 'success' | 'danger'

export interface ToastItem {
  id: string
  message: string
  tone: ToastTone
}

export interface AppContextValue {
  snapshot: Snapshot
  ready: boolean
  backend: Backend
  toasts: ToastItem[]
  toast: (message: string, tone?: ToastTone) => void
  safe: <T>(promise: Promise<T>) => Promise<T | undefined>
}

export const AppContext = createContext<AppContextValue | null>(null)

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>')
  return ctx
}
