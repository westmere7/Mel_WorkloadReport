import { useEffect, useState } from 'react'
import { ChevronDown, RefreshCw, Sparkles } from 'lucide-react'
import { Modal } from './ui/Modal'
import { APP_VERSION, type Release } from '../lib/changelog'
import { cx } from '../lib/format'

/**
 * Update prompt — polls `version.json` (published beside the built assets; see
 * vite.config.ts) and, when a NEWER version than this bundle is live, opens a
 * centered modal over a darkened/blurred backdrop that blocks the app until the
 * user acts. Never force-reloads: they refresh via the button, or choose "Later"
 * (re-appears next session). The new build's release notes ride along in
 * version.json, collapsed by default.
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

  const open = !!update && dismissed !== update.version
  // Everything the user hasn't got yet (usually one release; more if they lag).
  const newReleases = (update?.releases ?? []).filter((r) => isNewer(r.version, APP_VERSION))

  const dismiss = () => {
    if (!update) return
    setDismissed(update.version)
    try {
      sessionStorage.setItem(DISMISS_KEY, update.version)
    } catch {
      /* just won't persist */
    }
  }

  return (
    <Modal
      open={open}
      onClose={dismiss}
      // Blocks the app: an explicit choice is required (backdrop clicks ignored).
      closeOnBackdrop={false}
      title={
        <span className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-rmit-red dark:bg-brand-500/15 dark:text-brand-300">
            <Sparkles className="h-4 w-4" />
          </span>
          Update available
        </span>
      }
      footer={
        <>
          <button type="button" className="btn-outline" onClick={dismiss}>
            Later
          </button>
          <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4" /> Refresh now
          </button>
        </>
      }
    >
      {update && (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-muted">
            Version <strong className="text-ink">v{update.version}</strong> is live — you’re on v{APP_VERSION}.
            Refresh whenever you’re ready; your work isn’t touched until you do.
          </p>

          {newReleases.length > 0 && (
            <div className="rounded-xl border border-line bg-subtle/40">
              <button
                type="button"
                onClick={() => setNotesOpen((v) => !v)}
                aria-expanded={notesOpen}
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-sm font-semibold text-ink"
              >
                What’s new
                <ChevronDown className={cx('h-4 w-4 text-muted transition-transform', notesOpen && 'rotate-180')} />
              </button>
              {notesOpen && (
                <div className="max-h-72 space-y-3 overflow-y-auto border-t border-line px-3 py-3">
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
        </div>
      )}
    </Modal>
  )
}
