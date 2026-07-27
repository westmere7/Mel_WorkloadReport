import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

/**
 * Currently-open modals, oldest first. Escape closes only the TOP one — without
 * this, a modal opened from inside another (e.g. the rate history over the rates
 * editor) would take its parent down with it on a single keypress.
 */
const openModals: object[] = []

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
  // Through a ref so the effect depends on `open` alone: re-running it on a new
  // onClose identity would re-push this modal and steal "topmost" from a child.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const token = {}
    openModals.push(token)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (openModals[openModals.length - 1] !== token) return
      onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      const i = openModals.indexOf(token)
      if (i !== -1) openModals.splice(i, 1)
    }
  }, [open])

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
        {/* min-w-0 on the heading (and shrink-0 on the close button) so a long
            title can clip or scroll inside the header instead of pushing past it. */}
        <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-4">
          <h2 className="min-w-0 text-base font-bold text-ink">{title}</h2>
          <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-muted hover:bg-subtle hover:text-ink">
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
