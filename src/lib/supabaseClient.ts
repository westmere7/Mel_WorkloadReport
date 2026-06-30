import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** True when both Supabase env vars are present — selects the cloud backend. */
export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey)
}

let client: SupabaseClient | null = null

/** Lazily create a single Supabase client (only when configured). */
export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  }
  if (!client) {
    client = createClient(url as string, anonKey as string)
  }
  return client
}
