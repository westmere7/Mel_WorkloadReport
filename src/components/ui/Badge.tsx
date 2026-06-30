import type { ReactNode } from 'react'
import { cx } from '../../lib/format'

export type Tone = 'red' | 'navy' | 'orange' | 'teal' | 'gold' | 'green' | 'plum' | 'gray'

const TONES: Record<Tone, string> = {
  red: 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300',
  navy: 'bg-navy-50 text-navy-600 dark:bg-white/10 dark:text-navy-100',
  orange: 'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
  teal: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300',
  gold: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  green: 'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300',
  plum: 'bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300',
  gray: 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300',
}

const ROTATION: Tone[] = ['navy', 'red', 'orange', 'teal', 'gold', 'green', 'plum']

/** Deterministically map a label to a tone so chips stay consistent. */
export function toneForLabel(label: string): Tone {
  let hash = 0
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) >>> 0
  return ROTATION[hash % ROTATION.length]
}

export function Badge({
  children,
  tone = 'gray',
  className,
}: {
  children: ReactNode
  tone?: Tone
  className?: string
}) {
  return <span className={cx('chip', TONES[tone], className)}>{children}</span>
}
