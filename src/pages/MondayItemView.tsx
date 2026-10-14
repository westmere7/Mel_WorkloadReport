import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, ChevronDown, FolderPlus, GripVertical, Loader2, Minus, MoreHorizontal, Plus, X } from 'lucide-react'
import mondaySdk from 'monday-sdk-js'
import '@fontsource/figtree/400.css'
import '@fontsource/figtree/500.css'
import '@fontsource/figtree/600.css'
import '@fontsource/poppins/500.css'
import './mondayItemView.css'
import { useStore } from '../data/store'
import { formatDate } from '../lib/format'
import { mondayItemIdFromUrl } from '../lib/monday'
import type { AppSettings, Task } from '../types'

/*
 * monday.com Item View — /embed/item. The "Assets" tab of a monday item: the
 * team's asset LINES (a batch: # · name · type · quantity · person in charge ·
 * status · due · notes) and their progress. No per-unit done count — status only.
 *
 * - Lines are a flat list, numbered by position (# runs 1…N down the page). Users may add their OWN groups (free names,
 *   unrelated to asset types) and move lines into them; ungrouped lines sit on top.
 * - The linked dashboard task (matched by its monday link) is READ LIVE for its
 *   asset types and counts, shown as a comparison card. The tab never writes to
 *   the dashboard.
 * - Lines + groups are tab-only, saved per item in this browser's localStorage
 *   for the demo — the dashboard doesn't track who does which asset.
 * - Item id: monday's SDK context inside an item card; `?itemId=` when opened as a
 *   normal page (demo). Standalone, it also draws a monday-like item-card header.
 */

type Status = 'notStarted' | 'working' | 'stuck' | 'done'

interface AssetLine {
  id: string
  groupId: string | null
  name: string
  type: string
  fn: string | null
  owner: string | null
  qty: number
  status: Status
  due: string | null
  notes: string
}

interface LineGroup {
  id: string
  name: string
  color: string
}

interface Board {
  /** Display order: lines show in array order within their section (drag reorders it). */
  lines: AssetLine[]
  groups: LineGroup[]
}

const STORAGE_PREFIX = 'mwr.itemAssets.v3.'
const CONTEXT_TIMEOUT_MS = 4000

// monday's own status labels + colours.
const STATUS: Record<Status, { label: string; color: string }> = {
  notStarted: { label: 'Not started', color: '#c4c4c4' },
  working: { label: 'Working on it', color: '#fdab3d' },
  stuck: { label: 'Stuck', color: '#df2f4a' },
  done: { label: 'Done', color: '#00c875' },
}
const STATUS_ORDER: Status[] = ['notStarted', 'working', 'stuck', 'done']
/** Same order as the battery segments. */
const LEGEND_ORDER: Status[] = ['done', 'working', 'stuck', 'notStarted']
const SHORT_LABEL: Record<Status, string> = { done: 'done', working: 'working', stuck: 'stuck', notStarted: 'not started' }
const DETAILS_KEY = 'mwr.itemAssets.detailsOpen'
const UNPLANNED = '#e6e9ef'
const UNGROUPED_COLOR = '#c3c6d4'
// monday board-group colours.
const GROUP_COLORS = ['#579bfc', '#a25ddc', '#ff642e', '#037f4c', '#ff158a', '#0086c0', '#cab641', '#784bd1', '#00c875', '#e2445c']
const AVATAR_COLORS = ['#ff7575', '#579bfc', '#a25ddc', '#00a9a5', '#e2445c', '#037f4c', '#ff642e', '#784bd1', '#0086c0']

let idSeq = 0
const newId = () => `${Date.now().toString(36)}${(++idSeq).toString(36)}`
const planKey = (fn: string | null, type: string) => `${fn ?? ''}::${type}`

const EMPTY_BOARD: Board = { lines: [], groups: [] }

/** The saved board, or null when this item has never been opened in this browser. */
function loadBoard(itemId: string): Board | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + itemId)
    return raw ? { ...EMPTY_BOARD, ...(JSON.parse(raw) as Board) } : null
  } catch {
    return null
  }
}

// ── DEMO ONLY ───────────────────────────────────────────────────────────────
// First open of an item fills it with sample lines covering the dashboard's
// counts, each with a RANDOM person in charge from the task's people. Set to
// false (and drop the demo controls) once lines are stored for real.
const DEMO_SEED = true

const DEMO_NAMES: Record<string, string[]> = {
  'Static Designs': ['Instagram feed posts', 'Facebook carousel cards', 'Story frames', 'LinkedIn posts', 'EDM headers'],
  'Display ads': ['GDN banner suite', 'Programmatic MREC set', 'Retargeting banners'],
  'Videos (Short form)': ['TikTok cutdowns', 'Reels 15s', 'YouTube Shorts'],
  'Videos (30s+)': ['Hero video 60s', 'Testimonial edit'],
  'GIF / Motion': ['Animated social tiles', 'Motion banners'],
}

const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)]
const randInt = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1))

/** Split n into k random positive parts. */
function splitCount(n: number, k: number): number[] {
  const parts = Array.from({ length: k }, () => 1)
  for (let i = k; i < n; i++) parts[randInt(0, k - 1)]++
  return parts
}

function isoBetween(fromISO: string, toISO: string): string {
  const a = new Date(`${fromISO}T00:00:00`).getTime()
  const b = new Date(`${toISO}T00:00:00`).getTime()
  const d = new Date(a + Math.random() * Math.max(0, b - a))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function demoBoard(task: Task): Board {
  const people = task.people.length ? task.people : [null]
  const lines: AssetLine[] = []
  const today = new Date()
  const from = new Date(today.getTime() - 7 * 86_400_000).toISOString().slice(0, 10)
  const to = task.endDate && task.endDate > from ? task.endDate : new Date(today.getTime() + 21 * 86_400_000).toISOString().slice(0, 10)
  for (const s of dashboardSlices(task)) {
    for (const [type, count] of Object.entries(s.breakdown)) {
      if (!count) continue
      const names = DEMO_NAMES[type] ?? [`${type} batch`]
      const k = count <= 2 ? 1 : Math.min(names.length, count >= 50 ? 4 : count >= 10 ? 3 : 2)
      splitCount(count, k).forEach((qty, i) => {
        const r = Math.random()
        const status: Status = r < 0.35 ? 'done' : r < 0.65 ? 'working' : r < 0.72 ? 'stuck' : 'notStarted'
        lines.push({
          id: newId(),
          groupId: null,
          name: names[i % names.length] + (i >= names.length ? ` ${Math.floor(i / names.length) + 1}` : ''),
          type,
          fn: s.fn,
          owner: pick(people),
          qty,
          status,
          due: isoBetween(from, to),
          notes: '',
        })
      })
    }
  }
  return { lines, groups: [] }
}
// ────────────────────────────────────────────────────────────────────────────

function saveBoard(itemId: string, board: Board) {
  try {
    localStorage.setItem(STORAGE_PREFIX + itemId, JSON.stringify(board))
  } catch {
    /* storage blocked (private mode / partitioned frame) — keep in memory */
  }
}


function fnIndex(settings: AppSettings, name: string | null) {
  const i = name ? settings.functions.findIndex((f) => f.name === name) : -1
  return i < 0 ? Number.MAX_SAFE_INTEGER : i
}

/** The dashboard's asset counts per recording function (legacy task: one slice). */
function dashboardSlices(task: Task): { fn: string | null; breakdown: Record<string, number> }[] {
  const fd = task.functionData
  const slices = fd
    ? Object.entries(fd)
        .filter(([, e]) => e && e.assetTotal > 0)
        .map(([fn, e]) => ({ fn: fn as string | null, breakdown: e.assetBreakdown }))
    : []
  return slices.length ? slices : [{ fn: null, breakdown: task.assetBreakdown }]
}

interface PlanRow {
  key: string
  fn: string | null
  type: string
  /** Count on the dashboard (0 = type not on the dashboard). */
  planned: number
}

/** Dashboard types (function + asset-type order), then any extra types lines use. */
function planRows(task: Task, settings: AppSettings, lines: AssetLine[]): PlanRow[] {
  const typeOrder = (t: string) => {
    const i = settings.assetTypes.indexOf(t)
    return i < 0 ? Number.MAX_SAFE_INTEGER : i
  }
  const rows = new Map<string, PlanRow>()
  for (const s of dashboardSlices(task).sort((a, b) => fnIndex(settings, a.fn) - fnIndex(settings, b.fn)))
    Object.keys(s.breakdown)
      .filter((t) => (s.breakdown[t] ?? 0) > 0)
      .sort((a, b) => typeOrder(a) - typeOrder(b))
      .forEach((type) => rows.set(planKey(s.fn, type), { key: planKey(s.fn, type), fn: s.fn, type, planned: s.breakdown[type] }))
  for (const l of lines) {
    const key = planKey(l.fn, l.type)
    if (!rows.has(key)) rows.set(key, { key, fn: l.fn, type: l.type, planned: 0 })
  }
  return [...rows.values()]
}

/** Units by status for a set of lines, plus the dashboard units no line covers yet. */
function units(lines: AssetLine[], planned: number) {
  const u = { done: 0, working: 0, stuck: 0, notStarted: 0, unplanned: 0, inLines: 0 }
  for (const l of lines) {
    u[l.status] += l.qty
    u.inLines += l.qty
  }
  u.unplanned = Math.max(0, planned - u.inLines)
  return u
}

function avatarColor(name: string) {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

function initials(name: string) {
  const parts = name.replace(/[[\]()]/g, '').trim().split(/\s+/)
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2)).toUpperCase()
}

function Avatar({ name, size = 28 }: { name: string | null; size?: number }) {
  if (!name)
    return (
      <span
        className="mv-avatar mv-avatar-empty"
        style={{ width: size, height: size, fontSize: size * 0.5 }}
        title="No person in charge"
        aria-hidden
      >
        ?
      </span>
    )
  return (
    <span
      className="mv-avatar"
      style={{ width: size, height: size, fontSize: size * 0.4, backgroundColor: avatarColor(name) }}
      title={name}
      aria-hidden
    >
      {initials(name)}
    </span>
  )
}

function StatusPill({ status }: { status: Status }) {
  return (
    <span className="mv-status" style={{ background: STATUS[status].color }}>
      {STATUS[status].label}
    </span>
  )
}

function shortDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}
const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
}

export function MondayItemViewPage() {
  const [params] = useSearchParams()
  const paramItemId = params.get('itemId')
  const standalone = typeof window !== 'undefined' && window.self === window.top
  const { loading, error, tasks, settings } = useStore()
  const [itemId, setItemId] = useState<string | null>(paramItemId)
  const [waiting, setWaiting] = useState(!paramItemId && !standalone)

  // monday's light theme only (for now): drop the app's dark class while mounted.
  useEffect(() => {
    const root = document.documentElement
    const wasDark = root.classList.contains('dark')
    root.classList.remove('dark')
    return () => {
      if (wasDark) root.classList.add('dark')
    }
  }, [])

  // Inside a monday item card, monday tells us which item is open.
  useEffect(() => {
    if (paramItemId || standalone) return
    const timer = window.setTimeout(() => setWaiting(false), CONTEXT_TIMEOUT_MS)
    const unlisten = mondaySdk().listen('context', (res) => {
      const ctx = res.data as { itemId?: number }
      if (ctx.itemId) setItemId(String(ctx.itemId))
      window.clearTimeout(timer)
      setWaiting(false)
    })
    return () => {
      window.clearTimeout(timer)
      if (typeof unlisten === 'function') unlisten()
    }
  }, [paramItemId, standalone])

  const task = useMemo(
    () => (itemId ? tasks.find((t) => mondayItemIdFromUrl(t.mondayUrl) === itemId) ?? null : null),
    [tasks, itemId],
  )

  let body: React.ReactNode
  if (waiting || loading) {
    body = (
      <div className="mv-state">
        <Loader2 className="mv-spin" size={24} />
        Loading assets…
      </div>
    )
  } else if (error) {
    body = (
      <div className="mv-state">
        <strong>Couldn’t load assets</strong>
        {error}
      </div>
    )
  } else if (!itemId) {
    body = (
      <div className="mv-state">
        <strong>Open this from a monday.com item</strong>
        This tab shows the assets of the monday item it’s opened from.
      </div>
    )
  } else if (!task) {
    body = (
      <div className="mv-state">
        <strong>Not on the Workload dashboard yet</strong>
        No dashboard task is linked to this item. Register it on the dashboard (monday auto-fill links it) and its
        assets appear here.
      </div>
    )
  } else {
    body = <AssetsTab key={itemId} itemId={itemId} task={task} settings={settings} />
  }

  return (
    <div className="mv">
      {standalone && (
        <>
          <div className="mv-preview-banner">Preview: how this tab appears inside a monday.com item</div>
          <div className="mv-chrome">
            <div className="mv-chrome-top">
              <button type="button" className="mv-icon-btn" aria-label="Close" onClick={() => window.close()}>
                <X size={20} />
              </button>
              <h1 className="mv-chrome-title">{task?.name ?? 'monday.com item'}</h1>
            </div>
            <nav className="mv-tabs" aria-label="Item tabs">
              <span className="mv-tab">Updates</span>
              <span className="mv-tab">Files</span>
              <span className="mv-tab">Activity Log</span>
              <span className="mv-tab is-active" aria-current="page">
                Assets
              </span>
            </nav>
          </div>
        </>
      )}
      {body}
    </div>
  )
}

type LineSheet = { line: AssetLine; isNew: boolean } | null

/** Drop-target key for the ungrouped section. */
const NO_GROUP = '__none'
interface DragState {
  id: string
  label: string
  /** Section the line started in. */
  from: string
  x: number
  y: number
  /** Where it would land, if released now. */
  over: DropSpot | null
}
interface DropSpot {
  section: string
  /** Insert before this line id; null = end of the section. */
  before: string | null
}

/** A line's section key; a line whose group was deleted counts as ungrouped. */
function sectionOf(l: AssetLine, groups: LineGroup[]): string {
  return l.groupId && groups.some((g) => g.id === l.groupId) ? l.groupId : NO_GROUP
}

/** Move a line to a drop spot: re-section it and re-position it in the list order. */
function placeLine(b: Board, id: string, spot: DropSpot): Board {
  const line = b.lines.find((l) => l.id === id)
  if (!line) return b
  const moved = { ...line, groupId: spot.section === NO_GROUP ? null : spot.section }
  const rest = b.lines.filter((l) => l.id !== id)
  let at = spot.before ? rest.findIndex((l) => l.id === spot.before) : -1
  if (at < 0) {
    // End of the section: right after its last line (or the end of the list).
    let last = -1
    rest.forEach((l, i) => {
      if (sectionOf(l, b.groups) === spot.section) last = i
    })
    at = last < 0 ? rest.length : last + 1
  }
  if (at === b.lines.indexOf(line) && moved.groupId === line.groupId) return b // landed where it was
  rest.splice(at, 0, moved)
  return { ...b, lines: rest }
}
type GroupSheet = { group: LineGroup; isNew: boolean } | null

function AssetsTab({ itemId, task, settings }: { itemId: string; task: Task; settings: AppSettings }) {
  const [board, setBoardState] = useState<Board>(() => {
    const saved = loadBoard(itemId)
    if (saved) return saved
    const initial = DEMO_SEED ? demoBoard(task) : EMPTY_BOARD
    saveBoard(itemId, initial)
    return initial
  })
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  // Details fold — a per-viewer convenience, remembered in this browser.
  const [detailsOpen, setDetailsOpen] = useState(() => {
    try {
      return localStorage.getItem(DETAILS_KEY) === '1'
    } catch {
      return false
    }
  })
  const toggleDetails = () =>
    setDetailsOpen((o) => {
      try {
        localStorage.setItem(DETAILS_KEY, o ? '0' : '1')
      } catch {
        /* ignore */
      }
      return !o
    })
  const [lineSheet, setLineSheet] = useState<LineSheet>(null)
  const [groupSheet, setGroupSheet] = useState<GroupSheet>(null)
  const { lines, groups } = board

  const setBoard = (fn: (b: Board) => Board) =>
    setBoardState((prev) => {
      const next = fn(prev)
      saveBoard(itemId, next)
      return next
    })

  const plan = useMemo(() => planRows(task, settings, lines), [task, settings, lines])
  const fns = useMemo(() => dashboardSlices(task).map((s) => s.fn), [task])
  const multiFn = fns.filter(Boolean).length > 1

  const overall = useMemo(() => {
    const t = { done: 0, working: 0, stuck: 0, notStarted: 0, unplanned: 0, total: 0, planned: 0 }
    for (const p of plan) {
      const u = units(
        lines.filter((l) => planKey(l.fn, l.type) === p.key),
        p.planned,
      )
      t.done += u.done
      t.working += u.working
      t.stuck += u.stuck
      t.notStarted += u.notStarted
      t.unplanned += u.unplanned
      t.total += Math.max(p.planned, u.inLines)
      t.planned += p.planned
    }
    return t
  }, [plan, lines])

  const people = useMemo(() => {
    const map = new Map<string, { qty: number; done: number; lines: number }>()
    for (const l of lines) {
      if (!l.owner) continue
      const p = map.get(l.owner) ?? { qty: 0, done: 0, lines: 0 }
      p.qty += l.qty
      if (l.status === 'done') p.done += l.qty
      p.lines += 1
      map.set(l.owner, p)
    }
    return [...map.entries()].sort((a, b) => b[1].qty - a[1].qty)
  }, [lines])

  const pct = overall.total ? Math.round((overall.done / overall.total) * 100) : 0
  const seg = (n: number) => `${overall.total ? (n / overall.total) * 100 : 0}%`

  const upsertLine = (line: AssetLine) =>
    setBoard((b) =>
      b.lines.some((l) => l.id === line.id)
        ? { ...b, lines: b.lines.map((l) => (l.id === line.id ? line : l)) }
        : { ...b, lines: [...b.lines, line] },
    )
  const removeLine = (id: string) => setBoard((b) => ({ ...b, lines: b.lines.filter((l) => l.id !== id) }))
  const upsertGroup = (group: LineGroup) =>
    setBoard((b) => ({
      ...b,
      groups: b.groups.some((g) => g.id === group.id)
        ? b.groups.map((g) => (g.id === group.id ? group : g))
        : [...b.groups, group],
    }))
  // Deleting a group keeps its lines — they move back to "No group".
  const removeGroup = (id: string) =>
    setBoard((b) => ({
      ...b,
      groups: b.groups.filter((g) => g.id !== id),
      lines: b.lines.map((l) => (l.groupId === id ? { ...l, groupId: null } : l)),
    }))

  const blankLine = (groupId: string | null): AssetLine => ({
    id: newId(),
    groupId,
    name: '',
    type: plan[0]?.type ?? settings.assetTypes[0] ?? 'Others',
    fn: fns[0] ?? null,
    owner: null,
    qty: 1,
    status: 'notStarted',
    due: task.endDate,
    notes: '',
  })
  const blankGroup = (): LineGroup => ({
    id: newId(),
    name: '',
    color: GROUP_COLORS[groups.length % GROUP_COLORS.length],
  })

  const ungrouped = lines.filter((l) => sectionOf(l, groups) === NO_GROUP)
  const sections: { group: LineGroup | null; rows: AssetLine[] }[] = [
    { group: null, rows: ungrouped },
    ...groups.map((g) => ({ group: g, rows: lines.filter((l) => l.groupId === g.id) })),
  ]
  // # = position down the page (ungrouped first, then each group), so it always runs 1…N.
  const position = new Map<string, number>()
  sections.forEach(({ rows }) => rows.forEach((l) => position.set(l.id, position.size + 1)))

  const toggle = (key: string) =>
    setCollapsed((s) => {
      const next = new Set(s)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  // ── Drag to reorder / move between groups (pointer events, so touch works) ──
  // Sections carry data-drop = group id | NO_GROUP and rows data-line = id; the
  // drop spot is "before the first row whose midpoint is below the pointer".
  // The Group field in the line sheet stays the keyboard-accessible way to move.
  const [drag, setDragState] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const setDrag = (d: DragState | null) => {
    dragRef.current = d
    setDragState(d)
  }
  const dragging = drag !== null
  const canDrag = lines.length > 1 || groups.length > 0

  const moveLine = (id: string, spot: DropSpot) => setBoard((b) => placeLine(b, id, spot))

  const startDrag = (line: AssetLine, from: string) => (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    setDrag({ id: line.id, label: `${line.name} × ${line.qty}`, from, x: e.clientX, y: e.clientY, over: null })
  }

  useEffect(() => {
    if (!dragging) return
    const dropAt = (x: number, y: number): DropSpot | null => {
      const sec = document.elementFromPoint(x, y)?.closest('[data-drop]') as HTMLElement | null
      if (!sec?.dataset.drop) return null
      const next = [...sec.querySelectorAll<HTMLElement>('[data-line]')]
        .filter((r) => r.dataset.line !== dragRef.current?.id)
        .find((r) => {
          const b = r.getBoundingClientRect()
          return y < b.top + b.height / 2
        })
      return { section: sec.dataset.drop, before: next?.dataset.line ?? null }
    }
    const move = (e: PointerEvent) => {
      const d = dragRef.current
      if (d) setDrag({ ...d, x: e.clientX, y: e.clientY, over: dropAt(e.clientX, e.clientY) })
    }
    const end = (e: PointerEvent) => {
      const d = dragRef.current
      const spot = e.type === 'pointerup' ? dropAt(e.clientX, e.clientY) : null
      if (d && spot) moveLine(d.id, spot)
      setDrag(null)
    }
    // Auto-scroll while holding near the top/bottom edge (long lists, phones).
    let raf = 0
    const tick = () => {
      const d = dragRef.current
      if (d) {
        const edge = 72
        const h = window.innerHeight
        const dy = d.y < edge ? -(edge - d.y) / 3 : d.y > h - edge ? (d.y - (h - edge)) / 3 : 0
        if (dy) {
          window.scrollBy(0, dy)
          setDrag({ ...d, over: dropAt(d.x, d.y) })
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
    // moveLine/setDrag only touch state setters + the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging])

  const spotIsNoop = (d: DragState, rows: AssetLine[]) => {
    if (!d.over || d.over.section !== d.from) return false
    const i = rows.findIndex((l) => l.id === d.id)
    return i >= 0 && d.over.before === (rows[i + 1]?.id ?? null)
  }

  const groupName = (key: string | null) =>
    key === NO_GROUP ? 'No group' : groups.find((g) => g.id === key)?.name ?? null

  return (
    <div className={`mv-body${dragging ? ' is-dragging' : ''}`}>
      {/* Compact summary — the lines below are the point; details fold away. */}
      <section className="mv-summary" aria-label="Asset progress">
        <div className="mv-summary-top">
          <span className="mv-summary-count">
            <b>{overall.done}</b>/{overall.total} done
          </span>
          <span className="mv-summary-pct">{pct}%</span>
          <button
            type="button"
            className="mv-text-btn mv-details-toggle"
            aria-expanded={detailsOpen}
            onClick={() => toggleDetails()}
          >
            Details
            <ChevronDown size={14} style={{ transform: detailsOpen ? 'rotate(180deg)' : undefined }} />
          </button>
        </div>
        <div
          className="mv-battery"
          role="img"
          aria-label={`${overall.done} done, ${overall.working} working on it, ${overall.stuck} stuck, ${overall.notStarted} not started, ${overall.unplanned} not in a line yet`}
        >
          <span style={{ width: seg(overall.done), background: STATUS.done.color }} />
          <span style={{ width: seg(overall.working), background: STATUS.working.color }} />
          <span style={{ width: seg(overall.stuck), background: STATUS.stuck.color }} />
          <span style={{ width: seg(overall.notStarted), background: STATUS.notStarted.color }} />
        </div>
        <div className="mv-legend">
          {LEGEND_ORDER.filter((s) => s !== 'done' && overall[s] > 0).map((s) => (
            <span key={s} title={STATUS[s].label}>
              <i style={{ background: STATUS[s].color }} />
              {overall[s]} {SHORT_LABEL[s]}
            </span>
          ))}
          {overall.unplanned > 0 && (
            <span title="On the dashboard but not in a line yet">
              <i style={{ background: UNPLANNED }} />
              {overall.unplanned} not in a line
            </span>
          )}
        </div>

        {detailsOpen && (
          <div className="mv-details">
            <div className="mv-meta">
              {task.code && <span className="mv-code">{task.code}</span>}
              <span>
                {formatDate(task.startDate)} – {formatDate(task.endDate)}
              </span>
              <span className="mv-live" title="Asset types and counts update live from the Workload dashboard">
                Live from dashboard
              </span>
            </div>

            {/* Lines vs the dashboard's counts, per asset type */}
            <div className="mv-plan" aria-label="Lines compared with the dashboard">
              {plan.map((p) => {
                const inLines = lines.filter((l) => planKey(l.fn, l.type) === p.key).reduce((n, l) => n + l.qty, 0)
                const over = p.planned > 0 && inLines > p.planned
                return (
                  <div key={p.key} className="mv-plan-row">
                    <span className="mv-plan-name">
                      {p.type}
                      {multiFn && p.fn && <span className="mv-plan-fn"> · {p.fn}</span>}
                    </span>
                    <span className={`mv-plan-count${over ? ' mv-warn' : ''}`}>
                      {p.planned ? `${inLines}/${p.planned}` : `${inLines} · not on dashboard`}
                    </span>
                    <span className="mv-plan-bar">
                      <span
                        style={{
                          width: `${p.planned ? Math.min(100, (inLines / p.planned) * 100) : 100}%`,
                          background: over ? STATUS.stuck.color : '#579bfc',
                        }}
                      />
                    </span>
                  </div>
                )
              })}
              <p className="mv-plan-note">Assets in lines / on the dashboard</p>
            </div>

            {people.length > 0 && (
              <div className="mv-people" aria-label="Who's doing what">
                {people.map(([name, p]) => (
                  <div key={name} className="mv-person" title={`${p.lines} asset line${p.lines === 1 ? '' : 's'}`}>
                    <Avatar name={name} size={24} />
                    <span className="mv-person-name">{name}</span>
                    <span className="mv-person-count">
                      {p.done}/{p.qty}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <div className="mv-toolbar">
        <button
          type="button"
          className="mv-btn mv-btn-primary"
          onClick={() => setLineSheet({ line: blankLine(null), isNew: true })}
        >
          <Plus size={16} />
          New asset
        </button>
        <button
          type="button"
          className="mv-btn mv-btn-secondary"
          onClick={() => setGroupSheet({ group: blankGroup(), isNew: true })}
        >
          <FolderPlus size={16} />
          New group
        </button>
        <span className="mv-toolbar-note">
          {lines.length} {lines.length === 1 ? 'line' : 'lines'}
        </span>
      </div>

      {/* Lines: ungrouped first, then the user's groups */}
      {sections.map(({ group, rows }) => {
        // The ungrouped block is headerless until groups exist; hidden when empty then.
        // ...but shown as a drop target while a line is being dragged.
        if (!group && groups.length && !rows.length && !dragging) return null
        const key = group?.id ?? NO_GROUP
        const isTarget = !!drag?.over && drag.over.section === key && key !== drag.from
        const showInsert = !!drag?.over && drag.over.section === key && !spotIsNoop(drag, rows)
        const insertLine = <div className="mv-insert" aria-hidden />
        const open = !collapsed.has(key)
        const color = group?.color ?? UNGROUPED_COLOR
        const doneUnits = rows.reduce((n, l) => n + (l.status === 'done' ? l.qty : 0), 0)
        const qtyUnits = rows.reduce((n, l) => n + l.qty, 0)
        return (
          <section
            key={key}
            className={`mv-group${isTarget ? ' is-drop-target' : ''}`}
            data-drop={key}
            style={{ ['--mv-group' as string]: color }}
          >
            {(group || groups.length > 0) && (
              <div className="mv-group-bar">
                <button
                  type="button"
                  className={`mv-group-head${open ? '' : ' is-collapsed'}`}
                  aria-expanded={open}
                  onClick={() => toggle(key)}
                >
                  <ChevronDown size={18} color={group ? color : '#676879'} />
                  <span className="mv-group-title" style={{ color: group ? color : '#676879' }}>
                    {group?.name ?? 'No group'}
                  </span>
                  <span className="mv-group-count">
                    {rows.length} {rows.length === 1 ? 'line' : 'lines'}
                    {qtyUnits > 0 && ` · ${doneUnits}/${qtyUnits} done`}
                  </span>
                </button>
                {group && (
                  <button
                    type="button"
                    className="mv-icon-btn"
                    aria-label={`Group options for ${group.name}`}
                    onClick={() => setGroupSheet({ group, isNew: false })}
                  >
                    <MoreHorizontal size={18} />
                  </button>
                )}
              </div>
            )}
            {open && (
              <div className="mv-rows">
                {rows.map((l) => {
                  const complete = l.status === 'done'
                  const overdue = !complete && !!l.due && l.due < todayISO()
                  return (
                    <Fragment key={l.id}>
                    {showInsert && drag?.over?.before === l.id && insertLine}
                    <div data-line={l.id} className={`mv-row${drag?.id === l.id ? ' is-dragged' : ''}`}>
                      {canDrag && (
                        <span
                          className="mv-handle"
                          onPointerDown={startDrag(l, key)}
                          title="Drag to reorder or move to a group"
                          aria-hidden
                        >
                          <GripVertical size={16} />
                        </span>
                      )}
                      <button
                        type="button"
                        className="mv-row-main"
                        onClick={() => setLineSheet({ line: l, isNew: false })}
                      >
                        <span className="mv-no">#{position.get(l.id)}</span>
                        <Avatar name={l.owner} />
                        <span className="mv-row-text">
                          <span className={`mv-row-title${complete ? ' is-done' : ''}`}>
                            {l.name}
                            <span className="mv-qty">× {l.qty}</span>
                          </span>
                          <span className="mv-row-sub">
                            <StatusPill status={l.status} />
                            <span className="mv-type">{l.type}</span>
                            {l.due && (
                              <span className={overdue ? 'mv-overdue' : undefined}>
                                {overdue ? 'Overdue · ' : 'Due '}
                                {shortDate(l.due)}
                              </span>
                            )}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={complete}
                        className={`mv-check${complete ? ' is-done' : ''}`}
                        onClick={() => upsertLine({ ...l, status: complete ? 'notStarted' : 'done' })}
                        aria-label={`#${position.get(l.id)} ${l.name}: ${complete ? 'mark not done' : 'mark done'}`}
                        title={complete ? 'Mark not done' : 'Mark done'}
                      >
                        <Check size={16} strokeWidth={3} />
                      </button>
                    </div>
                    </Fragment>
                  )
                })}
                {showInsert && drag?.over?.before === null && rows.length > 0 && insertLine}
                {!rows.length && dragging && <div className="mv-drop-hint">Drop here</div>}
                <button
                  type="button"
                  className="mv-add-row"
                  onClick={() => setLineSheet({ line: blankLine(group?.id ?? null), isNew: true })}
                >
                  <Plus size={16} />
                  <span>{group ? `Add line to ${group.name}` : 'Add asset line'}</span>
                </button>
              </div>
            )}
          </section>
        )
      })}

      {drag && (
        <div className="mv-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden>
          <span className="mv-ghost-label">{drag.label}</span>
          {drag.over && drag.over.section !== drag.from && (
            <span className="mv-ghost-to">→ {groupName(drag.over.section)}</span>
          )}
        </div>
      )}

      {DEMO_SEED && (
        <div className="mv-demo-bar">
          <span>Demo data</span>
          <button type="button" className="mv-text-btn" onClick={() => setBoard(() => demoBoard(task))}>
            Shuffle sample lines
          </button>
          <button type="button" className="mv-text-btn" onClick={() => setBoard(() => EMPTY_BOARD)}>
            Clear all
          </button>
        </div>
      )}

      <p className="mv-footnote">
        The dashboard’s asset types and counts update live and are shown for comparison. Asset lines, groups, people
        in charge and progress are kept in this tab only and don’t change the dashboard.
      </p>

      {lineSheet && (
        <AssetSheet
          initial={lineSheet.line}
          isNew={lineSheet.isNew}
          position={position.get(lineSheet.line.id)}
          assetTypes={[...new Set([...plan.map((p) => p.type), ...settings.assetTypes])]}
          fns={multiFn ? (fns.filter(Boolean) as string[]) : []}
          groups={groups}
          taskPeople={task.people}
          teamPeople={settings.people}
          plannedFor={(fn, type) => plan.find((p) => p.key === planKey(fn, type))?.planned ?? 0}
          inLinesFor={(fn, type, exceptId) =>
            lines
              .filter((l) => planKey(l.fn, l.type) === planKey(fn, type) && l.id !== exceptId)
              .reduce((n, l) => n + l.qty, 0)
          }
          onSave={(line) => {
            upsertLine(line)
            setLineSheet(null)
          }}
          onDelete={
            lineSheet.isNew
              ? undefined
              : () => {
                  removeLine(lineSheet.line.id)
                  setLineSheet(null)
                }
          }
          onClose={() => setLineSheet(null)}
        />
      )}

      {groupSheet && (
        <GroupSheetView
          initial={groupSheet.group}
          isNew={groupSheet.isNew}
          lineCount={lines.filter((l) => l.groupId === groupSheet.group.id).length}
          onSave={(g) => {
            upsertGroup(g)
            setGroupSheet(null)
          }}
          onDelete={
            groupSheet.isNew
              ? undefined
              : () => {
                  removeGroup(groupSheet.group.id)
                  setGroupSheet(null)
                }
          }
          onClose={() => setGroupSheet(null)}
        />
      )}
    </div>
  )
}

function Sheet({
  title,
  onClose,
  footer,
  children,
}: {
  title: string
  onClose: () => void
  footer: React.ReactNode
  children: React.ReactNode
}) {
  useEscape(onClose)
  return (
    <div className="mv-overlay" onClick={onClose}>
      <div
        className="mv-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mv-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mv-sheet-head">
          <h2 id="mv-sheet-title" className="mv-sheet-title">
            {title}
          </h2>
          <button type="button" className="mv-icon-btn" aria-label="Close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="mv-sheet-body">{children}</div>
        <div className="mv-sheet-foot">{footer}</div>
      </div>
    </div>
  )
}

function AssetSheet({
  initial,
  isNew,
  position,
  assetTypes,
  fns,
  groups,
  taskPeople,
  teamPeople,
  plannedFor,
  inLinesFor,
  onSave,
  onDelete,
  onClose,
}: {
  initial: AssetLine
  isNew: boolean
  /** The line's # in the list (existing lines only). */
  position?: number
  assetTypes: string[]
  /** Functions to choose from (empty = single-function task, no picker). */
  fns: string[]
  groups: LineGroup[]
  taskPeople: string[]
  teamPeople: string[]
  plannedFor: (fn: string | null, type: string) => number
  inLinesFor: (fn: string | null, type: string, exceptId: string) => number
  onSave: (line: AssetLine) => void
  onDelete?: () => void
  onClose: () => void
}) {
  const [line, setLine] = useState<AssetLine>(initial)
  const [touched, setTouched] = useState(false)
  const rest = teamPeople.filter((p) => !taskPeople.includes(p))
  const [showRest, setShowRest] = useState(!!initial.owner && rest.includes(initial.owner))
  const planned = plannedFor(line.fn, line.type)
  const others = inLinesFor(line.fn, line.type, line.id)
  const nameMissing = !line.name.trim()

  const set = (patch: Partial<AssetLine>) => setLine((l) => ({ ...l, ...patch }))
  const setQty = (n: number) => set({ qty: Math.max(1, Math.round(n) || 1) })

  const chip = (name: string) => (
    <button
      key={name}
      type="button"
      className={`mv-chip${line.owner === name ? ' is-selected' : ''}`}
      aria-pressed={line.owner === name}
      onClick={() => set({ owner: line.owner === name ? null : name })}
    >
      <Avatar name={name} size={24} />
      {name}
    </button>
  )

  const save = () => {
    setTouched(true)
    if (nameMissing) return
    onSave({ ...line, name: line.name.trim(), notes: line.notes.trim() })
  }

  return (
    <Sheet
      title={isNew || !position ? 'New asset' : `Edit asset · #${position}`}
      onClose={onClose}
      footer={
        <>
          {onDelete && (
            <button type="button" className="mv-btn mv-btn-danger" onClick={onDelete}>
              Delete
            </button>
          )}
          <span className="mv-spacer" />
          <button type="button" className="mv-btn mv-btn-tertiary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="mv-btn mv-btn-primary" onClick={save}>
            {isNew ? 'Add asset' : 'Save'}
          </button>
        </>
      }
    >
      <div>
        <label className="mv-field-label" htmlFor="mv-name">
          Asset name
        </label>
        <input
          id="mv-name"
          className={`mv-input${touched && nameMissing ? ' is-error' : ''}`}
          value={line.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="e.g. Facebook carousel set"
          autoFocus={isNew}
        />
        {touched && nameMissing && <p className="mv-error">Give the asset a name.</p>}
      </div>

      <div className="mv-field-row">
        <div>
          <label className="mv-field-label" htmlFor="mv-type">
            Asset type
          </label>
          <select
            id="mv-type"
            className="mv-input mv-select"
            value={line.type}
            onChange={(e) => set({ type: e.target.value })}
          >
            {assetTypes.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mv-field-label" htmlFor="mv-group">
            Group
          </label>
          <select
            id="mv-group"
            className="mv-input mv-select"
            value={line.groupId ?? ''}
            onChange={(e) => set({ groupId: e.target.value || null })}
          >
            <option value="">No group</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        {fns.length > 0 && (
          <div>
            <label className="mv-field-label" htmlFor="mv-fn">
              Function
            </label>
            <select
              id="mv-fn"
              className="mv-input mv-select"
              value={line.fn ?? ''}
              onChange={(e) => set({ fn: e.target.value || null })}
            >
              {fns.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div>
        <p className="mv-field-label">
          Person in charge <span>Optional</span>
        </p>
        <p className="mv-subhead" style={{ marginTop: 0 }}>
          On this task
        </p>
        <div className="mv-chip-list">{taskPeople.map(chip)}</div>
        {rest.length > 0 &&
          (showRest ? (
            <>
              <p className="mv-subhead">Rest of the team</p>
              <div className="mv-chip-list">{rest.map(chip)}</div>
            </>
          ) : (
            <button type="button" className="mv-text-btn" onClick={() => setShowRest(true)}>
              Show everyone ({rest.length} more)
            </button>
          ))}
      </div>

      <div>
        <label className="mv-field-label" htmlFor="mv-qty">
          Quantity
          <span>{planned ? `${others} of ${planned} already in other lines` : 'This type isn’t on the dashboard'}</span>
        </label>
        <Stepper id="mv-qty" value={line.qty} min={1} onChange={setQty} />
      </div>

      <div>
        <p className="mv-field-label">Status</p>
        <div className="mv-status-picker" role="radiogroup" aria-label="Status">
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={line.status === s}
              className={`mv-status-opt${line.status === s ? ' is-selected' : ''}`}
              style={{ ['--mv-status' as string]: STATUS[s].color }}
              onClick={() => set({ status: s })}
            >
              {line.status === s && <Check size={14} strokeWidth={3} />}
              {STATUS[s].label}
            </button>
          ))}
        </div>
      </div>


      <div>
        <label className="mv-field-label" htmlFor="mv-due">
          Due date <span>Optional</span>
        </label>
        <input
          id="mv-due"
          type="date"
          className="mv-input"
          value={line.due ?? ''}
          onChange={(e) => set({ due: e.target.value || null })}
        />
      </div>

      <div>
        <label className="mv-field-label" htmlFor="mv-notes">
          Notes <span>Optional</span>
        </label>
        <textarea
          id="mv-notes"
          className="mv-input mv-textarea"
          rows={3}
          value={line.notes}
          onChange={(e) => set({ notes: e.target.value })}
          placeholder="Sizes, specs, links…"
        />
      </div>
    </Sheet>
  )
}

function GroupSheetView({
  initial,
  isNew,
  lineCount,
  onSave,
  onDelete,
  onClose,
}: {
  initial: LineGroup
  isNew: boolean
  lineCount: number
  onSave: (g: LineGroup) => void
  onDelete?: () => void
  onClose: () => void
}) {
  const [group, setGroup] = useState<LineGroup>(initial)
  const [touched, setTouched] = useState(false)
  const nameMissing = !group.name.trim()

  const save = () => {
    setTouched(true)
    if (nameMissing) return
    onSave({ ...group, name: group.name.trim() })
  }

  return (
    <Sheet
      title={isNew ? 'New group' : 'Group'}
      onClose={onClose}
      footer={
        <>
          {onDelete && (
            <button type="button" className="mv-btn mv-btn-danger" onClick={onDelete}>
              Delete group
            </button>
          )}
          <span className="mv-spacer" />
          <button type="button" className="mv-btn mv-btn-tertiary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="mv-btn mv-btn-primary" onClick={save}>
            {isNew ? 'Create group' : 'Save'}
          </button>
        </>
      }
    >
      <div>
        <label className="mv-field-label" htmlFor="mv-group-name">
          Group name
        </label>
        <input
          id="mv-group-name"
          className={`mv-input${touched && nameMissing ? ' is-error' : ''}`}
          value={group.name}
          onChange={(e) => setGroup((g) => ({ ...g, name: e.target.value }))}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder="e.g. Week 1 drop, Social, Round 2"
          autoFocus
        />
        {touched && nameMissing && <p className="mv-error">Give the group a name.</p>}
      </div>
      <div>
        <p className="mv-field-label">Colour</p>
        <div className="mv-swatches" role="radiogroup" aria-label="Group colour">
          {GROUP_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={group.color === c}
              aria-label={c}
              className={`mv-swatch${group.color === c ? ' is-selected' : ''}`}
              style={{ background: c }}
              onClick={() => setGroup((g) => ({ ...g, color: c }))}
            >
              {group.color === c && <Check size={14} strokeWidth={3} />}
            </button>
          ))}
        </div>
      </div>
      {!isNew && lineCount > 0 && (
        <p className="mv-hint">
          Deleting this group keeps its {lineCount} {lineCount === 1 ? 'line' : 'lines'}; they move to “No group”.
        </p>
      )}
    </Sheet>
  )
}

function Stepper({
  id,
  value,
  min,
  max,
  onChange,
}: {
  id: string
  value: number
  min: number
  max?: number
  onChange: (n: number) => void
}) {
  return (
    <div className="mv-stepper">
      <button
        type="button"
        className="mv-step-btn"
        aria-label="Decrease"
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
      >
        <Minus size={16} />
      </button>
      <input
        id={id}
        className="mv-input"
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <button
        type="button"
        className="mv-step-btn"
        aria-label="Increase"
        disabled={max !== undefined && value >= max}
        onClick={() => onChange(value + 1)}
      >
        <Plus size={16} />
      </button>
    </div>
  )
}
