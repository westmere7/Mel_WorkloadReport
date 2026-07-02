import { useSyncExternalStore } from 'react'

// ── Dashboard display preferences ───────────────────────────────────────
// Edited on the Settings page (Dashboard card), read by the Dashboard.
// Persisted per-browser in localStorage; a reactive external store so both
// pages stay in sync without prop-drilling.

export type DemandDim = 'type' | 'asset'

export interface DashboardPrefs {
  /** Dimension of the "Demand by stakeholders" chart. */
  demandDim: DemandDim
  /** Exclude the ongoing/catch-all campaigns from the campaign charts. */
  hideCommonCampaigns: boolean
  /** Show the "Tasks by person" chart (hidden by default). */
  showTasksByPerson: boolean
}

/** Ongoing / catch-all campaigns that can be hidden from the campaign charts. */
export const COMMON_CAMPAIGNS = ['BAU', 'Always On', 'Others']

export const DEFAULT_DASHBOARD_PREFS: DashboardPrefs = {
  demandDim: 'asset',
  hideCommonCampaigns: true,
  showTasksByPerson: false,
}

const STORAGE_KEY = 'mwr.dashboardPrefs'

function load(): DashboardPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULT_DASHBOARD_PREFS, ...(JSON.parse(raw) as Partial<DashboardPrefs>) }
  } catch {
    /* fall through to defaults */
  }
  return DEFAULT_DASHBOARD_PREFS
}

let prefs: DashboardPrefs = load()
const listeners = new Set<() => void>()

export function setDashboardPrefs(patch: Partial<DashboardPrefs>): void {
  prefs = { ...prefs, ...patch }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    /* preference just won't persist */
  }
  listeners.forEach((l) => l())
}

export function useDashboardPrefs(): DashboardPrefs {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => prefs,
  )
}
