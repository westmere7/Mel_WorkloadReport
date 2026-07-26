import { useSyncExternalStore } from 'react'

// ── Dashboard display preferences ───────────────────────────────────────
// Edited on the Settings page (Dashboard card), read by the Dashboard.
// Persisted per-browser in localStorage; a reactive external store so both
// pages stay in sync without prop-drilling.

export type DemandDim = 'type' | 'asset'

/**
 * Unit for the "Workload across the year" chart only. 'assets' counts each
 * deliverable as 1 (the default, and what every other chart always does);
 * 'effort' weights each one by its asset type's recorded output rate. A local
 * VIEW toggle — it changes nothing stored, and nobody else's screen.
 */
export type WorkloadUnit = 'assets' | 'effort'

// NB: chart display GROUPS used to live here but moved into AppSettings.chartGroups
// so they sync across devices via Supabase (see types.ts / chartGroups.ts). What
// remains are lightweight, per-browser viewing toggles.

export interface DashboardPrefs {
  /** Dimension of the "Demand by stakeholders" chart. */
  demandDim: DemandDim
  /** Unit of the workload-across-the-year chart. Assets unless switched. */
  workloadUnit: WorkloadUnit
  /** Exclude the ongoing/catch-all campaigns from the campaign charts. */
  hideCommonCampaigns: boolean
  /** Apply chart display groups PER PANEL (local-only view toggles). Off = that
   *  panel shows every item individually, without deleting the configured groups. */
  groupAssetMix: boolean
  groupWorkTypeMix: boolean
  groupDemand: boolean
}

/** Ongoing / catch-all campaigns that can be hidden from the campaign charts. */
export const COMMON_CAMPAIGNS = ['BAU', 'Always On', 'Others']

export const DEFAULT_DASHBOARD_PREFS: DashboardPrefs = {
  demandDim: 'asset',
  workloadUnit: 'assets',
  hideCommonCampaigns: true,
  groupAssetMix: true,
  groupWorkTypeMix: true,
  groupDemand: true,
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
