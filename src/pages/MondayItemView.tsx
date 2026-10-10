import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, ChevronDown, Plus, RotateCcw, Trash2 } from 'lucide-react'
import mondaySdk from 'monday-sdk-js'
import { cx } from '../lib/format'

/*
 * monday.com Item View — /embed/item. An asset checklist for the open monday
 * item: the team adds deliverables and checks them off as they're done.
 *
 * ⚠️ DEMO: data is in-memory only (seeded below, reset on reload) — nothing is
 * read from or written to the dashboard or monday yet.
 */

type Status = 'todo' | 'doing' | 'done'

interface Asset {
  id: string
  name: string
  type: string
  owner: string | null
  due: string | null // ISO date
  status: Status
}

const ASSET_TYPES = ['Video (short form)', 'Static social', 'Web banner', 'EDM', 'Print', 'Motion / GIF']
const PEOPLE = ['Truc', 'Tuyet', 'Danh', 'Eden', 'Duc', 'Trinh', 'Tran']

// monday's own status colours, so the tab reads as native inside the item card.
const STATUS: Record<Status, { label: string; short: string; color: string }> = {
  todo: { label: 'To do', short: 'To do', color: '#c4c4c4' },
  doing: { label: 'Working on it', short: 'Working', color: '#fdab3d' },
  done: { label: 'Done', short: 'Done', color: '#00c875' },
}
const STATUS_ORDER: Status[] = ['todo', 'doing', 'done']

const AVATAR_COLORS = ['#e2445c', '#0086c0', '#a25ddc', '#00a9a5', '#ff7575', '#579bfc', '#cab641']

const DEMO_ITEM_NAME = 'VTAC update video asset (tik tok)'

// Not crypto.randomUUID — that's missing in non-secure frames.
let nextId = 0
const newId = () => `a${++nextId}`

function isoInDays(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function demoAssets(): Asset[] {
  const a = (name: string, type: string, owner: string, due: number, status: Status): Asset => ({
    id: newId(),
    name,
    type,
    owner,
    due: isoInDays(due),
    status,
  })
  return [
    a('TikTok 9:16 · 15s cut', 'Video (short form)', 'Eden', -3, 'done'),
    a('TikTok 9:16 · 30s cut', 'Video (short form)', 'Eden', 1, 'doing'),
    a('Reels 9:16 · 15s', 'Video (short form)', 'Duc', 4, 'todo'),
    a('Instagram feed 1:1 · Hero', 'Static social', 'Truc', -5, 'done'),
    a('Instagram feed 4:5 · Course grid', 'Static social', 'Truc', -2, 'done'),
    a('Stories 9:16 · Countdown', 'Static social', 'Tuyet', -1, 'doing'),
    a('Leaderboard 728×90', 'Web banner', 'Danh', 6, 'todo'),
    a('MREC 300×250', 'Web banner', 'Danh', 6, 'todo'),
    a('Skyscraper 160×600', 'Web banner', 'Danh', 7, 'todo'),
    a('EDM header 600×200', 'EDM', 'Trinh', -4, 'done'),
  ]
}

/** monday reports light | dark | black; the app only has light/dark. Not persisted. */
function applyMondayTheme(theme: string | undefined) {
  if (!theme) return
  document.documentElement.classList.toggle('dark', theme !== 'light')
}

function formatDue(iso: string | null): { text: string; overdue: boolean } {
  if (!iso) return { text: 'Due', overdue: false }
  const today = new Date().toISOString().slice(0, 10)
  if (iso === today) return { text: 'Today', overdue: false }
  const d = new Date(`${iso}T00:00:00`)
  return {
    text: d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
    overdue: iso < today,
  }
}

function avatarColor(name: string): string {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

export function MondayItemViewPage() {
  const [params] = useSearchParams()
  const [assets, setAssets] = useState<Asset[]>(demoAssets)
  const [filter, setFilter] = useState<'all' | Status>('all')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // Theme follows monday (or ?theme=dark when testing outside monday).
  useEffect(() => {
    applyMondayTheme(params.get('theme') ?? undefined)
    if (window.self === window.top) return
    const unlisten = mondaySdk().listen('context', (res) => {
      applyMondayTheme((res.data as { theme?: string }).theme)
    })
    return () => {
      if (typeof unlisten === 'function') unlisten()
    }
  }, [params])

  const counts = useMemo(() => {
    const c = { todo: 0, doing: 0, done: 0 }
    for (const a of assets) c[a.status]++
    return c
  }, [assets])
  const total = assets.length
  const pct = total ? Math.round((counts.done / total) * 100) : 0

  const groups = useMemo(() => {
    const visible = assets.filter((a) => filter === 'all' || a.status === filter)
    const types = [...ASSET_TYPES, ...new Set(assets.map((a) => a.type).filter((t) => !ASSET_TYPES.includes(t)))]
    return types
      .map((type) => ({
        type,
        all: assets.filter((a) => a.type === type),
        rows: visible.filter((a) => a.type === type),
      }))
      .filter((g) => g.rows.length)
  }, [assets, filter])

  const update = (id: string, patch: Partial<Asset>) =>
    setAssets((list) => list.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  const remove = (id: string) => setAssets((list) => list.filter((a) => a.id !== id))
  const add = (asset: Omit<Asset, 'id' | 'status'>) =>
    setAssets((list) => [...list, { ...asset, id: newId(), status: 'todo' }])

  const toggleGroup = (type: string) =>
    setCollapsed((s) => {
      const next = new Set(s)
      next.has(type) ? next.delete(type) : next.add(type)
      return next
    })

  return (
    <div className="min-h-screen bg-surface text-ink">
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        {/* Title */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Assets</p>
            <h1 className="truncate text-base font-bold text-ink" title={DEMO_ITEM_NAME}>
              {DEMO_ITEM_NAME}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span
              className="rounded border border-dashed border-faint px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-faint"
              title="Demo data — changes are not saved"
            >
              Demo
            </span>
            <button
              type="button"
              onClick={() => setAssets(demoAssets())}
              className="rounded-lg p-1.5 text-muted transition hover:bg-subtle hover:text-ink"
              title="Reset demo data"
              aria-label="Reset demo data"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Progress */}
        <div className="card p-4">
          <div className="flex items-end justify-between gap-3">
            <p className="text-sm text-muted">
              <span className="text-2xl font-bold tabular-nums text-ink">{counts.done}</span>
              <span className="tabular-nums"> / {total}</span> assets done
            </p>
            <p className="text-lg font-bold tabular-nums text-ink">{pct}%</p>
          </div>
          <div className="mt-2.5 flex h-2 gap-0.5 overflow-hidden rounded-full bg-subtle" role="img" aria-label={`${counts.done} done, ${counts.doing} working on it, ${counts.todo} to do`}>
            {(['done', 'doing'] as Status[]).map((s) =>
              counts[s] ? (
                <div
                  key={s}
                  className="h-full transition-all duration-300 first:rounded-l-full"
                  style={{ width: `${(counts[s] / total) * 100}%`, backgroundColor: STATUS[s].color }}
                />
              ) : null,
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            {(['done', 'doing', 'todo'] as Status[]).map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS[s].color }} />
                {STATUS[s].label} <span className="font-semibold tabular-nums text-ink">{counts[s]}</span>
              </span>
            ))}
          </div>
        </div>

        <AddAssetRow onAdd={add} />

        {/* Filter */}
        <div className="flex gap-1 rounded-xl bg-subtle p-1 text-xs font-semibold" role="tablist">
          {(['all', ...STATUS_ORDER] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={cx(
                'flex-1 whitespace-nowrap rounded-lg px-2 py-1.5 transition',
                filter === f ? 'bg-card text-ink shadow-sm' : 'text-muted hover:text-ink',
              )}
            >
              {f === 'all' ? 'All' : STATUS[f].short}{' '}
              <span className="tabular-nums opacity-60">{f === 'all' ? total : counts[f]}</span>
            </button>
          ))}
        </div>

        {/* Groups */}
        {groups.length ? (
          <div className="space-y-3">
            {groups.map((g) => {
              const done = g.all.filter((a) => a.status === 'done').length
              const open = !collapsed.has(g.type)
              return (
                <section key={g.type} className="card overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleGroup(g.type)}
                    aria-expanded={open}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition hover:bg-subtle"
                  >
                    <ChevronDown className={cx('h-4 w-4 text-muted transition-transform', !open && '-rotate-90')} />
                    <span className="text-sm font-bold text-ink">{g.type}</span>
                    <span className="ml-auto text-xs tabular-nums text-muted">
                      {done}/{g.all.length}
                    </span>
                    <span className="h-1.5 w-14 overflow-hidden rounded-full bg-subtle">
                      <span
                        className="block h-full rounded-full transition-all duration-300"
                        style={{ width: `${(done / g.all.length) * 100}%`, backgroundColor: STATUS.done.color }}
                      />
                    </span>
                  </button>
                  {open && (
                    <ul className="divide-y divide-line border-t border-line">
                      {g.rows.map((a) => (
                        <AssetRow key={a.id} asset={a} onChange={(p) => update(a.id, p)} onRemove={() => remove(a.id)} />
                      ))}
                    </ul>
                  )}
                </section>
              )
            })}
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-muted">
            {total ? 'Nothing here.' : 'No assets yet — add the first one above.'}
          </p>
        )}
      </div>
    </div>
  )
}

function AddAssetRow({ onAdd }: { onAdd: (a: Omit<Asset, 'id' | 'status'>) => void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState(ASSET_TYPES[0])
  const [owner, setOwner] = useState('')
  const [due, setDue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return inputRef.current?.focus()
    onAdd({ name: name.trim(), type, owner: owner || null, due: due || null })
    setName('')
    inputRef.current?.focus()
  }

  const field = 'rounded-lg border border-line bg-card px-2 py-1.5 text-xs text-ink outline-none focus:border-rmit-red'
  return (
    <form onSubmit={submit} className="card space-y-2 p-3">
      <div className="flex gap-2">
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add an asset, e.g. MREC 300×250"
          aria-label="Asset name"
          className="input py-2"
        />
        <button type="submit" className="btn-primary shrink-0 px-3 py-2" aria-label="Add asset">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Add</span>
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Asset type" className={field}>
          {ASSET_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Owner" className={field}>
          <option value="">No owner</option>
          {PEOPLE.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" className={field} />
      </div>
    </form>
  )
}

function AssetRow({
  asset,
  onChange,
  onRemove,
}: {
  asset: Asset
  onChange: (patch: Partial<Asset>) => void
  onRemove: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(asset.name)
  const dateRef = useRef<HTMLInputElement>(null)
  const done = asset.status === 'done'
  const due = formatDue(asset.due)

  const commit = () => {
    setEditing(false)
    if (draft.trim() && draft.trim() !== asset.name) onChange({ name: draft.trim() })
    else setDraft(asset.name)
  }

  return (
    <li className="group flex items-center gap-2.5 px-3 py-2">
      {/* Check off */}
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Mark ${asset.name} not done` : `Mark ${asset.name} done`}
        onClick={() => onChange({ status: done ? 'todo' : 'done' })}
        className={cx(
          'grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition',
          done ? 'border-transparent text-white' : 'border-faint hover:border-[#00c875]',
        )}
        style={done ? { backgroundColor: STATUS.done.color } : undefined}
      >
        {done && <Check className="h-3 w-3" strokeWidth={3} />}
      </button>

      {/* Name — click to rename */}
      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') {
                setDraft(asset.name)
                setEditing(false)
              }
            }}
            aria-label="Asset name"
            className="w-full rounded-md border border-rmit-red bg-card px-1.5 py-0.5 text-sm text-ink outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            title="Click to rename"
            className={cx(
              'block w-full truncate text-left text-sm transition',
              done ? 'text-faint line-through' : 'text-ink hover:text-brand-600',
            )}
          >
            {asset.name}
          </button>
        )}
      </div>

      {/* Status */}
      <label
        className="relative hidden shrink-0 cursor-pointer rounded px-2 py-0.5 text-[11px] font-semibold text-white min-[460px]:block"
        style={{ backgroundColor: STATUS[asset.status].color }}
      >
        {STATUS[asset.status].label}
        <select
          value={asset.status}
          onChange={(e) => onChange({ status: e.target.value as Status })}
          aria-label="Status"
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {STATUS[s].label}
            </option>
          ))}
        </select>
      </label>

      {/* Owner */}
      <label
        className={cx(
          'relative grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-full text-[10px] font-bold',
          asset.owner ? 'text-white' : 'border border-dashed border-faint text-faint',
        )}
        style={asset.owner ? { backgroundColor: avatarColor(asset.owner) } : undefined}
        title={asset.owner ?? 'Assign owner'}
      >
        {asset.owner ? asset.owner.slice(0, 2).toUpperCase() : '+'}
        <select
          value={asset.owner ?? ''}
          onChange={(e) => onChange({ owner: e.target.value || null })}
          aria-label="Owner"
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          <option value="">No owner</option>
          {PEOPLE.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </label>

      {/* Due date */}
      <button
        type="button"
        onClick={() => {
          try {
            dateRef.current?.showPicker()
          } catch {
            dateRef.current?.focus()
          }
        }}
        className={cx(
          'relative w-14 shrink-0 rounded px-1 py-0.5 text-right text-xs tabular-nums transition hover:bg-subtle',
          due.overdue && !done ? 'font-semibold text-[#e2445c]' : asset.due ? 'text-muted' : 'text-faint',
        )}
        title={due.overdue && !done ? 'Overdue' : 'Change due date'}
      >
        {due.text}
        <input
          ref={dateRef}
          type="date"
          value={asset.due ?? ''}
          onChange={(e) => onChange({ due: e.target.value || null })}
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0"
        />
      </button>

      {/* Delete */}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Delete ${asset.name}`}
        title="Delete"
        className="shrink-0 rounded p-1 text-faint opacity-0 transition hover:bg-subtle hover:text-[#e2445c] focus:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  )
}
