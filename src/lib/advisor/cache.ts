import { DEFAULT_ADVISOR_PROMPT } from '../../constants'
import type { Finding } from './findings'
import type { NarrationSource } from './narrate'

// ─────────────────────────────────────────────────────────────────────────────
// Advisor · cached briefing
//
// The narration is stored, not regenerated on view. Two reasons, and the second
// matters more than the first:
//
//  1. Quota. Gemini's free tier allows 20 requests a DAY. A page that generates on
//     load would be exhausted by mid-morning.
//  2. Consistency. One stored briefing means everyone reads the same words. The
//     findings are already view-independent (see scope.ts); re-rolling the prose per
//     visitor would hand that back for no reason.
//
// Staleness is derived, never flagged by hand: the entry carries a fingerprint of
// the findings it was written from, so any change to the underlying data — a new
// task, an edited rate, a different voice brief — makes the cache visibly out of
// date without anyone having to remember to invalidate it.
// ─────────────────────────────────────────────────────────────────────────────

export interface AdvisorCacheEntry {
  /** Fingerprint of the findings + voice brief this text was written from. */
  fingerprint: string
  text: string
  source: NarrationSource
  /** Model id when the text came from the model. */
  model?: string
  /** ISO timestamp of generation. */
  generatedAt: string
  /** Username that spent the call, when known. */
  generatedBy?: string | null
}

/**
 * FNV-1a, 32-bit, hex. Not cryptographic and doesn't need to be — this only has to
 * change when the input changes, and collisions cost a stale briefing rather than
 * anything worse. Chosen over a crypto digest because it's synchronous: `crypto.subtle`
 * is async and would push a promise into render paths that only need a comparison.
 */
function hash(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/**
 * Identity of an analysis: everything the model was told, plus the brief telling it
 * how to say it.
 *
 * Covers ids, claims AND facts. Facts because "same findings, different numbers" is
 * stale even though every rule still fires. Claims because their wording is sent
 * upstream and shapes the prose, so improving a rule's phrasing in a deploy should
 * invalidate briefings written under the old one.
 *
 * `severity` is excluded deliberately: it only affects the order they're listed in,
 * which the narrator is told to ignore anyway.
 *
 * The voice brief is folded in because editing it changes what the prose should say,
 * which is exactly when a regenerate is worth prompting for.
 */
export function fingerprintFindings(findings: Finding[], prompt: string | undefined): string {
  const facts = findings.map(
    (f) => `${f.id}:${f.claim}:${Object.entries(f.facts).map(([k, v]) => `${k}=${v}`).join(',')}`,
  )
  const brief = (prompt ?? '').trim() || DEFAULT_ADVISOR_PROMPT
  return hash(`${facts.join('|')}#${hash(brief)}`)
}

/** Whether a cached entry still describes the current data. */
export function isStale(entry: AdvisorCacheEntry | null, fingerprint: string): boolean {
  return !!entry && entry.fingerprint !== fingerprint
}
