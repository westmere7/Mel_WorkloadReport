import type { Half, Task } from '../types'

// Task code format: YY.MMDD.<seq>   e.g. "26.0629.A"  →  2026-06-29, task A
const CODE_RE = /^(\d{2})\.(\d{2})(\d{2})\.([A-Za-z]+)$/

export interface ParsedCode {
  iso: string | null // yyyy-mm-dd
  seq: string | null // e.g. "A"
  valid: boolean
}

/** Parse a task code into an ISO date + sequence letters. */
export function parseTaskCode(code: string): ParsedCode {
  const m = code.trim().match(CODE_RE)
  if (!m) return { iso: null, seq: null, valid: false }
  const [, yy, mm, dd, seq] = m
  const year = 2000 + Number(yy)
  const month = Number(mm)
  const day = Number(dd)
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return { iso: null, seq: seq.toUpperCase(), valid: false }
  }
  const iso = `${year}-${pad(month)}-${pad(day)}`
  return { iso, seq: seq.toUpperCase(), valid: true }
}

/** Build a task code from an ISO date + sequence, e.g. (2026-06-29,"A") → "26.0629.A". */
export function formatTaskCode(iso: string, seq: string): string {
  const [y, m, d] = iso.split('-')
  return `${y.slice(2)}.${m}${d}.${seq.toUpperCase()}`
}

/** Derive the Half of year from an ISO date. Jan–Jun = H1, Jul–Dec = H2. */
export function deriveHalf(iso: string | null): Half {
  if (!iso) return 'H1'
  const month = Number(iso.split('-')[1])
  return month <= 6 ? 'H1' : 'H2'
}

/** Increment a sequence: A → B, Z → AA, AZ → BA. */
export function nextSeq(seq: string): string {
  if (!seq) return 'A'
  const chars = seq.toUpperCase().split('')
  let i = chars.length - 1
  while (i >= 0) {
    if (chars[i] === 'Z') {
      chars[i] = 'A'
      i--
    } else {
      chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1)
      return chars.join('')
    }
  }
  return 'A' + chars.join('')
}

/** Suggest the next available code for a given ISO date based on existing tasks. */
export function suggestCodeForDate(iso: string, tasks: Task[]): string {
  const sameDay = tasks
    .map((t) => parseTaskCode(t.code))
    .filter((p) => p.valid && p.iso === iso && p.seq)
    .map((p) => p.seq as string)

  if (sameDay.length === 0) return formatTaskCode(iso, 'A')

  // Find the "largest" sequence and increment it.
  const max = sameDay.reduce((a, b) => (compareSeq(a, b) >= 0 ? a : b))
  return formatTaskCode(iso, nextSeq(max))
}

/** Compare two sequence strings (A < B, B < AA). */
function compareSeq(a: string, b: string): number {
  if (a.length !== b.length) return a.length - b.length
  return a.localeCompare(b)
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
