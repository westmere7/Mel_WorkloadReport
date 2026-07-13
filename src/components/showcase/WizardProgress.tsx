import { Check } from 'lucide-react'
import { cx } from '../../lib/format'

export const WIZARD_STEPS = ['Intro', 'Projects', 'Stats', 'Top 3', 'Sequence', 'Style', 'Generate'] as const

/** 7-segment progress bar across the top of the wizard. Past steps are clickable. */
export function WizardProgress({
  step,
  maxReached,
  onJump,
}: {
  step: number
  /** Highest step index the user has reached (steps beyond it are disabled). */
  maxReached: number
  onJump: (step: number) => void
}) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:gap-2 justify-between px-2">
      {WIZARD_STEPS.map((label, i) => {
        const done = i < step
        const current = i === step
        const reachable = i <= maxReached
        return (
          <div key={label} className="flex min-w-0 flex-1 last:flex-initial items-center gap-1 sm:gap-2">
            <button
              type="button"
              disabled={!reachable}
              onClick={() => onJump(i)}
              className={cx('group flex min-w-0 flex-col items-center gap-1.5 shrink-0 mx-auto', !reachable && 'cursor-not-allowed')}
              title={label}
            >
              <span
                className={cx(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold transition-all duration-300',
                  done && 'border-rmit-navy bg-rmit-navy text-white dark:border-navy-300 dark:bg-navy-300',
                  current && 'border-rmit-red text-rmit-red ring-2 ring-brand-100 dark:ring-brand-500/25',
                  !done && !current && (reachable ? 'border-line text-muted group-hover:border-navy-300' : 'border-line text-faint'),
                  i === 6 && reachable && !current && !done && 'border-accent-green/70 text-accent-green bg-green-500/10 dark:bg-green-500/20',
                  i === 6 && reachable && 'group-hover:scale-115 group-hover:bg-accent-green group-hover:text-white group-hover:border-accent-green shadow-sm',
                )}
              >
                {done ? <Check className="h-4 w-4" strokeWidth={3} /> : i + 1}
              </span>
              <span
                className={cx(
                  'hidden truncate text-[11px] font-semibold sm:block transition-all duration-300',
                  current ? 'text-ink' : done ? 'text-muted' : 'text-faint',
                  i === 6 && reachable && 'group-hover:text-accent-green group-hover:translate-y-[-1px]',
                )}
              >
                {label}
              </span>
            </button>
            {i < WIZARD_STEPS.length - 1 && (
              <span className={cx('mb-4 hidden h-px flex-1 sm:block', i < step ? 'bg-rmit-navy dark:bg-navy-300' : 'bg-line')} />
            )}
          </div>
        )
      })}
    </div>
  )
}
