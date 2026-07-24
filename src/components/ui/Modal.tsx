import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
  /** Explicit max-width utility classes — overrides the wide/default sizing. */
  widthClass?: string
  /** Close when clicking the backdrop. Default true; set false to require explicit dismiss. */
  closeOnBackdrop?: boolean
}

export function Modal({ open, onClose, title, children, footer, wide, widthClass, closeOnBackdrop = true }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-900/70 p-4 backdrop-blur-sm sm:p-8"
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        className={`card my-auto w-full ${widthClass ?? (wide ? 'max-w-3xl lg:max-w-[88rem]' : 'max-w-lg')} p-0`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-base font-bold text-ink">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-subtle hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 py-5 lg:px-7 lg:py-6">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-line px-5 py-4">{footer}</div>
        )}
      </div>
    </div>
  )
}
