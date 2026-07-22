import { Star } from 'lucide-react'
import { useStore } from '../data/store'
import { cx } from '../lib/format'

/** Presentational star toggle — small, flat, amber when on. */
export function StarButton({ starred, onToggle }: { starred: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={starred}
      title={starred ? 'Starred — click to unstar' : 'Star this task (quick-filter marker)'}
      className={cx(
        'rounded-md p-1 transition',
        starred ? 'text-amber-400 hover:text-amber-500' : 'text-faint hover:text-muted',
      )}
    >
      <Star className={cx('h-3.5 w-3.5', starred && 'fill-current')} strokeWidth={1.5} />
    </button>
  )
}

/**
 * Live star toggle for an EXISTING task — persists on click (independent of the
 * edit form's Save). Reads the current flag from the store so it stays in sync;
 * meant to sit in the edit modal's header next to the title.
 */
export function TaskStar({ id }: { id: string }) {
  const { tasks, toggleStar } = useStore()
  const t = tasks.find((x) => x.id === id)
  if (!t) return null
  return <StarButton starred={!!t.starred} onToggle={() => void toggleStar(id)} />
}
