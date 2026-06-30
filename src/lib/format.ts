/** Format an ISO date (yyyy-mm-dd) as "29 Jun 2026". Returns "—" for null. */
export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ]
  return `${d} ${months[m - 1]} ${y}`
}

/** Compact number formatting, e.g. 1200 → "1.2k". */
export function compactNumber(n: number): string {
  if (n < 1000) return String(n)
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

/** Today's date as yyyy-mm-dd (local time). */
export function todayISO(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Class-name joiner that drops falsy values. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/**
 * Turn any thrown value into a readable message. Handles JS Errors, strings,
 * and Supabase/PostgREST error objects ({ message, details, hint, code }),
 * which are plain objects and would otherwise stringify to "[object Object]".
 */
export function toMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  if (e && typeof e === 'object') {
    const o = e as Record<string, unknown>
    const parts = [o.message, o.details, o.hint].filter(
      (x): x is string => typeof x === 'string' && x.length > 0,
    )
    if (parts.length) return parts.join(' — ')
    try {
      return JSON.stringify(e)
    } catch {
      return String(e)
    }
  }
  return String(e)
}
