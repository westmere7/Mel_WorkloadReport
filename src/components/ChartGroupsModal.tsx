import { useEffect, useRef, useState } from 'react'
import { GripVertical, Plus, X } from 'lucide-react'
import { Modal } from './ui/Modal'
import { useStore } from '../data/store'
import { FUNCTION_COLOR_KEYS, functionColor, sortAlpha, withFallback } from '../constants'
import { cx, toMessage } from '../lib/format'
import type { ChartGroup, ChartGroups } from '../types'

const EMPTY: ChartGroups = { asset: [], type: [] }
const PALETTE = FUNCTION_COLOR_KEYS.map((k) => functionColor(k).hex)

/** Deep-clone so the draft never mutates the live settings. */
function clone(src: ChartGroups): ChartGroups {
  const dup = (gs: ChartGroup[]) => gs.map((g) => ({ ...g, items: [...g.items] }))
  return { asset: dup(src.asset), type: dup(src.type) }
}

/**
 * Chart groups editor — a dedicated, wide pop-up. Bundle asset / work types into
 * named, coloured groups so the dashboard mix + demand charts stay readable.
 *
 * Items are chips you DRAG between an "Available" pool and each group (with
 * keyboard/click fallbacks so drag isn't required). Each group's colour is
 * unique within its dimension; the palette is hidden until you click the swatch.
 * A new group gets a random unused colour. Edits are DRAFTED and committed once
 * via Save (no per-keystroke writes); the result is stored in
 * AppSettings.chartGroups, so it syncs across devices. Display-only — tasks and
 * the reference lists are untouched; clicking a grouped slice still filters the
 * task list by the member items.
 */
export function ChartGroupsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings, saveSettings } = useStore()
  const live = settings.chartGroups ?? EMPTY
  const [tab, setTab] = useState<'asset' | 'type'>('asset')
  const [draft, setDraft] = useState<ChartGroups>(() => clone(live))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragName, setDragName] = useState<string | null>(null)
  const [overZone, setOverZone] = useState<string | null>(null) // 'ungrouped' | group id
  const [paletteFor, setPaletteFor] = useState<string | null>(null) // group id
  const [addMenuFor, setAddMenuFor] = useState<string | null>(null) // available item name
  const rootRef = useRef<HTMLDivElement>(null)

  // Snapshot the live groups into an editable draft each time the panel opens.
  useEffect(() => {
    if (open) {
      setDraft(clone(settings.chartGroups ?? EMPTY))
      setTab('asset')
      setError(null)
      setPaletteFor(null)
      setAddMenuFor(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Close any open popover when clicking elsewhere in the panel.
  useEffect(() => {
    if (!paletteFor && !addMenuFor) return
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-popover]')) {
        setPaletteFor(null)
        setAddMenuFor(null)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [paletteFor, addMenuFor])

  const groups = draft[tab]
  const allItems = withFallback(sortAlpha(tab === 'asset' ? settings.assetTypes : settings.types))
  const dimLabel = tab === 'asset' ? 'asset type' : 'work type'

  const owner = new Map<string, ChartGroup>()
  for (const g of groups) for (const it of g.items) if (!owner.has(it)) owner.set(it, g)
  const ungrouped = allItems.filter((i) => !owner.has(i))

  const usedColors = new Set(groups.map((g) => g.color))
  const freeColors = PALETTE.filter((h) => !usedColors.has(h))
  const randomColor = () => {
    const pool = freeColors.length ? freeColors : PALETTE
    return pool[Math.floor(Math.random() * pool.length)]
  }

  const setGroups = (next: ChartGroup[]) => setDraft((d) => ({ ...d, [tab]: next }))
  const addGroup = () => {
    const id = `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    setGroups([...groups, { id, name: `Group ${groups.length + 1}`, color: randomColor(), items: [] }])
  }
  const patch = (id: string, p: Partial<ChartGroup>) =>
    setGroups(groups.map((g) => (g.id === id ? { ...g, ...p } : g)))
  const removeGroup = (id: string) => setGroups(groups.filter((g) => g.id !== id))

  /** Move an item into a group (by id) or back to the pool (null). An item lives
   *  in at most one group, so it's stripped from any others. */
  const moveItem = (name: string, targetId: string | null) =>
    setDraft((d) => ({
      ...d,
      [tab]: d[tab].map((g) => {
        if (g.id === targetId) return g.items.includes(name) ? g : { ...g, items: [...g.items, name] }
        return g.items.includes(name) ? { ...g, items: g.items.filter((i) => i !== name) } : g
      }),
    }))

  const dirty = JSON.stringify(draft) !== JSON.stringify(live)

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await saveSettings({ ...settings, chartGroups: draft })
      onClose()
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setSaving(false)
    }
  }

  // ── Drag & drop ────────────────────────────────────────────────
  const dropProps = (zone: string, targetId: string | null) => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault()
      if (overZone !== zone) setOverZone(zone)
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverZone((z) => (z === zone ? null : z))
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      const name = dragName ?? e.dataTransfer.getData('text/plain')
      if (name) moveItem(name, targetId)
      setDragName(null)
      setOverZone(null)
    },
  })

  const chipDragProps = (name: string) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      setDragName(name)
      e.dataTransfer.setData('text/plain', name)
      e.dataTransfer.effectAllowed = 'move'
    },
    onDragEnd: () => {
      setDragName(null)
      setOverZone(null)
    },
  })

  const Chip = ({ name, groupId }: { name: string; groupId: string | null }) => (
    <span
      {...chipDragProps(name)}
      className={cx(
        'inline-flex cursor-grab items-center gap-1 rounded-lg border border-line bg-card px-2 py-1 text-xs text-ink shadow-soft transition active:cursor-grabbing',
        dragName === name && 'opacity-40',
      )}
    >
      <GripVertical className="h-3 w-3 shrink-0 text-faint" />
      <span className="max-w-[12rem] truncate">{name}</span>
      {groupId ? (
        // Grouped chip → send back to the pool (non-drag fallback).
        <button
          type="button"
          onClick={() => moveItem(name, null)}
          className="shrink-0 rounded p-0.5 text-faint transition hover:text-rmit-red"
          title="Remove from group"
          aria-label={`Remove ${name} from group`}
        >
          <X className="h-3 w-3" />
        </button>
      ) : (
        // Pool chip → "+" opens an assign menu (non-drag fallback).
        <span className="relative" data-popover>
          <button
            type="button"
            onClick={() => setAddMenuFor((v) => (v === name ? null : name))}
            className="shrink-0 rounded p-0.5 text-faint transition hover:text-ink"
            title="Add to a group"
            aria-label={`Add ${name} to a group`}
          >
            <Plus className="h-3 w-3" />
          </button>
          {addMenuFor === name && (
            <div className="absolute left-0 top-[calc(100%+4px)] z-20 min-w-[9rem] rounded-lg border border-line bg-card p-1 shadow-lg">
              {groups.length === 0 && <p className="px-2 py-1 text-[11px] text-muted">No groups yet.</p>}
              {groups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => {
                    moveItem(name, g.id)
                    setAddMenuFor(null)
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs text-ink transition hover:bg-subtle"
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: g.color }} />
                  <span className="truncate">{g.name || 'Untitled group'}</span>
                </button>
              ))}
            </div>
          )}
        </span>
      )}
    </span>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnBackdrop={false}
      widthClass="max-w-3xl lg:max-w-5xl"
      title="Chart groups"
      footer={
        <>
          <button type="button" className="btn-outline" onClick={onClose} disabled={saving}>
            Discard
          </button>
          <button type="button" className="btn-primary" onClick={handleSave} disabled={!dirty || saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="space-y-4" ref={rootRef}>
        <p className="text-xs leading-relaxed text-muted">
          Drag {dimLabel}s between the pool and your groups (or use the + / ✕ buttons). Each group merges into one
          coloured slice on the dashboard mix & demand charts. Synced across devices; display-only — clicking a grouped
          slice still opens exactly its tasks.
        </p>

        <div className="inline-flex items-center gap-0.5 rounded-lg bg-subtle p-1">
          {(
            [
              ['asset', 'Asset types'],
              ['type', 'Work types'],
            ] as ['asset' | 'type', string][]
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setTab(v)}
              className={cx(
                'rounded-md px-3 py-1 text-sm font-semibold transition',
                tab === v ? 'bg-rmit-navy text-white dark:bg-navy-300' : 'text-muted hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Available pool — a drop target for un-grouping. */}
        <div
          {...dropProps('ungrouped', null)}
          className={cx(
            'rounded-xl border border-dashed p-3 transition-colors',
            overZone === 'ungrouped' ? 'border-rmit-navy bg-subtle' : 'border-line bg-subtle/40',
          )}
        >
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
            Available {dimLabel}s · {ungrouped.length}
          </p>
          {ungrouped.length === 0 ? (
            <p className="text-xs text-faint">Every {dimLabel} is in a group.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {ungrouped.map((name) => (
                <Chip key={name} name={name} groupId={null} />
              ))}
            </div>
          )}
        </div>

        {/* Group columns — each a drop target. */}
        <div className="grid gap-3 sm:grid-cols-2">
          {groups.map((g) => (
            <div
              key={g.id}
              {...dropProps(g.id, g.id)}
              className={cx(
                'flex flex-col gap-2 rounded-xl border-2 p-3 transition-colors',
                overZone === g.id ? 'bg-subtle' : 'bg-card/40',
              )}
              style={{ borderColor: g.color }}
            >
              <div className="flex items-center gap-2">
                {/* Colour swatch — palette hidden until clicked; only unused colours shown. */}
                <span className="relative" data-popover>
                  <button
                    type="button"
                    onClick={() => setPaletteFor((v) => (v === g.id ? null : g.id))}
                    className="h-5 w-5 shrink-0 rounded-full ring-2 ring-white/40 transition hover:scale-110 dark:ring-black/20"
                    style={{ backgroundColor: g.color }}
                    title="Change colour"
                    aria-label="Change group colour"
                  />
                  {paletteFor === g.id && (
                    <div className="absolute left-0 top-[calc(100%+6px)] z-20 flex w-40 flex-wrap gap-1.5 rounded-lg border border-line bg-card p-2 shadow-lg">
                      {PALETTE.filter((h) => h === g.color || !usedColors.has(h)).map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          style={{ backgroundColor: hex }}
                          className={cx(
                            'h-5 w-5 rounded-full transition-transform',
                            g.color === hex ? 'scale-110 ring-2 ring-ink/40 ring-offset-1' : 'hover:scale-110',
                          )}
                          onClick={() => {
                            patch(g.id, { color: hex })
                            setPaletteFor(null)
                          }}
                          aria-label={`Colour ${hex}`}
                        />
                      ))}
                    </div>
                  )}
                </span>
                <input
                  className="input h-9 flex-1 text-sm"
                  value={g.name}
                  placeholder="Group name"
                  onChange={(e) => patch(g.id, { name: e.target.value })}
                />
                <button
                  type="button"
                  className="shrink-0 rounded-md p-1 text-faint hover:bg-brand-50 hover:text-rmit-red dark:hover:bg-brand-500/15"
                  onClick={() => removeGroup(g.id)}
                  title="Remove group (its items return to the pool)"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="min-h-[2.5rem] flex-1 rounded-lg">
                {g.items.length === 0 ? (
                  <p className="px-1 py-2 text-xs text-faint">Drag {dimLabel}s here, or use their + button.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {g.items.map((name) => (
                      <Chip key={name} name={name} groupId={g.id} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <button type="button" className="btn-outline" onClick={addGroup}>
          <Plus className="h-4 w-4" /> New group
        </button>

        {error && <p className="text-sm font-medium text-rmit-red">{error}</p>}
      </div>
    </Modal>
  )
}
