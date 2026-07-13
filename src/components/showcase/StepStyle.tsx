import { cx } from '../../lib/format'
import type { ShowcaseDraft, ColorMode } from '../../lib/showcase'
import { Switch } from '../ui/Switch'
import { Segmented, StepHint } from './wizardBits'
import { Shuffle } from 'lucide-react'

const COLOR_MODE_SWATCHES: {
  id: ColorMode;
  label: string;
  hint: string;
  bg: string;
  ink: string;
  accent: string;
  accent2: string;
}[] = [
  {
    id: 'red',
    label: 'Red Dominant',
    hint: 'RMIT brand red theme with white ink',
    bg: '#e61e2a',
    ink: '#ffffff',
    accent: '#000054',
    accent2: '#ffb81c',
  },
  {
    id: 'navy',
    label: 'Navy Dominant',
    hint: 'RMIT brand navy theme with white ink',
    bg: '#000054',
    ink: '#ffffff',
    accent: '#e61e2a',
    accent2: '#ffb81c',
  },
  {
    id: 'gradient',
    label: 'Moving Gradient',
    hint: 'Subtle animated gradient between brand red and navy',
    bg: 'linear-gradient(135deg, #e61e2a, #000054)',
    ink: '#ffffff',
    accent: '#ffb81c',
    accent2: '#ffffff',
  },
  {
    id: 'light',
    label: 'White Gallery',
    hint: 'Clean white background with navy ink and red accents',
    bg: '#ffffff',
    ink: '#000054',
    accent: '#e61e2a',
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
  const hasImages = true

  const toggleStyleFlag = <K extends keyof ShowcaseDraft['style']>(
    key: K,
    val: ShowcaseDraft['style'][K]
  ) => {
    patch({
      style: {
        ...draft.style,
        [key]: val,
      },
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <label className="label">RMIT Brand Theme — Color Mode</label>
        <StepHint>Select how the RMIT brand colors are configured for the showreel.</StepHint>
        <div className="mt-2 grid gap-3 sm:grid-cols-4">
          {COLOR_MODE_SWATCHES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => toggleStyleFlag('colorMode', t.id)}
              aria-pressed={draft.style.colorMode === t.id}
              className={cx(
                'overflow-hidden rounded-xl border text-left transition',
                draft.style.colorMode === t.id
                  ? 'border-rmit-red ring-2 ring-brand-100 dark:ring-brand-500/25'
                  : 'border-line hover:border-navy-300',
              )}
            >
              {/* Mini slide mock */}
              <div className="flex h-24 flex-col justify-center gap-1 px-4" style={{ background: t.bg }}>
                <span
                  className="font-display text-xl font-bold leading-none"
                  style={{
                    background: `linear-gradient(90deg, ${t.ink}, ${t.accent})`,
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    color: 'transparent',
                  }}
                >
                  {draft.year}
                </span>
                <span className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: t.ink }}>
                  {draft.teamName || 'GCMC'}
                </span>
                <span className="h-0.5 w-8 rounded-full" style={{ background: t.accent2 }} />
              </div>
              <div className="px-3 py-2">
                <p className="text-xs font-semibold text-ink leading-tight">{t.label}</p>
                <p className="mt-0.5 text-[10px] text-muted leading-tight">{t.hint}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label">Background Shapes / Style</label>
        <Segmented
          options={[
            { id: 'solid', label: 'Solid' },
            { id: 'gradient', label: 'Aurora blobs' },
            { id: 'geometric', label: 'Geometric shapes' },
          ]}
          value={draft.style.background}
          onChange={(background) => toggleStyleFlag('background', background)}
        />
        <StepHint>Aurora blobs and geometric shapes rotate slowly in the background.</StepHint>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4 rounded-xl bg-subtle px-4 py-3">
          <div>
            <p className="text-sm font-medium text-ink">Film grain</p>
            <p className="text-xs text-muted">A faint static grain that makes gradients read filmic.</p>
          </div>
          <Switch
            checked={draft.style.grain}
            onChange={(grain) => toggleStyleFlag('grain', grain)}
            label="Film grain"
          />
        </div>
        <div className="flex items-center justify-between gap-4 rounded-xl bg-subtle px-4 py-3">
          <div>
            <p className="text-sm font-medium text-ink">Moving gradients</p>
            <p className="text-xs text-muted">Use subtle, elegant moving background gradient transitions (on Gradient color mode).</p>
          </div>
          <Switch
            checked={draft.style.movingGradients ?? true}
            onChange={(movingGradients) => toggleStyleFlag('movingGradients', movingGradients)}
            label="Moving gradients"
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
              onChange={(showImages) => toggleStyleFlag('showImages', showImages)}
              label="Show demo images"
            />
          </div>
        )}
      </div>

      <div className="border-t border-line pt-6">
        <label className="label">Cinematography Seed</label>
        <StepHint>
          The seed generates deterministic variations in camera transitions, staggered timing reveals, layout structures, card borders, shadows, and background shape compositions. Use the same seed to reproduce this exact look.
        </StepHint>
        <div className="mt-2.5 flex items-center gap-2 max-w-sm">
          <input
            type="number"
            className="input flex-1 h-10"
            value={draft.seed}
            onChange={(e) => patch({ seed: Number(e.target.value) || 0 })}
            placeholder="Enter seed number..."
          />
          <button
            type="button"
            onClick={() => patch({ seed: Math.floor(Math.random() * 2 ** 31) })}
            className="btn-outline h-10 px-3 flex items-center gap-1.5 shrink-0"
            title="Generate a new random seed"
          >
            <Shuffle className="h-3.5 w-3.5" /> Re-roll
          </button>
        </div>
      </div>
    </div>
  )
}
