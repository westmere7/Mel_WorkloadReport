import { cx } from '../../lib/format'
import type { ShowcaseDraft, ShowcaseThemeId } from '../../lib/showcase'
import { Switch } from '../ui/Switch'
import { Segmented, StepHint } from './wizardBits'

/** Mini title-slide mock rendered in each theme's derived palette. */
const THEME_SWATCHES: {
  id: ShowcaseThemeId
  label: string
  hint: string
  bg: string
  ink: string
  accent: string
  accent2: string
}[] = [
  {
    id: 'red',
    label: 'RMIT Red',
    hint: 'Cinematic dark maroon with red + gold light',
    bg: '#160309',
    ink: '#fff6f6',
    accent: '#E61E2A',
    accent2: '#FFB81C',
  },
  {
    id: 'navy',
    label: 'RMIT Navy',
    hint: 'Deep navy night with red + gold accents',
    bg: '#030318',
    ink: '#eef0ff',
    accent: '#FF4D58',
    accent2: '#FFB81C',
  },
  {
    id: 'white',
    label: 'Gallery White',
    hint: 'Light gallery with navy ink + red accents',
    bg: '#f7f7fb',
    ink: '#000054',
    accent: '#E61E2A',
    accent2: '#000054',
  },
]

export function StepStyle({
  draft,
  patch,
}: {
  draft: ShowcaseDraft
  patch: (p: Partial<ShowcaseDraft>) => void
}) {
  const hasImages = true // toggling is harmless even without images
  return (
    <div className="space-y-5">
      <div>
        <label className="label">Main theme</label>
        <StepHint>The remaining brand colours are derived automatically.</StepHint>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {THEME_SWATCHES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => patch({ theme: t.id })}
              aria-pressed={draft.theme === t.id}
              className={cx(
                'overflow-hidden rounded-xl border text-left transition',
                draft.theme === t.id
                  ? 'border-rmit-red ring-2 ring-brand-100 dark:ring-brand-500/25'
                  : 'border-line hover:border-navy-300',
              )}
            >
              {/* Mini slide mock */}
              <div className="flex h-28 flex-col justify-center gap-1.5 px-4" style={{ background: t.bg }}>
                <span
                  className="font-display text-2xl font-bold leading-none"
                  style={{
                    background: `linear-gradient(90deg, ${t.ink}, ${t.accent})`,
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    color: 'transparent',
                  }}
                >
                  {draft.year}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: t.ink }}>
                  {draft.teamName || 'GCMC'}
                </span>
                <span className="h-1 w-10 rounded-full" style={{ background: t.accent2 }} />
              </div>
              <div className="px-4 py-2.5">
                <p className="text-sm font-semibold text-ink">{t.label}</p>
                <p className="text-xs text-muted">{t.hint}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label">Background</label>
        <Segmented
          options={[
            { id: 'solid', label: 'Solid' },
            { id: 'gradient', label: 'Aurora gradient' },
            { id: 'geometric', label: 'Geometric' },
          ]}
          value={draft.style.background}
          onChange={(background) => patch({ style: { ...draft.style, background } })}
        />
        <StepHint>Aurora = slow drifting colour blobs; Geometric = subtle rotating brand shapes.</StepHint>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4 rounded-xl bg-subtle px-4 py-3">
          <div>
            <p className="text-sm font-medium text-ink">Film grain</p>
            <p className="text-xs text-muted">A faint static grain that makes gradients read filmic.</p>
          </div>
          <Switch
            checked={draft.style.grain}
            onChange={(grain) => patch({ style: { ...draft.style, grain } })}
            label="Film grain"
          />
        </div>
        <div className="flex items-center justify-between gap-4 rounded-xl bg-subtle px-4 py-3">
          <div>
            <p className="text-sm font-medium text-ink">Show task codes</p>
            <p className="text-xs text-muted">Display booking codes (e.g. 26.0608.A) on project slides.</p>
          </div>
          <Switch
            checked={draft.style.showCodes}
            onChange={(showCodes) => patch({ style: { ...draft.style, showCodes } })}
            label="Show task codes"
          />
        </div>
        {hasImages && (
          <div className="flex items-center justify-between gap-4 rounded-xl bg-subtle px-4 py-3">
            <div>
              <p className="text-sm font-medium text-ink">Show demo images</p>
              <p className="text-xs text-muted">Use attached demo images on project slides (Ken Burns / collage).</p>
            </div>
            <Switch
              checked={draft.style.showImages}
              onChange={(showImages) => patch({ style: { ...draft.style, showImages } })}
              label="Show demo images"
            />
          </div>
        )}
      </div>
    </div>
  )
}
