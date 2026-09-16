// ─────────────────────────────────────────────────────────────────────────────
// Public holidays for the two places GCMC works from, plus RMIT's Christmas
// closure — for the Calendar page's day markers.
//
// Victoria's holidays are RULES (nth weekday, Easter) and are computed for any
// year; the one exception, Grand Final Friday, is gazetted year by year. Vietnam's
// lunar-calendar holidays (Tết, Hung Kings) and the government's bridging days
// can't be computed, so they are a TABLE of the official announcements. Anything
// beyond the table falls back to the fixed-date holidays only and is flagged
// `provisional` so the UI can say so rather than present a guess as fact.
//
// Sources (Sep 2026):
//   RMIT closure  https://www.rmit.edu.au/students/my-course/important-dates/2025/he
//                 https://www.rmit.edu.au/students/my-course/important-dates/2026/he
//   Vietnam 2026  https://en.baochinhphu.vn/ministry-of-home-affairs-announces-2026-holiday-schedule-111251017163421877.htm
//   Victoria      https://publicholidays.com.au/afl-grand-final-holiday/
// ─────────────────────────────────────────────────────────────────────────────

import type { CustomHoliday, HolidayScope } from '../types'

/** Where a holiday applies: Melbourne (Victoria), Vietnam, or RMIT's own closure. */
export type HolidayRegion = 'vic' | 'vn' | 'rmit'

export interface Holiday {
  /** ISO date, yyyy-mm-dd. */
  date: string
  name: string
  region: HolidayRegion
  /** Not yet officially confirmed for this year — shown, but labelled as such. */
  provisional?: boolean
  /** Defined by the team in Settings rather than a public holiday. */
  custom?: boolean
}

export const REGION_LABEL: Record<HolidayRegion, string> = {
  vic: 'Melbourne',
  vn: 'Vietnam',
  rmit: 'RMIT closed',
}

// ── date helpers (UTC throughout so no DST surprises) ────────────────────────

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`
const fromISO = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
const toISO = (dt: Date) => iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
const addDays = (s: string, n: number) => {
  const dt = fromISO(s)
  dt.setUTCDate(dt.getUTCDate() + n)
  return toISO(dt)
}
const weekday = (s: string) => fromISO(s).getUTCDay() // 0 = Sunday
const isWeekend = (s: string) => weekday(s) === 0 || weekday(s) === 6

/** Every day from `a` to `b` inclusive. */
export function eachDay(a: string, b: string): string[] {
  const out: string[] = []
  for (let d = a; d <= b; d = addDays(d, 1)) out.push(d)
  return out
}

/** The n-th given weekday of a month (n = 1..5), e.g. 2nd Monday of March. */
function nthWeekday(y: number, m: number, wd: number, n: number): string {
  const first = iso(y, m, 1)
  const offset = (wd - weekday(first) + 7) % 7
  return addDays(first, offset + (n - 1) * 7)
}

/** Easter Sunday (Gregorian) — the anonymous algorithm. */
function easterSunday(y: number): string {
  const a = y % 19
  const b = Math.floor(y / 100)
  const c = y % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return iso(y, month, day)
}

// ── Victoria ─────────────────────────────────────────────────────────────────

/**
 * Friday before the AFL Grand Final — the one Victorian holiday that is set year
 * by year rather than by rule. Beyond the table it's assumed to be the last Friday
 * of September and flagged provisional.
 */
const GRAND_FINAL_FRIDAY: Record<number, string> = {
  2023: '2023-09-29',
  2024: '2024-09-27',
  2025: '2025-09-26',
  2026: '2026-09-25',
}

function victoria(y: number): Holiday[] {
  const out: Holiday[] = []
  const add = (date: string, name: string, provisional = false) => out.push({ date, name, region: 'vic', provisional })

  // A fixed-date holiday that lands on a weekend moves to the next Monday
  // (Victoria: New Year's Day, Australia Day). ANZAC Day does NOT move.
  const weekendToMonday = (date: string, name: string) => {
    if (!isWeekend(date)) return add(date, name)
    add(addDays(date, weekday(date) === 6 ? 2 : 1), `${name} (substitute)`)
  }
  weekendToMonday(iso(y, 1, 1), "New Year's Day")
  weekendToMonday(iso(y, 1, 26), 'Australia Day')
  add(nthWeekday(y, 3, 1, 2), 'Labour Day')

  const easter = easterSunday(y)
  add(addDays(easter, -2), 'Good Friday')
  add(addDays(easter, -1), 'Saturday before Easter Sunday')
  add(easter, 'Easter Sunday')
  add(addDays(easter, 1), 'Easter Monday')

  add(iso(y, 4, 25), 'ANZAC Day')
  add(nthWeekday(y, 6, 1, 2), "King's Birthday")

  const gf = GRAND_FINAL_FRIDAY[y]
  if (gf) add(gf, 'Friday before the AFL Grand Final')
  else {
    // Last Friday of September.
    let d = iso(y, 9, 30)
    while (weekday(d) !== 5) d = addDays(d, -1)
    add(d, 'Friday before the AFL Grand Final', true)
  }

  add(nthWeekday(y, 11, 2, 1), 'Melbourne Cup Day')

  // Christmas and Boxing Day are observed on the day AND, when one falls on a
  // weekend, an extra weekday holiday follows — the next weekday not already taken.
  const taken = new Set<string>()
  for (const [date, name] of [
    [iso(y, 12, 25), 'Christmas Day'],
    [iso(y, 12, 26), 'Boxing Day'],
  ] as const) {
    add(date, name)
    taken.add(date)
    if (isWeekend(date)) {
      let sub = addDays(date, 1)
      while (isWeekend(sub) || taken.has(sub)) sub = addDays(sub, 1)
      add(sub, `${name} (additional)`)
      taken.add(sub)
    }
  }
  return out
}

// ── Vietnam ──────────────────────────────────────────────────────────────────

/**
 * Official holiday PERIODS per year — the whole announced break, including the
 * weekend days the government folds in and any bridging days, because those are
 * the days the Vietnam team is actually away. Statutory day counts are fixed by
 * law (Tết 5, National Day 2); the exact calendar placement is announced each
 * autumn for the following year.
 */
interface VnYear {
  tet: [string, string]
  hungKings: [string, string]
  reunificationLabour: [string, string]
  nationalDay: [string, string]
  provisional?: boolean
}
const VIETNAM: Record<number, VnYear> = {
  2024: {
    tet: ['2024-02-08', '2024-02-14'],
    hungKings: ['2024-04-18', '2024-04-18'],
    reunificationLabour: ['2024-04-27', '2024-05-01'],
    nationalDay: ['2024-08-31', '2024-09-03'],
  },
  2025: {
    tet: ['2025-01-25', '2025-02-02'],
    hungKings: ['2025-04-05', '2025-04-07'],
    reunificationLabour: ['2025-04-30', '2025-05-04'],
    nationalDay: ['2025-08-30', '2025-09-02'],
  },
  2026: {
    tet: ['2026-02-14', '2026-02-22'],
    hungKings: ['2026-04-25', '2026-04-27'],
    reunificationLabour: ['2026-04-30', '2026-05-03'],
    nationalDay: ['2026-08-29', '2026-09-02'],
  },
  // Ministry proposal (Tết 4–10 Feb); the final schedule is gazetted late 2026.
  2027: {
    tet: ['2027-02-04', '2027-02-10'],
    hungKings: ['2027-04-16', '2027-04-16'],
    reunificationLabour: ['2027-04-30', '2027-05-03'],
    nationalDay: ['2027-09-02', '2027-09-03'],
    provisional: true,
  },
}

function vietnam(y: number): Holiday[] {
  const out: Holiday[] = []
  const add = (date: string, name: string, provisional = false) => out.push({ date, name, region: 'vn', provisional })
  const range = ([a, b]: [string, string], name: string, provisional = false) =>
    eachDay(a, b).forEach((d) => add(d, name, provisional))

  // New Year's Day; a weekend falls to the following Monday.
  const ny = iso(y, 1, 1)
  if (isWeekend(ny)) add(addDays(ny, weekday(ny) === 6 ? 2 : 1), "New Year's Day (substitute)")
  else add(ny, "New Year's Day")

  const t = VIETNAM[y]
  if (t) {
    const p = Boolean(t.provisional)
    range(t.tet, 'Tết (Lunar New Year)', p)
    range(t.hungKings, "Hung Kings' Commemoration", p)
    range(t.reunificationLabour, 'Reunification Day & Labour Day', p)
    range(t.nationalDay, 'National Day', p)
  } else {
    // Off the table: only the fixed-date holidays can be placed, and Tết / Hung
    // Kings' are simply missing — say so rather than invent lunar dates.
    add(iso(y, 4, 30), 'Reunification Day', true)
    add(iso(y, 5, 1), 'Labour Day', true)
    add(iso(y, 9, 2), 'National Day', true)
  }
  return out
}

// ── RMIT closure ─────────────────────────────────────────────────────────────

/**
 * RMIT closes over Christmas and New Year — 25 December to 1 January inclusive in
 * both published years (2025: reopened Fri 2 Jan; 2026: reopens Mon 4 Jan). Both
 * ends land in the calendar year shown: the closure that STARTS this December and
 * the one that ENDS this 1 January.
 */
function rmitClosure(y: number): Holiday[] {
  const known = y >= 2025 && y <= 2026
  const mk = (date: string): Holiday => ({ date, name: 'RMIT Christmas closure', region: 'rmit', provisional: !known })
  return [...eachDay(iso(y, 12, 25), iso(y, 12, 31)).map(mk), mk(iso(y, 1, 1))]
}

// ── API ──────────────────────────────────────────────────────────────────────

// ── Team-defined holidays (Settings → Holidays) ─────────────────────────────

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

/**
 * Settings are stored as JSON and edited by hand in the DB now and then — accept
 * only well-formed entries and never let a bad one take the calendar down.
 */
export function normalizeCustomHolidays(raw: unknown): CustomHoliday[] {
  if (!Array.isArray(raw)) return []
  const out: CustomHoliday[] = []
  for (const v of raw) {
    if (!v || typeof v !== 'object') continue
    const r = v as Partial<CustomHoliday>
    if (typeof r.id !== 'string' || typeof r.name !== 'string' || !r.name.trim()) continue
    if (typeof r.start !== 'string' || !ISO_DAY.test(r.start)) continue
    const end = typeof r.end === 'string' && ISO_DAY.test(r.end) && r.end >= r.start ? r.end : r.start
    const scope: HolidayScope = r.scope === 'melbourne' || r.scope === 'vietnam' ? r.scope : 'all'
    out.push({ id: r.id, name: r.name.trim(), start: r.start, end, scope })
  }
  return out.sort((a, b) => a.start.localeCompare(b.start))
}

/** A team holiday as calendar entries: one per day, per region it applies to. */
function customToHolidays(list: CustomHoliday[], year: number): Holiday[] {
  const out: Holiday[] = []
  const y0 = `${year}-01-01`
  const y1 = `${year}-12-31`
  for (const c of list) {
    if (c.end < y0 || c.start > y1) continue
    const regions: HolidayRegion[] = c.scope === 'all' ? ['vic', 'vn'] : c.scope === 'melbourne' ? ['vic'] : ['vn']
    for (const date of eachDay(c.start < y0 ? y0 : c.start, c.end > y1 ? y1 : c.end)) {
      for (const region of regions) out.push({ date, name: c.name, region, custom: true })
    }
  }
  return out
}

/** Every holiday for the year — all three regions plus any team-defined days. */
export function holidaysForYear(year: number, custom: CustomHoliday[] = []): Holiday[] {
  return [...victoria(year), ...vietnam(year), ...rmitClosure(year), ...customToHolidays(custom, year)]
}

/** The same, indexed by ISO date. */
export function holidayIndex(year: number, custom: CustomHoliday[] = []): Map<string, Holiday[]> {
  const idx = new Map<string, Holiday[]>()
  for (const h of holidaysForYear(year, custom)) {
    const list = idx.get(h.date) ?? []
    list.push(h)
    idx.set(h.date, list)
  }
  return idx
}

/** True when this year's Vietnam dates come from an official announcement. */
export function vietnamConfirmed(year: number): boolean {
  const t = VIETNAM[year]
  return Boolean(t && !t.provisional)
}
