import { getSupabase, isSupabaseConfigured } from '../supabaseClient'
import { allowedTokens, type Finding } from './findings'
import { composeNarration } from './compose'

// ─────────────────────────────────────────────────────────────────────────────
// Advisor · narration + validation gate
//
// Sends the computed findings to the `advisor` Edge Function (Gemini) and AUDITS
// what comes back before letting it near the UI. The model is allowed to write
// freely; it is not allowed to introduce a number.
//
// The gate is the reason this is safe to ship: prose is unverifiable in general,
// but "every figure in the output must appear verbatim in the facts we supplied"
// is a total check. A model that invents a trend has to invent a number to state
// it, and that fails here.
//
// Ladder: model → retry → deterministic fallback. The feature never hard-fails,
// and works with no key at all (local dev).
// ─────────────────────────────────────────────────────────────────────────────

/** What the `advisor` Edge Function returns (see supabase/functions/advisor). */
interface AdvisorResponse {
  configured?: boolean
  text?: string
  model?: string
  error?: string
}

export type NarrationSource = 'model' | 'fallback'

export interface Narration {
  text: string
  source: NarrationSource
  /** Model id when `source === 'model'`. */
  model?: string
  /** Why the model result was refused, when it was. Surfaced in dev only. */
  rejected?: string[]
  /** Attempts made against the model (0 when it was never reachable). */
  attempts: number
}

/** Enabled by build flag, and only meaningful with Supabase configured. */
export function isAdvisorEnabled(): boolean {
  return import.meta.env.VITE_ADVISOR === '1' && isSupabaseConfigured()
}

/**
 * Numeric-ish tokens in a piece of prose: `1,796`, `+33%`, `−2.0%`, `6.9 h`,
 * `2.7×`, `26 points`. Deliberately greedy — a token we can't classify is
 * something we'd rather audit than ignore.
 */
const TOKEN_RE = /[+\-−]?\d[\d,.]*\s*(?:%|h\b|×|points?\b|hours?\b|days?\b|weeks?\b)?/gi

/** Pause before retrying — long enough to clear a per-minute burst limit. */
const RETRY_DELAY_MS = 2500

/** Ordinary English that happens to contain a digit and needn't be whitelisted. */
const BENIGN = new Set(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'one', 'two', 'three'])

function normalise(token: string): string {
  return token
    .replace(/\s+/g, ' ')
    .replace(/−/g, '−') // unify the two minus glyphs
    .replace(/-/g, '−')
    .trim()
    .toLowerCase()
}

/**
 * Every number in `text` that wasn't supplied in `facts`.
 *
 * Whitelists both the raw fact strings and a couple of harmless variants the
 * model legitimately produces — "12,379 h" quoted as "12,379", and a bare integer
 * from a small count. Anything else is a hallucination.
 */
export function auditNumbers(text: string, findings: Finding[]): string[] {
  const allowed = new Set<string>()
  for (const raw of allowedTokens(findings)) {
    // A fact may be quoted without its unit ("12,379 h" → "12,379"), without a
    // trailing zero ("−2.0%" → "−2%"), or — for a signed change — without the
    // leading plus ("+70%" → "70%"). All three are faithful quotations, and the
    // last is what ordinary prose does: "output grew 70%", never "grew +70%".
    // compose.ts writes it that way too, so without this the audit rejects the
    // app's own house style.
    const base = normalise(raw)
    for (const signed of [base, base.replace(/^\+/, '')]) {
      for (const z of [signed, signed.replace(/\.0(?=\D|$)/g, '')]) {
        if (!z) continue
        allowed.add(z)
        allowed.add(z.replace(/\s*(?:%|h|×|points?|hours?|days?|weeks?)$/i, '').trim())
      }
    }
  }
  const bad: string[] = []
  for (const m of text.matchAll(TOKEN_RE)) {
    // Trailing commas and full stops are sentence punctuation, not part of the
    // figure: "…in 2026, effort grew…" matches as "2026,". Only the TAIL is
    // trimmed, so internal separators (1,796 · 2.0 · −2.0%) survive intact.
    const tok = normalise(m[0]).replace(/[.,]+$/, '')
    if (!tok || BENIGN.has(tok)) continue
    // Try the token as written, and stripped of its unit.
    const bare = tok.replace(/\s*(?:%|h|×|points?|hours?|days?|weeks?)$/i, '').trim()
    if (allowed.has(tok) || allowed.has(bare)) continue
    bad.push(m[0].trim())
  }
  return [...new Set(bad)]
}

/**
 * Text that shouldn't appear because it was never sent: person names and raw task
 * names. Their presence proves the model invented specifics.
 */
export function auditForbidden(text: string, people: string[]): string[] {
  const hits: string[] = []
  for (const name of people) {
    const n = name.trim()
    if (n.length < 3) continue // initials/short handles would false-positive
    if (new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) hits.push(n)
  }
  return hits
}

/** Cheap shape checks — a wall of bullets or a 12-line list isn't a briefing. */
function auditShape(text: string): string[] {
  const problems: string[] = []
  const words = text.split(/\s+/).length
  if (words < 40) problems.push(`too short (${words} words)`)
  if (words > 320) problems.push(`too long (${words} words)`)
  if (/^\s*[-*•]/m.test(text)) problems.push('contains bullet points')
  if (/^#{1,6}\s/m.test(text)) problems.push('contains headings')
  return problems
}

/**
 * Pull the real message out of a failed `functions.invoke`.
 *
 * supabase-js reports any non-2xx function response as a bare "non-2xx status
 * code" error and hides the body — but the body is the whole diagnosis (an
 * upstream `Gemini 429: {...}` quota message, say). It survives on `error.context`
 * as the raw Response, so read it there.
 */
async function errorDetail(error: { message?: string; context?: unknown }): Promise<string> {
  const ctx = error?.context as Response | undefined
  if (ctx && typeof (ctx as Response).text === 'function') {
    try {
      const raw = await (ctx as Response).clone().text()
      let parsed: { error?: unknown } | null = null
      try {
        parsed = JSON.parse(raw)
      } catch {
        /* not JSON — fall through to the raw text */
      }
      const detail = typeof parsed?.error === 'string' ? parsed.error : raw.trim()
      // Generous: an upstream quota error carries the useful part (which limit, on
      // which model, and the retry delay) well after the human-readable preamble.
      if (detail) return `HTTP ${(ctx as Response).status} · ${detail.slice(0, 1200)}`
    } catch {
      /* body already consumed or unreadable */
    }
  }
  return error?.message ?? String(error)
}

export interface NarrateOptions {
  findings: Finding[]
  scopeLabel: string
  effortOn: boolean
  /** Person names to assert absent — from settings, never sent upstream. */
  people?: string[]
  /** Attempts before giving up on the model. */
  maxAttempts?: number
  /**
   * Voice brief from Settings -> Advisor. Blank falls back to the function's own
   * default. It controls tone and structure only: the function appends its accuracy
   * rules afterwards, and the audit below is what actually enforces them.
   */
  prompt?: string
}

/**
 * Narrate the findings, auditing every attempt. Falls back to deterministic
 * sentences rather than showing anything unverified.
 *
 * `findings` are sent as-is: pre-formatted strings only, so the payload leaving
 * the browser is aggregate by construction.
 */
export async function narrate({
  findings,
  scopeLabel,
  effortOn,
  people = [],
  maxAttempts = 2,
  prompt,
}: NarrateOptions): Promise<Narration> {
  const fallback = (rejected?: string[], attempts = 0): Narration => ({
    // The built-in analyst (compose.ts): a full authored briefing, not an error
    // state. Correct by construction, so it skips the audit the model must pass.
    text: composeNarration(findings),
    source: 'fallback',
    rejected,
    attempts,
  })

  if (!findings.length) return { text: '', source: 'fallback', attempts: 0 }
  if (!isAdvisorEnabled()) return fallback(['advisor disabled or Supabase not configured'])

  const payload = {
    // Strip anything not needed upstream — severity/claim/facts only.
    findings: findings.map(({ id, severity, claim, facts }) => ({ id, severity, claim, facts })),
    scopeLabel,
    effortOn,
    ...(prompt?.trim() ? { prompt: prompt.trim() } : {}),
  }

  const rejected: string[] = []
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Back off before a retry. Firing straight into a rate limit just earns a
    // second 429; a rejected-for-content retry also benefits from not being
    // instant, since the model re-rolls either way.
    if (attempt > 1) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
    let data: AdvisorResponse | null = null
    try {
      const res = await getSupabase().functions.invoke<AdvisorResponse>('advisor', { body: payload })
      if (res.error) {
        rejected.push(`attempt ${attempt}: ${await errorDetail(res.error)}`)
        continue
      }
      data = res.data ?? null
    } catch (e) {
      rejected.push(`attempt ${attempt}: ${String(e)}`)
      continue
    }

    // Provider-neutral: the function accepts either a Gemini or a Groq key.
    if (data?.configured === false)
      return fallback(['No model key set on the advisor function (GEMINI_API_KEY or GROQ_API_KEY)'], attempt)
    if (data?.error) {
      rejected.push(`attempt ${attempt}: ${data.error}`)
      continue
    }
    const text = (data?.text ?? '').trim()
    if (!text) {
      rejected.push(`attempt ${attempt}: empty text`)
      continue
    }

    const badNumbers = auditNumbers(text, findings)
    const forbidden = auditForbidden(text, people)
    const shape = auditShape(text)
    if (badNumbers.length || forbidden.length || shape.length) {
      rejected.push(
        `attempt ${attempt}: ` +
          [
            badNumbers.length ? `unsupported numbers [${badNumbers.join(', ')}]` : '',
            forbidden.length ? `named people [${forbidden.join(', ')}]` : '',
            shape.length ? shape.join('; ') : '',
          ]
            .filter(Boolean)
            .join(' · '),
      )
      continue
    }

    return { text, source: 'model', model: data?.model, attempts: attempt, rejected: rejected.length ? rejected : undefined }
  }

  return fallback(rejected, maxAttempts)
}
