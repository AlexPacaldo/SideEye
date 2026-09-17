interface AppEnv {
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
}

const env = import.meta.env as unknown as AppEnv

export const SUPABASE_URL = env.VITE_SUPABASE_URL ?? ''
export const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY ?? ''

export const hasSupabase = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
