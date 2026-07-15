import { cx } from '../../lib/format'
import type { ShowcaseDraft, ColorMode } from '../../lib/showcase'
import { Switch } from '../ui/Switch'
import { StepHint } from './wizardBits'
import { Shuffle } from 'lucide-react'

const RED = '#e61e2a'
const NAVY = '#000054'
const DUO = `linear-gradient(118deg, ${RED}, ${NAVY})`

/**
 * The four background MIX profiles. Every showcase cuts between solid brand
 * panels (red / navy / white and their gradients) scene by scene — the
 * profile sets how that rotation is weighted. The mini-mock shows the rhythm.
 */
const MIX_PROFILES: {
  id: ColorMode
  label: string
  hint: string
  strip: string[]
  ink: (bg: string) => string
}[] = [
  {
    id: 'gradient',
    label: 'Signature Mix',
    hint: 'The storyboard rotation — red, navy and white panels alternating evenly.',
    strip: [RED, NAVY, '#ffffff', DUO],
    ink: (bg) => (bg === '#ffffff' ? NAVY : '#fff'),
  },
  {
    id: 'red',
    label: 'Red Dominant',
    hint: 'Red leads; navy and white cut in for contrast.',
    strip: [RED, RED, NAVY, '#ffffff'],
    ink: (bg) => (bg === '#ffffff' ? RED : '#fff'),
  },
  {
    id: 'navy',
    label: 'Navy Dominant',
    hint: 'Navy leads; red and white cut in for contrast.',
    strip: [NAVY, NAVY, RED, '#ffffff'],
    ink: (bg) => (bg === '#ffffff' ? NAVY : '#fff'),
  },
  {
    id: 'light',
    label: 'Light Gallery',
    hint: 'White-led gallery look with red and navy punch panels.',
    strip: ['#ffffff', '#ffffff', RED, NAVY],
    ink: (bg) => (bg === '#ffffff' ? RED : '#fff'),
  },
]

export function StepStyle({
  draft,
  patch,
}: {
  draft: ShowcaseDraft
  patch: (p: Partial<ShowcaseDraft>) => void
}) {
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
        <label className="label">Background Mix</label>
        <StepHint>
          Scenes cut between solid RMIT brand panels — red, navy and white (plus subtle red↔navy
          gradients and pixel-pattern accents). Pick which colour leads the rotation; the seed
          decides the exact scene-by-scene sequence.
        </StepHint>
        <div className="mt-2 grid gap-3 sm:grid-cols-4">
          {MIX_PROFILES.map((t) => (
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
              {/* Mini panel-rotation mock: 4 consecutive "scenes". */}
              <div className="grid h-24 grid-cols-4">
                {t.strip.map((bg, i) => (
                  <div
                    key={i}
                    className="flex items-end justify-center pb-2"
                    style={{ background: bg, borderRight: i < 3 ? '1px solid rgba(0,0,0,0.06)' : undefined }}
                  >
                    <span
                      className="font-display text-sm font-bold leading-none"
                      style={{ color: t.ink(bg) }}
                    >
                      {['65%', '211', 'Aa', String(draft.year).slice(2)][i]}
                    </span>
                  </div>
                ))}
              </div>
              <div className="px-3 py-2">
                <p className="text-xs font-semibold text-ink leading-tight">{t.label}</p>
                <p className="mt-0.5 text-[10px] text-muted leading-tight">{t.hint}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4 rounded-xl bg-subtle px-4 py-3">
          <div>
            <p className="text-sm font-medium text-ink">Film grain</p>
            <p className="text-xs text-muted">A faint static grain that makes the panels read filmic.</p>
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
            <p className="text-xs text-muted">Let the gradient panels (red, navy, red↔navy) drift subtly while on screen.</p>
          </div>
          <Switch
            checked={draft.style.movingGradients ?? true}
            onChange={(movingGradients) => toggleStyleFlag('movingGradients', movingGradients)}
            label="Moving gradients"
          />
        </div>
        <div className="flex items-center justify-between gap-4 rounded-xl bg-subtle px-4 py-3">
          <div>
            <p className="text-sm font-medium text-ink">Show demo images</p>
            <p className="text-xs text-muted">Use attached demo images on project slides (full-bleed / collage walls).</p>
          </div>
          <Switch
            checked={draft.style.showImages}
            onChange={(showImages) => toggleStyleFlag('showImages', showImages)}
            label="Show demo images"
          />
        </div>
      </div>

      <div className="border-t border-line pt-6">
        <label className="label">Cinematography Seed</label>
        <StepHint>
          The seed drives every deterministic variation — the background rotation, scene
          transitions, layout archetypes, kinetic-text treatments and pixel-pattern accents.
          Use the same seed to reproduce this exact cut.
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
