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
const LOCAL_ACCOUNT_KEY = 'mwr.localAccount'

interface Account {
  username: string
  passwordHash: string
}

/**
 * Default account for the local (no-Supabase) backend: admin / gcmc2026.
 * Editable in Settings → Account, persisted to `mwr.localAccount`. With
 * Supabase configured, accounts live in the `app_users` table instead
 * (seeded with the same default — see supabase/schema.sql).
 */
const DEFAULT_LOCAL_ACCOUNT: Account = {
  username: 'admin',
  passwordHash: '6f054b199406396d5fb19af352c7968a4494a4cfb73f218eae0b7095bd39dfad',
}

/** The current local account — the stored override if present, else the default. */
function localAccount(): Account {
  try {
    const raw = localStorage.getItem(LOCAL_ACCOUNT_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Partial<Account>
      if (typeof p.username === 'string' && typeof p.passwordHash === 'string') {
        return { username: p.username, passwordHash: p.passwordHash }
      }
    }
  } catch {
    /* fall through to the default */
  }
  return DEFAULT_LOCAL_ACCOUNT
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** True when a Supabase error means the app_users table hasn't been created yet. */
function isMissingUsersTable(error: { code?: string } | null): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205'
}

const SETUP_MESSAGE =
  'Sign-in isn’t set up yet — run supabase/schema.sql to create the app_users table.'

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

/** Fields for a self-service account change. Omit a field to leave it unchanged. */
export interface AccountUpdate {
  /** Required — the change is rejected unless this matches the signed-in account. */
  currentPassword: string
  newUsername?: string
  newPassword?: string
}

interface AuthValue {
  /** Signed-in username, or null when browsing anonymously. */
  user: string | null
  /** Editing is unlocked only while signed in — anonymous visitors are read-only. */
  canEdit: boolean
  /** Throws with a readable message on bad credentials / missing setup. */
  signIn: (username: string, password: string) => Promise<void>
  signOut: () => void
  /** Change the signed-in account's username and/or password. Throws on bad input. */
  updateAccount: (update: AccountUpdate) => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<string | null>(restoreSession)

  const persistSession = (name: string) => {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ username: name, at: new Date().toISOString() }))
    } catch {
      /* session just won't survive a reload */
    }
  }

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
        if (isMissingUsersTable(error)) throw new Error(SETUP_MESSAGE)
        throw new Error(error.message)
      }
      ok = Boolean(data)
    } else {
      const acct = localAccount()
      ok = name === acct.username && hash === acct.passwordHash
    }

    if (!ok) throw new Error('Wrong username or password.')
    setUser(name)
    persistSession(name)
  }, [])

  const signOut = useCallback(() => {
    setUser(null)
    try {
      localStorage.removeItem(SESSION_KEY)
    } catch {
      /* ignore */
    }
  }, [])

  const updateAccount = useCallback(
    async ({ currentPassword, newUsername, newPassword }: AccountUpdate) => {
      if (!user) throw new Error('You’re not signed in.')
      const nextName = newUsername?.trim() || user
      const changingName = nextName !== user
      if (!changingName && !newPassword) throw new Error('Nothing to change.')
      if (!currentPassword) throw new Error('Enter your current password to confirm.')

      const currentHash = await sha256Hex(currentPassword)

      if (isSupabaseConfigured()) {
        const db = getSupabase()
        // 1. Verify the current password.
        const { data: me, error: verifyErr } = await db
          .from('app_users')
          .select('username')
          .eq('username', user)
          .eq('password_hash', currentHash)
          .maybeSingle()
        if (verifyErr) {
          if (isMissingUsersTable(verifyErr)) throw new Error(SETUP_MESSAGE)
          throw new Error(verifyErr.message)
        }
        if (!me) throw new Error('Current password is incorrect.')

        // 2. If renaming, make sure the new name is free.
        if (changingName) {
          const { data: taken, error: takenErr } = await db
            .from('app_users')
            .select('username')
            .eq('username', nextName)
            .maybeSingle()
          if (takenErr) throw new Error(takenErr.message)
          if (taken) throw new Error('That username is already taken.')
        }

        // 3. Apply the change. `.select()` so we can tell a real write from an
        //    RLS-blocked no-op — a blocked update returns no error but 0 rows.
        const patch: Record<string, string> = {}
        if (changingName) patch.username = nextName
        if (newPassword) patch.password_hash = await sha256Hex(newPassword)
        const { data: updated, error: updateErr } = await db
          .from('app_users')
          .update(patch)
          .eq('username', user)
          .select('username')
        if (updateErr) throw new Error(updateErr.message)
        if (!updated || updated.length === 0) {
          throw new Error(
            'Couldn’t save — account changes are blocked. Re-run supabase/schema.sql to allow them.',
          )
        }
      } else {
        const acct = localAccount()
        if (currentHash !== acct.passwordHash) throw new Error('Current password is incorrect.')
        const next: Account = {
          username: nextName,
          passwordHash: newPassword ? await sha256Hex(newPassword) : acct.passwordHash,
        }
        try {
          localStorage.setItem(LOCAL_ACCOUNT_KEY, JSON.stringify(next))
        } catch {
          throw new Error('Couldn’t save the change in this browser.')
        }
      }

      setUser(nextName)
      persistSession(nextName)
    },
    [user],
  )

  const value = useMemo<AuthValue>(
    () => ({ user, canEdit: Boolean(user), signIn, signOut, updateAccount }),
    [user, signIn, signOut, updateAccount],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
