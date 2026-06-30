import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import { cx } from '../../lib/format'

interface MultiSelectProps {
  options: string[]
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
}

export function MultiSelect({ options, value, onChange, placeholder = 'Select…' }: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const toggle = (opt: string) => {
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt])
  }

  const remove = (opt: string, e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(value.filter((v) => v !== opt))
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cx(
          'input flex min-h-[44px] flex-wrap items-center gap-1.5 text-left',
          open && 'border-rmit-red ring-2 ring-brand-100',
        )}
      >
        {value.length === 0 && <span className="text-faint">{placeholder}</span>}
        {value.map((v) => (
          <span
            key={v}
            className="chip bg-navy-50 text-navy-600 dark:bg-white/10 dark:text-navy-100"
            onClick={(e) => e.stopPropagation()}
          >
            {v}
            <X className="h-3 w-3 cursor-pointer hover:text-rmit-red" onClick={(e) => remove(v, e)} />
          </span>
        ))}
        <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-faint" />
      </button>

      {open && (
        <div className="absolute z-30 mt-1.5 max-h-64 w-full overflow-auto rounded-xl border border-line bg-card py-1.5 shadow-card">
          {options.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted">No options — add them in Settings.</p>
          )}
          {options.map((opt) => {
            const selected = value.includes(opt)
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-subtle"
              >
                <span className={cx(selected ? 'font-semibold text-ink' : 'text-muted')}>{opt}</span>
                <span
                  className={cx(
                    'flex h-4 w-4 items-center justify-center rounded border',
                    selected ? 'border-rmit-red bg-rmit-red text-white' : 'border-faint',
                  )}
                >
                  {selected && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
