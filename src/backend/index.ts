import { hasSupabase } from './env'
import { LocalBackend } from './local'
import { SupabaseBackend } from './supabase'
import type { Backend } from './types'

let instance: Backend | null = null

export function getBackend(): Backend {
  if (!instance) {
    instance = hasSupabase ? new SupabaseBackend() : new LocalBackend()
  }
  return instance
}

export { hasSupabase }
export type { Backend, Friend, GameRecord, PlayerSearchResult } from './types'
