import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { getSupabase, isSupabaseConfigured } from './supabaseClient'

const SESSION_KEY = 'mwr.session'

/**
 * Fallback account for the local (no-Supabase) backend: admin / gcmc2026.
 * With Supabase configured, accounts live in the `app_users` table instead
 * (seeded with the same default — see supabase/schema.sql).
 */
const LOCAL_USER = {
  username: 'admin',
  passwordHash: '6f054b199406396d5fb19af352c7968a4494a4cfb73f218eae0b7095bd39dfad',
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function restoreSession(): string | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { username?: unknown }
    return typeof parsed.username === 'string' && parsed.username ? parsed.username : null
  } catch {
    return null
  }
}

interface AuthValue {
  /** Signed-in username, or null when browsing anonymously. */
  user: string | null
  /** Editing is unlocked only while signed in — anonymous visitors are read-only. */
  canEdit: boolean
  /** Throws with a readable message on bad credentials / missing setup. */
  signIn: (username: string, password: string) => Promise<void>
  signOut: () => void
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<string | null>(restoreSession)

  const signIn = useCallback(async (username: string, password: string) => {
    const name = username.trim()
    if (!name || !password) throw new Error('Enter a username and password.')
    const hash = await sha256Hex(password)

    let ok = false
    if (isSupabaseConfigured()) {
      const { data, error } = await getSupabase()
        .from('app_users')
        .select('username')
        .eq('username', name)
        .eq('password_hash', hash)
        .maybeSingle()
      if (error) {
        // 42P01 / PGRST205 = table missing — schema.sql hasn't been (re-)run yet.
        if (error.code === '42P01' || error.code === 'PGRST205') {
          throw new Error('Sign-in isn’t set up yet — run supabase/schema.sql to create the app_users table.')
        }
        throw new Error(error.message)
      }
      ok = Boolean(data)
    } else {
      ok = name === LOCAL_USER.username && hash === LOCAL_USER.passwordHash
    }

    if (!ok) throw new Error('Wrong username or password.')
    setUser(name)
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ username: name, at: new Date().toISOString() }))
    } catch {
      /* session just won't survive a reload */
    }
  }, [])

  const signOut = useCallback(() => {
    setUser(null)
    try {
      localStorage.removeItem(SESSION_KEY)
    } catch {
      /* ignore */
    }
  }, [])

  const value = useMemo<AuthValue>(
    () => ({ user, canEdit: Boolean(user), signIn, signOut }),
    [user, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
