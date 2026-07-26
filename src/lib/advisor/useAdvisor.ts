import { useCallback, useEffect, useMemo, useState } from 'react'
import { useStore } from '../../data/store'
import { useAuth } from '../auth'
import { toMessage } from '../format'
import { fingerprintFindings, isStale, type AdvisorCacheEntry } from './cache'
import { buildFindings, type Finding } from './findings'
import { isAdvisorEnabled, narrate } from './narrate'
import { buildAdvisorInput } from './scope'

// ─────────────────────────────────────────────────────────────────────────────
// Advisor · the hook the UI uses
//
// Owns the whole read path: findings from the current data, the stored briefing,
// whether that briefing still matches, and the one action that spends a model call.
//
// Reading NEVER generates. That's a hard rule, not an optimisation: the free tier
// allows 20 requests a day, so a component that generated on mount would exhaust it
// in a handful of page views. Generation happens only when someone asks for it.
// ─────────────────────────────────────────────────────────────────────────────

export interface AdvisorState {
  /** Findings over the whole record — always available, computed locally, free. */
  findings: Finding[]
  /** What was analysed, e.g. "2024–2026 · all GCMC functions · effort-weighted". */
  scopeLabel: string
  /** The stored briefing, or null when nothing has been generated yet. */
  cached: AdvisorCacheEntry | null
  /** True when the stored briefing predates the current data or voice brief. */
  stale: boolean
  /** Loading the stored briefing (not generating). */
  loading: boolean
  /** A model call is in flight. */
  generating: boolean
  error: string | null
  /** Whether generation is possible at all (build flag + Supabase configured). */
  enabled: boolean
  /** Whether THIS user may spend a call. */
  canGenerate: boolean
  /** Generate, store and return a fresh briefing. Rejects if `canGenerate` is false. */
  regenerate: () => Promise<void>
}

export function useAdvisor(): AdvisorState {
  const { tasks, settings, getAdvisorCache, saveAdvisorCache } = useStore()
  const { user, canEdit } = useAuth()

  const [cached, setCached] = useState<AdvisorCacheEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const input = useMemo(() => buildAdvisorInput(tasks, settings), [tasks, settings])
  const findings = useMemo(() => buildFindings(input), [input])
  const fingerprint = useMemo(
    () => fingerprintFindings(findings, settings.advisorPrompt),
    [findings, settings.advisorPrompt],
  )

  // Load per mount. Deliberately not re-fetched when the data changes: a changed
  // fingerprint makes the held copy show as stale, which is the intended signal —
  // re-reading wouldn't produce a newer text, only another round trip.
  //
  // NO once-only ref guard here: under StrictMode's double-mount the first
  // effect's result lands in a dead closure (`alive` is false) and a ref guard
  // then blocks the second mount from fetching at all — `loading` never clears.
  // A duplicate GET in dev is the cheap side of that trade.
  useEffect(() => {
    let alive = true
    getAdvisorCache()
      .then((entry) => alive && setCached(entry))
      .catch((e) => alive && setError(toMessage(e)))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [getAdvisorCache])

  const enabled = isAdvisorEnabled()
  // Anyone may read the stored briefing; only editors may spend a call against a
  // quota the whole team shares.
  const canGenerate = canEdit

  const regenerate = useCallback(async () => {
    if (!canGenerate || generating) return
    setGenerating(true)
    setError(null)
    try {
      const narration = await narrate({
        findings,
        scopeLabel: input.scopeLabel,
        effortOn: input.useEffort,
        people: settings.people,
        prompt: settings.advisorPrompt,
      })
      const entry: AdvisorCacheEntry = {
        fingerprint,
        text: narration.text,
        source: narration.source,
        model: narration.model,
        generatedAt: new Date().toISOString(),
        generatedBy: user ?? null,
      }
      // Show it even if storing fails — the call has already been spent, and losing
      // the text on top of that would be the worse outcome.
      setCached(entry)
      await saveAdvisorCache(entry).catch((e) => setError(toMessage(e)))
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setGenerating(false)
    }
  }, [
    canGenerate,
    generating,
    findings,
    input.scopeLabel,
    input.useEffort,
    settings.people,
    settings.advisorPrompt,
    fingerprint,
    user,
    saveAdvisorCache,
  ])

  return {
    findings,
    scopeLabel: input.scopeLabel,
    cached,
    stale: isStale(cached, fingerprint),
    loading,
    generating,
    error,
    enabled,
    canGenerate,
    regenerate,
  }
}
