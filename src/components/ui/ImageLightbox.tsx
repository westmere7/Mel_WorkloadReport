import { useEffect } from 'react'
import { X } from 'lucide-react'

/**
 * Full-screen image viewer. Sits above modals (z-[60]); closes on backdrop click,
 * the × button, or Escape. Escape is captured (capture-phase + stopPropagation) so
 * it dismisses only the lightbox, not an underlying Modal that also listens for it.
 */
export function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm sm:p-10"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        title="Close"
        className="absolute right-4 top-4 rounded-lg bg-white/10 p-2 text-white transition hover:bg-white/20"
      >
        <X className="h-5 w-5" />
      </button>
      <img
        src={src}
        alt=""
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
      />
    </div>
  )
}
