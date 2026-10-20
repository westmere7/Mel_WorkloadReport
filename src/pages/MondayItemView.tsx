import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ArrowLeftRight,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  FileSpreadsheet,
  FolderPlus,
  GripVertical,
  Link2,
  Loader2,
  Minus,
  Moon,
  MoreHorizontal,
  Pencil,
  Plus,
  StickyNote,
  Sun,
  X,
} from 'lucide-react'
import mondaySdk from 'monday-sdk-js'
import '@fontsource/figtree/400.css'
import '@fontsource/figtree/500.css'
import '@fontsource/figtree/600.css'
import '@fontsource/poppins/500.css'
import './mondayItemView.css'
import { createRepository, useStore } from '../data/store'
import { toMessage } from '../lib/format'
import { assetsTabUrl, mondayItemIdFromUrl } from '../lib/monday'
import {
  AssetLinesNotSetUpError,
  EMPTY_BOARD,
  basisOf,
  basisOfLines,
  countsFromLines,
  isPoolShaped,
  linesFor,
  lineKey,
  packageOf,
  taskFunctions,
  withFunctions,
  type AssetBoard,
  type AssetLine,
  type LineGroup,
  type LineStatus,
} from '../lib/assetLines'
import type { AppSettings, Task, TaskInput } from '../types'
import { legacyOwnerName } from '../constants'

/*
 * monday.com Item View — /embed/item. The "Assets" tab of a monday item: the
 * task's asset LINES (batches: # · name · type · quantity · person in charge ·
 * status · due · notes), live and shared.
 *
 * Two links:
 * - GENERIC `/embed/item` → look a task up: monday item ID or link, task code, or
 *   part of its name (live suggestions; recent tasks one tap away). Any task works,
 *   monday-linked or not. (A plain monday Embed widget can't tell us which item it's
 *   on — the installed app will, via SDK context.)
 * - TASK-SPECIFIC `/embed/item?itemId=<monday id>` (linked tasks) or
 *   `?task=<task id>` (unlinked) → opens straight away (task form checklist icon,
 *   ⋯ → Copy link).
 *
 * Lines live in Supabase (`task_asset_lines`, one board per task) and update live.
 * They always add up to the task's dashboard counts: quantity edits here change
 * the counts there (edit-log entry included), and dashboard edits re-balance here
 * (lib/assetLines.ts).
 */

type Status = LineStatus

const CONTEXT_TIMEOUT_MS = 4000
const RECENT_KEY = 'mwr.itemAssets.recent'
const DETAILS_KEY = 'mwr.itemAssets.detailsOpen'
/** A viewer's own Light/Dark pick (footer switch) — wins over monday's / the link's theme. */
const THEME_KEY = 'mwr.itemAssets.theme'

// monday's own status labels + colours.
const STATUS: Record<Status, { label: string; color: string }> = {
  notStarted: { label: 'Not started', color: '#c4c4c4' },
  working: { label: 'In progress', color: '#fdab3d' },
  done: { label: 'Done', color: '#00c875' },
}
const STATUS_ORDER: Status[] = ['notStarted', 'working', 'done']
const SHORT_LABEL: Record<Status, string> = { done: 'done', working: 'in progress', notStarted: 'not started' }
const UNGROUPED_COLOR = 'var(--mv-ui-border)'

/** monday's themes. Light is the default; dark/black (night) come from monday's
 *  context once installed as an app, or `?theme=dark|black` when embedded/opened plainly. */
type MondayTheme = 'light' | 'dark' | 'black'
const THEME_BG: Record<MondayTheme, string> = { light: '#ffffff', dark: '#181b34', black: '#111111' }
const toTheme = (t: string | null | undefined): MondayTheme => (t === 'dark' || t === 'black' ? t : 'light')
// monday board-group colours.
const GROUP_COLORS = ['#579bfc', '#a25ddc', '#ff642e', '#037f4c', '#ff158a', '#0086c0', '#cab641', '#784bd1', '#00c875', '#e2445c']
const AVATAR_COLORS = ['#ff7575', '#579bfc', '#a25ddc', '#00a9a5', '#e2445c', '#037f4c', '#ff642e', '#784bd1', '#0086c0']

let idSeq = 0
const newId = () => `${Date.now().toString(36)}${(++idSeq).toString(36)}${Math.random().toString(36).slice(2, 6)}`
/** This page load — lets us ignore the realtime echo of our own saves. */
const CLIENT_ID = newId()

const keyOf = (l: AssetLine) => lineKey(l.fn, l.type)
const findTaskByItem = (tasks: Task[], itemId: string) => tasks.find((t) => mondayItemIdFromUrl(t.mondayUrl) === itemId)

/** A monday item id from what someone typed: the number itself, or a pasted item link. */
function parseItemInput(raw: string): string | null {
  const s = raw.trim()
  return mondayItemIdFromUrl(s) ?? (/^\d{6,}$/.test(s) ? s : null)
}

interface RecentTask {
  taskId?: string
  /** Older entries (before any-task lookup) only stored the monday item id. */
  itemId?: string
  code: string
  name: string
}
const recentTask = (tasks: Task[], r: RecentTask) =>
  (r.taskId ? tasks.find((t) => t.id === r.taskId) : r.itemId ? findTaskByItem(tasks, r.itemId) : undefined) ?? null
function loadRecent(): RecentTask[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as RecentTask[]
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}
function pushRecent(t: RecentTask) {
  try {
    const next = [t, ...loadRecent().filter((r) => r.taskId !== t.taskId)].slice(0, 6)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    /* storage blocked — recents are a convenience only */
  }
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

/** monday logo: in colour when the task is linked to a monday item, greyed when not. */
function MondayMark({ linked }: { linked: boolean }) {
  return (
    <img
      src="/monday.svg"
      alt={linked ? 'Linked to monday.com' : 'Not linked to monday.com'}
      title={linked ? 'Linked to monday.com' : 'Not linked to monday.com'}
      className={`mv-monday-mark${linked ? '' : ' is-off'}`}
      width={14}
      height={14}
    />
  )
}

function StatusPill({ status }: { status: Status }) {
  return (
    <span className="mv-status" style={{ background: STATUS[status].color }}>
      {STATUS[status].label}
    </span>
  )
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "15 Sep" — fixed 3-letter months (en-AU's "Sept" is wider and inconsistent). */
function shortDate(iso: string | null): string {
  const m = iso?.match(/^\d{4}-(\d{2})-(\d{2})/)
  return m ? `${Number(m[2])} ${MONTHS[Number(m[1]) - 1]}` : ''
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
  const [params, setParams] = useSearchParams()
  const paramItemId = params.get('itemId')
  const paramTaskId = params.get('task')
  const standalone = typeof window !== 'undefined' && window.self === window.top
  const { loading, error, tasks, settings } = useStore()
  // Which task: the task-specific link (?itemId / ?task), monday's app context, or
  // the generic link's lookup (only the last two can be changed in place).
  const [contextId, setContextId] = useState<string | null>(null)
  const [pickedTaskId, setPickedTaskId] = useState<string | null>(null)
  const [contextWaiting, setContextWaiting] = useState(false)
  const chosen = paramItemId ?? paramTaskId ?? contextId ?? pickedTaskId
  // monday's own theme (app context) wins over ?theme=; default light.
  const [mondayTheme, setMondayTheme] = useState<string | null>(null)
  const [userTheme, setUserThemeState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(THEME_KEY)
    } catch {
      return null
    }
  })
  const setUserTheme = (t: MondayTheme) => {
    setUserThemeState(t)
    try {
      localStorage.setItem(THEME_KEY, t)
    } catch {
      /* storage blocked — the switch still works for this visit */
    }
  }
  const theme = toTheme(userTheme ?? mondayTheme ?? params.get('theme'))

  // This page uses its own monday palette: drop the app's dark class while
  // mounted, and paint html/body in the theme colour (no light flash on overscroll).
  useEffect(() => {
    const root = document.documentElement
    const wasDark = root.classList.contains('dark')
    root.classList.remove('dark')
    return () => {
      if (wasDark) root.classList.add('dark')
    }
  }, [])
  useEffect(() => {
    const els = [document.documentElement, document.body]
    els.forEach((el) => (el.style.backgroundColor = THEME_BG[theme]))
    return () => els.forEach((el) => (el.style.backgroundColor = ''))
  }, [theme])

  // Inside monday (installed app), monday sends the open item + its theme. A plain
  // embed never answers — the ID box shows meanwhile, so nobody waits on it.
  useEffect(() => {
    if (standalone) return
    setContextWaiting(true)
    const timer = window.setTimeout(() => setContextWaiting(false), CONTEXT_TIMEOUT_MS)
    const unlisten = mondaySdk().listen('context', (res) => {
      const ctx = res.data as { itemId?: number; theme?: string }
      if (ctx.theme) setMondayTheme(ctx.theme)
      if (ctx.itemId) setContextId(String(ctx.itemId))
      window.clearTimeout(timer)
      setContextWaiting(false)
    })
    return () => {
      window.clearTimeout(timer)
      if (typeof unlisten === 'function') unlisten()
    }
  }, [standalone])

  const task = useMemo(() => {
    if (paramItemId) return findTaskByItem(tasks, paramItemId) ?? null
    if (paramTaskId) return tasks.find((t) => t.id === paramTaskId) ?? null
    if (contextId) return findTaskByItem(tasks, contextId) ?? null
    if (pickedTaskId) return tasks.find((t) => t.id === pickedTaskId) ?? null
    return null
  }, [tasks, paramItemId, paramTaskId, contextId, pickedTaskId])

  // Remember opened tasks for the generic link's "Recent" list.
  useEffect(() => {
    if (task) pushRecent({ taskId: task.id, code: task.code, name: task.name })
  }, [task])

  const changeTask = () => {
    setPickedTaskId(null)
    if (paramItemId || paramTaskId) {
      const next = new URLSearchParams(params)
      next.delete('itemId')
      next.delete('task')
      setParams(next, { replace: true })
    }
  }

  let body: React.ReactNode
  if (loading) {
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
  } else if (!chosen) {
    body = <TaskPicker tasks={tasks} waiting={contextWaiting} onPick={setPickedTaskId} />
  } else if (!task) {
    body = (
      <div className="mv-state">
        <strong>Not on the Workload dashboard yet</strong>
        {paramTaskId ? 'This task no longer exists.' : `No dashboard task is linked to monday item ${chosen}.`}
        {!contextId && (
          <button type="button" className="mv-text-btn" onClick={changeTask}>
            Look up another task
          </button>
        )}
      </div>
    )
  } else {
    body = (
      <AssetsTab
        key={task.id}
        task={task}
        settings={settings}
        theme={theme}
        // In the installed app the item is fixed by monday; elsewhere it can change.
        onChangeTask={contextId ? undefined : changeTask}
      />
    )
  }

  return (
    // Inside a monday widget (iframe) the panel gives no inset of its own — `is-embedded` adds one.
    <div className={`mv mv-theme-${theme}${standalone ? '' : ' is-embedded'}`}>
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
      <footer className="mv-footer">
        <div className="mv-theme-switch" role="radiogroup" aria-label="Theme">
          {(
            [
              ['light', 'Light', Sun],
              ['dark', 'Dark', Moon],
            ] as const
          ).map(([value, label, Icon]) => {
            const on = value === 'dark' ? theme !== 'light' : theme === 'light'
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={`${label} theme`}
                title={`${label} theme`}
                className={`mv-theme-opt${on ? ' is-on' : ''}`}
                onClick={() => setUserTheme(value)}
              >
                <Icon size={14} />
              </button>
            )
          })}
        </div>
      </footer>
    </div>
  )
}

/** The generic link's start screen: look a task up by monday item ID / link, task
 *  code, or part of its name. Any task can be opened — a monday link is optional. */
function TaskPicker({
  tasks,
  waiting,
  onPick,
}: {
  tasks: Task[]
  /** Still listening for monday's app context (installed app). */
  waiting: boolean
  onPick: (taskId: string) => void
}) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recent = useMemo(
    () =>
      loadRecent()
        .map((r) => recentTask(tasks, r))
        .filter((t): t is Task => !!t)
        .filter((t, i, all) => all.findIndex((x) => x.id === t.id) === i),
    [tasks],
  )
  const q = value.trim().toLowerCase()
  // Live suggestions: code or name contains what's typed (codes first, newest first).
  const matches = useMemo(() => {
    if (q.length < 2) return []
    return tasks
      .filter((t) => t.code.toLowerCase().includes(q) || t.name.toLowerCase().includes(q))
      .sort((a, b) => Number(b.code.toLowerCase().includes(q)) - Number(a.code.toLowerCase().includes(q)) || b.createdAt.localeCompare(a.createdAt))
      .slice(0, 8)
  }, [tasks, q])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!q) return setError('Type a task code, name or monday item ID.')
    const itemId = parseItemInput(value)
    const hit =
      (itemId && findTaskByItem(tasks, itemId)) ||
      tasks.find((t) => t.code && t.code.toLowerCase() === q) ||
      (matches.length === 1 ? matches[0] : undefined)
    if (hit) return onPick(hit.id)
    if (itemId) return setError(`No dashboard task is linked to monday item ${itemId}.`)
    setError(matches.length ? 'Pick one of the tasks below.' : 'No task matches.')
  }

  const row = (t: Task) => (
    <button key={t.id} type="button" className="mv-recent-item" onClick={() => onPick(t.id)}>
      <MondayMark linked={!!mondayItemIdFromUrl(t.mondayUrl)} />
      {t.code && <span className="mv-code">{t.code}</span>}
      <span className="mv-recent-name">{t.name}</span>
    </button>
  )

  return (
    <div className="mv-body">
      <div className="mv-picker">
        <h2 className="mv-picker-title">Show a task’s assets</h2>
        <p className="mv-hint">Task code, task name, or the monday item ID / link.</p>
        <form className="mv-picker-form" onSubmit={submit}>
          <input
            className={`mv-input${error ? ' is-error' : ''}`}
            aria-label="Find a task"
            placeholder="e.g. 26.0113.A"
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setError(null)
            }}
            autoFocus
          />
          <button type="submit" className="mv-btn mv-btn-primary">
            Open
          </button>
        </form>
        {error && <p className="mv-error">{error}</p>}
        {matches.length > 0 && <div className="mv-recent">{matches.map(row)}</div>}
        {waiting && <p className="mv-hint mv-picker-wait">Checking monday…</p>}
        {!matches.length && recent.length > 0 && (
          <>
            <p className="mv-subhead">Recent</p>
            <div className="mv-recent">{recent.map(row)}</div>
          </>
        )}
      </div>
    </div>
  )
}

type LineSheet = { line: AssetLine; isNew: boolean } | null
/** An edit, as a pure function of a board — re-applied to the latest saved board on save. */
type BoardOp = (b: Pick<AssetBoard, 'lines' | 'groups' | 'tracker'>) => Pick<AssetBoard, 'lines' | 'groups' | 'tracker'>
type GroupSheet = { group: LineGroup; isNew: boolean } | null

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

/** Move a line to a drop spot: re-section it and re-position it. Null = no change. */
function placeLine(lines: AssetLine[], groups: LineGroup[], id: string, spot: DropSpot): AssetLine[] | null {
  const line = lines.find((l) => l.id === id)
  if (!line) return null
  const moved = { ...line, groupId: spot.section === NO_GROUP ? null : spot.section }
  const rest = lines.filter((l) => l.id !== id)
  let at = spot.before ? rest.findIndex((l) => l.id === spot.before) : -1
  if (at < 0) {
    // End of the section: right after its last line (or the end of the list).
    let last = -1
    rest.forEach((l, i) => {
      if (sectionOf(l, groups) === spot.section) last = i
    })
    at = last < 0 ? rest.length : last + 1
  }
  if (at === lines.indexOf(line) && moved.groupId === line.groupId) return null // landed where it was
  rest.splice(at, 0, moved)
  return rest
}

function AssetsTab({
  task,
  settings,
  theme,
  onChangeTask,
}: {
  task: Task
  settings: AppSettings
  theme: MondayTheme
  onChangeTask?: () => void
}) {
  const { updateTask, tasks } = useStore()
  const repo = useMemo(createRepository, [])
  const [board, setBoardState] = useState<AssetBoard>(EMPTY_BOARD)
  const boardRef = useRef(board)
  const setBoard = (b: AssetBoard) => {
    boardRef.current = b
    setBoardState(b)
  }
  const [loaded, setLoaded] = useState(false)
  const [setupMissing, setSetupMissing] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [inflight, setInflight] = useState(0)
  const [copied, setCopied] = useState(false)

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
  const [trackerOpen, setTrackerOpen] = useState(false)
  const [mondayOpen, setMondayOpen] = useState(false)

  // ── Load the board + follow live changes from every other viewer ──
  useEffect(() => {
    let alive = true
    repo
      .getAssetBoard(task.id)
      .then((b) => {
        if (alive && b && b.rev >= boardRef.current.rev) setBoard(b)
      })
      .catch((err) => {
        if (!alive) return
        if (err instanceof AssetLinesNotSetUpError) setSetupMissing(true)
        else setSaveError(toMessage(err))
      })
      .finally(() => alive && setLoaded(true))
    const off = repo.subscribeAssetBoard(task.id, (b) => {
      if (!b) return
      if (b.by === CLIENT_ID && b.rev <= boardRef.current.rev) return // echo of our own save
      setBoard(b)
    })
    return () => {
      alive = false
      off()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, task.id])

  // Lines as shown: the saved board when it matches the dashboard's counts, else
  // re-balanced to them (a dashboard edit, or a task nobody has split yet).
  const taskBasis = basisOf(task)
  const lines = useMemo(
    () => (inflight > 0 ? board.lines : linesFor(board, task, settings)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inflight, board, taskBasis, task, settings],
  )
  const { groups } = board
  // No editing until the board has loaded (and we know saving works).
  const readOnly = setupMissing || !loaded

  // The latest task, for saves that finish after a re-render.
  const taskRef = useRef(task)
  taskRef.current = task

  // A dashboard edit is NOT saved back automatically: every viewer derives the same
  // re-balanced lines, and the next real edit stores them. (Auto-saving raced another
  // viewer's edit — its new counts can land before its lines and get overwritten.)

  /**
   * Apply an edit. Edits are OPERATIONS on lines by id, so several people can work
   * on the same task at once: the op is shown immediately, then re-applied to the
   * LATEST saved board and written with a compare-and-swap on `rev` (retried if
   * someone saved in between). Changed totals then go to the dashboard task.
   */
  const apply = async (op: BoardOp) => {
    if (readOnly) return
    const optimistic = op({ lines, groups, tracker: boardRef.current.tracker })
    const shown = withFunctions(optimistic.lines, task, legacyOwner)
    setBoard({ ...boardRef.current, ...optimistic, lines: shown, basis: basisOfLines(shown) })
    setInflight((n) => n + 1)
    try {
      let saved: AssetBoard | null = null
      let t = taskRef.current
      for (let attempt = 0; attempt < 6 && !saved; attempt++) {
        // Fresh task + board: build on what's really saved, not on this tab's copy.
        t = (await repo.getTask(task.id)) ?? taskRef.current
        const server = await repo.getAssetBoard(t.id)
        const base = server ?? EMPTY_BOARD
        const res = op({ lines: linesFor(base, t, settings), groups: base.groups, tracker: base.tracker })
        const resLines = withFunctions(res.lines, t, legacyOwner)
        const next: AssetBoard = {
          ...res,
          lines: resLines,
          basis: basisOfLines(resLines),
          fromBasis: basisOf(t),
          rev: base.rev + 1,
          by: CLIENT_ID,
        }
        if (await repo.saveAssetBoardIf(t.id, next, server ? base.rev : null)) saved = next
      }
      if (!saved) throw new Error('Others are editing this task right now — please try again.')
      setBoard(saved)
      setSaveError(null)
      if (saved.basis !== basisOf(t)) {
        const { id: _id, createdAt: _c, updatedAt: _u, createdBy: _b, ...input } = t
        await updateTask(t.id, { ...input, ...countsFromLines(saved.lines, t) } as TaskInput)
      }
    } catch (err) {
      if (err instanceof AssetLinesNotSetUpError) setSetupMissing(true)
      setSaveError(toMessage(err))
    } finally {
      setInflight((n) => n - 1)
    }
  }

  const addLine = (line: AssetLine) => apply((b) => ({ ...b, lines: [...b.lines, line] }))
  /** Change only the fields that were edited — others' edits to the same line survive. */
  const patchLine = (id: string, patch: Partial<AssetLine>) =>
    apply((b) => ({ ...b, lines: b.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) }))
  const removeLine = (id: string) => apply((b) => ({ ...b, lines: b.lines.filter((l) => l.id !== id) }))
  const upsertGroup = (group: LineGroup) =>
    apply((b) => ({
      ...b,
      groups: b.groups.some((g) => g.id === group.id) ? b.groups.map((g) => (g.id === group.id ? group : g)) : [...b.groups, group],
    }))
  // Deleting a group keeps its lines — they move back to "No group".
  const removeGroup = (id: string) =>
    apply((b) => ({
      ...b,
      lines: b.lines.map((l) => (l.groupId === id ? { ...l, groupId: null } : l)),
      groups: b.groups.filter((g) => g.id !== id),
    }))
  /** Link / unlink the task's monday item — saved on the dashboard task itself. */
  const saveMondayLink = async (url: string | null) => {
    const t = taskRef.current
    const { id: _id, createdAt: _c, updatedAt: _u, createdBy: _b, ...input } = t
    try {
      await updateTask(t.id, { ...input, mondayUrl: url ?? undefined } as TaskInput)
      setSaveError(null)
    } catch (err) {
      setSaveError(toMessage(err))
    }
  }
  const mondayItem = mondayItemIdFromUrl(task.mondayUrl)

  /** Set or clear the tracker link (no effect on lines or counts). */
  const saveTracker = (url: string | null) => apply((b) => ({ ...b, tracker: url }))

  const pkg = useMemo(() => packageOf(task, settings), [task, settings])
  const fns = useMemo(() => taskFunctions(task), [task])
  const legacyOwner = legacyOwnerName(settings.functions)
  // Every configured function can take lines (a new one gets its own dashboard slice).
  const fnOptions = useMemo(
    () => [...new Set([...settings.functions.map((f) => f.name), ...(fns.filter(Boolean) as string[])])],
    [settings.functions, fns],
  )
  // Show the function on rows/details only when more than one is in play.
  const multiFn = new Set([...fns.filter(Boolean), ...lines.map((l) => l.fn).filter(Boolean)]).size > 1

  const overall = useMemo(() => {
    const t = { done: 0, working: 0, notStarted: 0, unassigned: 0, total: 0 }
    for (const l of lines) {
      t[l.status] += l.qty
      t.total += l.qty
      if (l.pool) t.unassigned += l.qty
    }
    return t
  }, [lines])

  const people = useMemo(() => {
    const map = new Map<string, { qty: number; done: number; lines: number }>()
    for (const l of lines) {
      for (const owner of l.owners) {
        const p = map.get(owner) ?? { qty: 0, done: 0, lines: 0 }
        p.qty += l.qty
        if (l.status === 'done') p.done += l.qty
        p.lines += 1
        map.set(owner, p)
      }
    }
    return [...map.entries()].sort((a, b) => b[1].qty - a[1].qty)
  }, [lines])

  const pct = overall.total ? Math.round((overall.done / overall.total) * 100) : 0
  const seg = (n: number) => `${overall.total ? (n / overall.total) * 100 : 0}%`

  /** Asset types offered for a function: its configured list, plus whatever the task already has. */
  const typesFor = (fn: string | null) => {
    const configured = (fn && settings.functions.find((f) => f.name === fn)?.assetTypes) || settings.assetTypes
    return [...new Set([...pkg.filter((p) => p.fn === fn).map((p) => p.type), ...configured])]
  }

  const blankLine = (groupId: string | null): AssetLine => ({
    id: newId(),
    groupId,
    name: '',
    type: pkg[0]?.type ?? typesFor(fns[0] ?? null)[0] ?? 'Others',
    fn: pkg[0]?.fn ?? fns[0] ?? null,
    owners: [],
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

  const copyLink = async () => {
    const url = `${window.location.origin}${assetsTabUrl(task.mondayUrl, task.id)}${theme === 'light' ? '' : `&theme=${theme}`}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard can be blocked inside an embed — let them copy it by hand.
      window.prompt('Copy this task’s Assets link:', url)
    }
  }

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
  const canDrag = !readOnly && (lines.length > 1 || groups.length > 0)
  // The drop handler runs inside a window listener: read the latest lines via a ref.
  const latest = useRef({ lines, groups, apply })
  latest.current = { lines, groups, apply }

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
      if (d && spot) {
        const { lines: ls, groups: gs, apply: run } = latest.current
        // Only drop when it actually moves; then re-apply the move to the latest board.
        if (placeLine(ls, gs, d.id, spot)) void run((b) => ({ ...b, lines: placeLine(b.lines, b.groups, d.id, spot) ?? b.lines }))
      }
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
      {/* Which task this is: one compact row; tracker up front, the rest in ⋯ */}
      <div className="mv-taskbar">
        <div className="mv-taskbar-main">
          <p className="mv-taskbar-name" title={task.name}>
            {task.name}
          </p>
          <p className="mv-meta-line" title="Updates live from the dashboard and other viewers">
            <MondayMark linked={!!mondayItem} />
            {task.code && <span className="mv-code">{task.code}</span>}
            <span className="mv-meta-dates">
              {shortDate(task.startDate) || '—'} – {shortDate(task.endDate) || '—'}
            </span>
          </p>
          {!mondayItem && (
            <p className="mv-link-hint">
              Not linked to monday.com ·{' '}
              <button type="button" className="mv-text-btn" onClick={() => setMondayOpen(true)}>
                Link it
              </button>
            </p>
          )}
        </div>
        {copied && <span className="mv-saving">Link copied</span>}
        {board.tracker ? (
          <a
            className="mv-btn mv-btn-secondary mv-tracker-btn"
            href={board.tracker}
            target="_blank"
            rel="noopener noreferrer"
            title="Open the asset tracker"
          >
            <FileSpreadsheet size={16} className="mv-tracker-icon" />
            Asset tracker
            <ExternalLink size={13} />
          </a>
        ) : (
          !readOnly && (
            <button type="button" className="mv-btn mv-tracker-add" onClick={() => setTrackerOpen(true)}>
              <Plus size={14} />
              Asset tracker
            </button>
          )
        )}
        <Menu
          label="Task options"
          items={[
            { label: 'Copy link to this task', icon: <Copy size={16} />, onClick: copyLink },
            ...(task.mondayUrl && mondayItem
              ? [
                  {
                    label: 'Open in monday.com',
                    icon: <img src="/monday.svg" alt="" width={16} height={16} />,
                    onClick: () => window.open(task.mondayUrl, '_blank', 'noopener'),
                  },
                ]
              : []),
            {
              label: mondayItem ? 'Change monday.com link' : 'Link to monday.com',
              icon: <Link2 size={16} />,
              onClick: () => setMondayOpen(true),
            },
            ...(board.tracker && !readOnly
              ? [{ label: 'Edit asset tracker link', icon: <Pencil size={16} />, onClick: () => setTrackerOpen(true) }]
              : []),
            ...(onChangeTask ? [{ label: 'Change task', icon: <ArrowLeftRight size={16} />, onClick: onChangeTask }] : []),
          ]}
        />
      </div>

      {setupMissing && (
        <div className="mv-banner" role="status">
          <strong>Read-only:</strong> run <code>supabase/schema.sql</code> in Supabase to enable saving.
        </div>
      )}
      {saveError && !setupMissing && (
        <div className="mv-banner is-error" role="alert">
          <strong>Couldn’t save.</strong> {saveError}
        </div>
      )}

      {/* Compact summary — the lines below are the point; details fold away. */}
      <section className="mv-summary" aria-label="Asset progress">
        <div className="mv-summary-top">
          <span className="mv-summary-count">
            <b>{overall.done}</b>/{overall.total} done
          </span>
          <span className="mv-summary-pct">{pct}%</span>
          {inflight > 0 && <span className="mv-saving">Saving…</span>}
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
          aria-label={`${overall.done} done, ${overall.working} in progress, ${overall.notStarted} not started`}
        >
          <span style={{ width: seg(overall.done), background: STATUS.done.color }} />
          <span style={{ width: seg(overall.working), background: STATUS.working.color }} />
          <span style={{ width: seg(overall.notStarted), background: STATUS.notStarted.color }} />
        </div>
        <div className="mv-legend">
          {(['working', 'notStarted'] as Status[])
            .filter((s) => overall[s] > 0)
            .map((s) => (
              <span key={s} title={STATUS[s].label}>
                <i style={{ background: STATUS[s].color }} />
                {overall[s]} {SHORT_LABEL[s]}
                {s === 'notStarted' && overall.unassigned > 0 && ` (${overall.unassigned} unassigned)`}
              </span>
            ))}
        </div>

        {detailsOpen && (
          <div className="mv-details">
            {/* The task's package per asset type, with how much is done */}
            <div className="mv-plan" aria-label="Asset package">
              {pkg.map((p) => {
                const done = lines.filter((l) => keyOf(l) === p.key && l.status === 'done').reduce((n, l) => n + l.qty, 0)
                return (
                  <div key={p.key} className="mv-plan-row">
                    <span className="mv-plan-name">
                      {p.type}
                      {multiFn && p.fn && <span className="mv-plan-fn"> · {p.fn}</span>}
                    </span>
                    <span className="mv-plan-count">
                      {done}/{p.count} done
                    </span>
                    <span className="mv-plan-bar">
                      <span style={{ width: `${(done / p.count) * 100}%`, background: STATUS.done.color }} />
                    </span>
                  </div>
                )
              })}
              <p className="mv-plan-note">Asset package (dashboard)</p>
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

      {!readOnly && (
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
      )}

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
                  <ChevronDown size={18} style={{ color: group ? color : 'var(--mv-text-2)' }} />
                  <span className="mv-group-title" style={{ color: group ? color : 'var(--mv-text-2)' }}>
                    {group?.name ?? 'No group'}
                  </span>
                  <span className="mv-group-count">
                    {rows.length} {rows.length === 1 ? 'line' : 'lines'}
                    {qtyUnits > 0 && ` · ${doneUnits}/${qtyUnits} done`}
                  </span>
                </button>
                {group && !readOnly && (
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
                      <div
                        data-line={l.id}
                        className={`mv-row${drag?.id === l.id ? ' is-dragged' : ''}${l.pool ? ' is-pool' : ''}`}
                      >
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
                          onClick={() => !readOnly && setLineSheet({ line: l, isNew: false })}
                          disabled={readOnly}
                        >
                          <span className="mv-no">#{position.get(l.id)}</span>
                          <Avatars names={l.owners} />
                          <span className="mv-row-text">
                            <span className={`mv-row-title${complete ? ' is-done' : ''}`}>
                              {l.name}
                              <span className="mv-qty">× {l.qty}</span>
                            </span>
                            <span className="mv-row-sub">
                              {l.pool ? <span className="mv-pool-tag">Unassigned</span> : <StatusPill status={l.status} />}
                              {(!l.pool || l.name !== l.type) && <span className="mv-type">{l.type}</span>}
                              {multiFn && l.fn && <span className="mv-type">{l.fn}</span>}
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
                          disabled={readOnly}
                          onClick={() => patchLine(l.id, { status: complete ? 'notStarted' : 'done', pool: undefined })}
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
                {!rows.length && !dragging && !group && (
                  <div className="mv-drop-hint">No assets on this task yet.</div>
                )}
                {!readOnly && (
                  <button
                    type="button"
                    className="mv-add-row"
                    onClick={() => setLineSheet({ line: blankLine(group?.id ?? null), isNew: true })}
                  >
                    <Plus size={16} />
                    <span>{group ? `Add line to ${group.name}` : 'Add asset line'}</span>
                  </button>
                )}
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

      <p className="mv-footnote">Quantities sync live with the Workload dashboard.</p>

      {lineSheet && (
        <AssetSheet
          initial={lineSheet.line}
          isNew={lineSheet.isNew}
          position={position.get(lineSheet.line.id)}
          typesFor={typesFor}
          fns={fnOptions}
          defaultFn={fns[0] ?? legacyOwner}
          taskPeople={task.people}
          teamPeople={settings.people}
          onSave={(line) => {
            const before = lineSheet.line
            if (lineSheet.isNew) void addLine(line)
            else {
              // Send only what changed, so a concurrent edit to other fields isn't undone.
              const patch = Object.fromEntries(
                (Object.keys(line) as (keyof AssetLine)[])
                  .filter((k) => line[k] !== before[k])
                  .map((k) => [k, line[k]]),
              ) as Partial<AssetLine>
              if (Object.keys(patch).length) void patchLine(before.id, patch)
            }
            setLineSheet(null)
          }}
          onDelete={
            lineSheet.isNew
              ? undefined
              : () => {
                  void removeLine(lineSheet.line.id)
                  setLineSheet(null)
                }
          }
          onClose={() => setLineSheet(null)}
        />
      )}

      {mondayOpen && (
        <MondayLinkSheet
          current={mondayItem ? task.mondayUrl ?? null : null}
          linkedElsewhere={(itemId) => tasks.find((t) => t.id !== task.id && mondayItemIdFromUrl(t.mondayUrl) === itemId) ?? null}
          onSave={(url) => {
            void saveMondayLink(url)
            setMondayOpen(false)
          }}
          onClose={() => setMondayOpen(false)}
        />
      )}

      {trackerOpen && (
        <TrackerSheet
          initial={board.tracker}
          onSave={(url) => {
            saveTracker(url)
            setTrackerOpen(false)
          }}
          onClose={() => setTrackerOpen(false)}
        />
      )}

      {groupSheet && (
        <GroupSheetView
          initial={groupSheet.group}
          isNew={groupSheet.isNew}
          lineCount={lines.filter((l) => l.groupId === groupSheet.group.id).length}
          onSave={(g) => {
            void upsertGroup(g)
            setGroupSheet(null)
          }}
          onDelete={
            groupSheet.isNew
              ? undefined
              : () => {
                  void removeGroup(groupSheet.group.id)
                  setGroupSheet(null)
                }
          }
          onClose={() => setGroupSheet(null)}
        />
      )}
    </div>
  )
}

/** A small ⋯ popover menu (closes on pick, outside tap or Escape). */
function Menu({
  label,
  items,
}: {
  label: string
  items: { label: string; icon?: React.ReactNode; onClick: () => void }[]
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', outside)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('pointerdown', outside)
      window.removeEventListener('keydown', esc)
    }
  }, [open])
  return (
    <div className="mv-menu" ref={ref}>
      <button
        type="button"
        className="mv-icon-btn"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div className="mv-menu-list" role="menu">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              className="mv-menu-item"
              onClick={() => {
                setOpen(false)
                it.onClick()
              }}
            >
              {it.icon}
              {it.label}
            </button>
          ))}
        </div>
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

/** Several avatars, overlapped (monday's people column): up to 2, then "+N". */
function Avatars({ names, size = 28 }: { names: string[]; size?: number }) {
  if (!names.length) return <Avatar name={null} size={size} />
  const shown = names.length > 2 ? names.slice(0, 1) : names
  const extra = names.length - shown.length
  return (
    <span className="mv-avatars" title={names.join(', ')}>
      {shown.map((n) => (
        <Avatar key={n} name={n} size={size} />
      ))}
      {extra > 0 && (
        <span className="mv-avatar mv-avatar-more" style={{ width: size, height: size, fontSize: size * 0.38 }}>
          +{extra}
        </span>
      )}
    </span>
  )
}

/** Person in charge: tap chips to toggle (several allowed). Task people first;
 *  the rest of the team behind "Show everyone". */
function PeopleChips({
  value,
  onChange,
  taskPeople,
  teamPeople,
}: {
  value: string[]
  onChange: (next: string[]) => void
  taskPeople: string[]
  teamPeople: string[]
}) {
  const rest = teamPeople.filter((p) => !taskPeople.includes(p))
  const [showRest, setShowRest] = useState(value.some((p) => rest.includes(p)))
  const toggle = (p: string) => onChange(value.includes(p) ? value.filter((x) => x !== p) : [...value, p])
  const chip = (p: string) => (
    <button
      key={p}
      type="button"
      className={`mv-chip${value.includes(p) ? ' is-selected' : ''}`}
      aria-pressed={value.includes(p)}
      onClick={() => toggle(p)}
    >
      <Avatar name={p} size={20} />
      {p}
    </button>
  )
  return (
    <div className="mv-chip-list" role="group" aria-label="Person in charge">
      {taskPeople.map(chip)}
      {rest.length > 0 &&
        (showRest ? (
          rest.map(chip)
        ) : (
          <button type="button" className="mv-text-btn mv-chip-more" onClick={() => setShowRest(true)}>
            +{rest.length} more
          </button>
        ))}
    </div>
  )
}

function AssetSheet({
  initial,
  isNew,
  position,
  typesFor,
  fns,
  defaultFn,
  taskPeople,
  teamPeople,
  onSave,
  onDelete,
  onClose,
}: {
  initial: AssetLine
  isNew: boolean
  /** The line's # in the list (existing lines only). */
  position?: number
  typesFor: (fn: string | null) => string[]
  /** Functions (teams) to choose from. */
  fns: string[]
  /** What an unset function means for this task (its first function / legacy owner). */
  defaultFn: string
  taskPeople: string[]
  teamPeople: string[]
  onSave: (line: AssetLine) => void
  onDelete?: () => void
  onClose: () => void
}) {
  const [line, setLine] = useState<AssetLine>(initial)
  const [touched, setTouched] = useState(false)
  const nameMissing = !line.name.trim()
  const types = typesFor(line.fn)
  // Notes stay out of the way until asked for (footer icon) — or already written.
  const [notesOpen, setNotesOpen] = useState(!!initial.notes.trim())
  const notesRef = useRef<HTMLTextAreaElement>(null)

  const set = (patch: Partial<AssetLine>) => setLine((l) => ({ ...l, ...patch }))
  const setQty = (n: number) => set({ qty: Math.max(1, Math.round(n) || 1) })

  const save = () => {
    setTouched(true)
    if (nameMissing) return
    const out = { ...line, name: line.name.trim(), notes: line.notes.trim() }
    onSave({ ...out, pool: initial.pool && isPoolShaped(out) ? true : undefined })
  }

  return (
    <Sheet
      title={isNew || !position ? 'New asset' : initial.pool ? `Unassigned ${initial.type}` : `Edit asset · #${position}`}
      onClose={onClose}
      footer={
        <>
          {onDelete && (
            <button type="button" className="mv-btn mv-btn-danger" onClick={onDelete}>
              Delete
            </button>
          )}
          <button
            type="button"
            className={`mv-icon-btn mv-note-btn${notesOpen ? ' is-on' : ''}`}
            aria-label={notesOpen ? 'Notes' : 'Add a note'}
            aria-pressed={notesOpen}
            title={notesOpen ? 'Notes' : 'Add a note'}
            onClick={() => {
              setNotesOpen(true)
              window.setTimeout(() => notesRef.current?.focus(), 0)
            }}
          >
            <span className="mv-note-icon" aria-hidden>
              <StickyNote size={18} />
              {!notesOpen && <Plus size={11} strokeWidth={3} className="mv-note-plus" />}
            </span>
          </button>
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
            {(types.includes(line.type) ? types : [line.type, ...types]).map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mv-field-label" htmlFor="mv-fn">
            Function
          </label>
          <select
            id="mv-fn"
            className="mv-input mv-select"
            value={line.fn ?? defaultFn}
            // Re-picking the default on an unset line keeps it unset (no legacy-task upgrade).
            onChange={(e) => set({ fn: !line.fn && e.target.value === defaultFn ? null : e.target.value })}
          >
            {(fns.includes(line.fn ?? defaultFn) ? fns : [line.fn ?? defaultFn, ...fns]).map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <p className="mv-field-label">Person in charge</p>
        <PeopleChips
          value={line.owners}
          onChange={(owners) => set({ owners })}
          taskPeople={taskPeople}
          teamPeople={teamPeople}
        />
      </div>

      <div className="mv-count-status">
        <div>
          <label className="mv-field-label" htmlFor="mv-qty">
            Asset count
          </label>
          <Stepper id="mv-qty" value={line.qty} min={1} onChange={setQty} />
        </div>
        <div>
          <label className="mv-field-label" htmlFor="mv-status">
            Status
          </label>
          <select
            id="mv-status"
            className="mv-input mv-select mv-status-select"
            style={{ backgroundColor: STATUS[line.status].color }}
            value={line.status}
            onChange={(e) => set({ status: e.target.value as Status })}
          >
            {STATUS_ORDER.map((st) => (
              <option key={st} value={st}>
                {STATUS[st].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="mv-field-label" htmlFor="mv-due">
          Due date
        </label>
        <input
          id="mv-due"
          type="date"
          className="mv-input"
          value={line.due ?? ''}
          onChange={(e) => set({ due: e.target.value || null })}
        />
      </div>

      {notesOpen && (
        <div>
          <label className="mv-field-label" htmlFor="mv-notes">
            Notes
          </label>
          <textarea
            id="mv-notes"
            ref={notesRef}
            className="mv-input mv-textarea"
            rows={3}
            value={line.notes}
            onChange={(e) => set({ notes: e.target.value })}
            placeholder="Sizes, specs, links…"
          />
        </div>
      )}
    </Sheet>
  )
}

/** Link the task to its monday item: paste the item link, or just its ID. */
function MondayLinkSheet({
  current,
  linkedElsewhere,
  onSave,
  onClose,
}: {
  current: string | null
  /** Another task already linked to this monday item, if any. */
  linkedElsewhere: (itemId: string) => Task | null
  onSave: (url: string | null) => void
  onClose: () => void
}) {
  const [value, setValue] = useState(current ?? '')
  const [error, setError] = useState<string | null>(null)

  const save = () => {
    const raw = value.trim()
    if (!raw) return setError('Paste the item link or its ID.')
    const itemId = parseItemInput(raw)
    if (!itemId) return setError('Not a monday item link or ID.')
    const other = linkedElsewhere(itemId)
    if (other) return setError(`Already linked to ${other.code ? `${other.code} · ` : ''}${other.name}.`)
    // Keep a pasted link as-is (it carries the board); an ID alone gets the item URL.
    onSave(mondayItemIdFromUrl(raw) ? raw : `https://rmit.monday.com/pulses/${itemId}`)
  }

  return (
    <Sheet
      title={current ? 'monday.com link' : 'Link to monday.com'}
      onClose={onClose}
      footer={
        <>
          {current && (
            <button type="button" className="mv-btn mv-btn-danger" onClick={() => onSave(null)}>
              Unlink
            </button>
          )}
          <span className="mv-spacer" />
          <button type="button" className="mv-btn mv-btn-tertiary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="mv-btn mv-btn-primary" onClick={save}>
            {current ? 'Save' : 'Link'}
          </button>
        </>
      }
    >
      <div>
        <label className="mv-field-label" htmlFor="mv-monday-link">
          monday item link or ID
        </label>
        <input
          id="mv-monday-link"
          className={`mv-input${error ? ' is-error' : ''}`}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setError(null)
          }}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder="https://rmit.monday.com/boards/…/pulses/… or 2827224155"
          autoFocus
        />
        {error && <p className="mv-error">{error}</p>}
      </div>
    </Sheet>
  )
}

function TrackerSheet({
  initial,
  onSave,
  onClose,
}: {
  initial: string | null
  onSave: (url: string | null) => void
  onClose: () => void
}) {
  const [url, setUrl] = useState(initial ?? '')
  const [touched, setTouched] = useState(false)
  const value = url.trim()
  const invalid = !!value && !/^https:\/\/\S+$/i.test(value)

  const save = () => {
    setTouched(true)
    if (invalid) return
    onSave(value || null)
  }

  return (
    <Sheet
      title="Asset tracker"
      onClose={onClose}
      footer={
        <>
          {initial && (
            <button type="button" className="mv-btn mv-btn-danger" onClick={() => onSave(null)}>
              Remove
            </button>
          )}
          <span className="mv-spacer" />
          <button type="button" className="mv-btn mv-btn-tertiary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="mv-btn mv-btn-primary" onClick={save}>
            Save
          </button>
        </>
      }
    >
      <div>
        <label className="mv-field-label" htmlFor="mv-tracker">
          Link
        </label>
        <input
          id="mv-tracker"
          type="url"
          className={`mv-input${touched && invalid ? ' is-error' : ''}`}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder="https://rmit.sharepoint.com/…"
          autoFocus
        />
        {touched && invalid ? (
          <p className="mv-error">Paste the full link, starting with https://</p>
        ) : (
          <p className="mv-field-note">The task’s online sheet, e.g. its Excel asset tracker.</p>
        )}
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
          Deleting keeps its {lineCount} {lineCount === 1 ? 'line' : 'lines'} (moved to No group).
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
