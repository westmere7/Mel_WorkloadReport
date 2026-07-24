import { useEffect, useState } from 'react'
import { ChevronDown, RefreshCw, Sparkles, X } from 'lucide-react'
import { APP_VERSION, type Release } from '../lib/changelog'
import { cx } from '../lib/format'

/**
 * Update toast — polls `version.json` (published beside the built assets; see
 * vite.config.ts) and, when a NEWER version than this bundle is live, floats a
 * small panel over whatever the user is doing. Never force-reloads: the user
 * refreshes via the button, or dismisses ("Later" re-appears next session).
 * The new build's release notes ride along in version.json, collapsed by default.
 */

const POLL_MS = 5 * 60_000 // background poll cadence; also re-checks on tab focus
const DISMISS_KEY = 'mwr.updateDismissed'

/** True when `a` is a strictly newer semver-ish version than `b`. */
function isNewer(a: string, b: string): boolean {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d > 0
  }
  return false
}

interface VersionInfo {
  version: string
  releases?: Release[]
}

const KIND: Record<string, { label: string; cls: string }> = {
  new: { label: 'New', cls: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300' },
  improved: { label: 'Improved', cls: 'bg-navy-100 text-navy-700 dark:bg-navy-500/25 dark:text-navy-100' },
  fixed: { label: 'Fixed', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
}

export function UpdateNotice() {
  const [update, setUpdate] = useState<VersionInfo | null>(null)
  const [dismissed, setDismissed] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY)
    } catch {
      return null
    }
  })
  const [notesOpen, setNotesOpen] = useState(false)

  useEffect(() => {
    let stopped = false
    const check = async () => {
      try {
        const res = await fetch('/version.json', { cache: 'no-store' })
        if (!res.ok) return
        const info = (await res.json()) as VersionInfo
        if (!stopped && info?.version && isNewer(info.version, APP_VERSION)) setUpdate(info)
      } catch {
        /* offline / transient — try again next tick */
      }
    }
    void check()
    const timer = setInterval(check, POLL_MS)
    const onFocus = () => void check()
    const onVisible = () => document.visibilityState === 'visible' && void check()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  if (!update || dismissed === update.version) return null

  // Everything the user hasn't got yet (usually one release; more if they lag).
  const newReleases = (update.releases ?? []).filter((r) => isNewer(r.version, APP_VERSION))

  const dismiss = () => {
    setDismissed(update.version)
    try {
      sessionStorage.setItem(DISMISS_KEY, update.version)
    } catch {
      /* just won't persist */
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-[60] w-[22rem] max-w-[calc(100vw-2rem)]">
      <div className="card border border-line p-4 shadow-2xl ring-1 ring-black/10 dark:ring-white/10">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-rmit-red dark:bg-brand-500/15 dark:text-brand-300">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-ink">Update available</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              Version <strong className="text-ink">v{update.version}</strong> is live — you’re on v{APP_VERSION}.
              Refresh whenever you’re ready.
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            title="Dismiss for this session"
            aria-label="Dismiss update notice"
            className="-mr-1 -mt-1 rounded-md p-1 text-faint transition hover:bg-subtle hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {newReleases.length > 0 && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setNotesOpen((v) => !v)}
              aria-expanded={notesOpen}
              className="inline-flex items-center gap-1 text-xs font-semibold text-muted transition hover:text-ink"
            >
              What’s new
              <ChevronDown className={cx('h-3.5 w-3.5 transition-transform', notesOpen && 'rotate-180')} />
            </button>
            {notesOpen && (
              <div className="mt-2 max-h-56 space-y-3 overflow-y-auto rounded-lg bg-subtle/60 p-3">
                {newReleases.map((r) => (
                  <div key={r.version}>
                    <p className="text-xs font-bold text-ink">
                      v{r.version}
                      {r.title && <span className="font-medium text-muted"> · {r.title}</span>}
                    </p>
                    <ul className="mt-1.5 space-y-1.5">
                      {r.notes.map((n, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-muted">
                          <span
                            className={cx(
                              'mt-px shrink-0 rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide',
                              (KIND[n.kind] ?? KIND.new).cls,
                            )}
                          >
                            {(KIND[n.kind] ?? KIND.new).label}
                          </span>
                          <span className="leading-relaxed">{n.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className="btn-primary flex-1 !py-2 text-xs"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh now
          </button>
          <button type="button" className="btn-outline !py-2 text-xs" onClick={dismiss}>
            Later
          </button>
        </div>
      </div>
    </div>
  )
}
