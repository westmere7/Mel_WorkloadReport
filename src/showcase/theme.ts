import type { CanvasPreset, PacingPreset, ShowcaseThemeId } from '../lib/showcase'

/** Pace multiplier applied identically to JS scene boundaries and CSS durations. */
export const PACE: Record<PacingPreset, number> = { fast: 0.85, normal: 1, relaxed: 1.25 }

/** Scene-to-scene cross-transition length (base ms, pace-scaled). */
export const TRANSITION_MS = 800
/** Reduced-motion variant: quicker plain crossfade. */
export const TRANSITION_MS_REDUCED = 400

export const CANVAS: Record<CanvasPreset, { w: number; h: number }> = {
  '1920x1080': { w: 1920, h: 1080 },
  '1080x1080': { w: 1080, h: 1080 },
}

/**
 * Derive the full showcase palette from the chosen main theme.
 * Red and navy are cinematic near-black rooms tinted toward the brand hue with
 * the brand colour used as LIGHT (accents/glow/blobs); white is a light gallery
 * with navy ink. All pairs keep display-size contrast ≥ 4.5:1.
 */
export function showcaseTheme(theme: ShowcaseThemeId): Record<string, string> {
  switch (theme) {
    case 'red':
      return {
        '--sc-bg': '#160309',
        '--sc-bg2': '#2a0710',
        '--sc-ink': '#fff6f6',
        '--sc-muted': 'rgba(255,235,238,.62)',
        '--sc-faint': 'rgba(255,235,238,.34)',
        '--sc-accent': '#E61E2A',
        '--sc-accent2': '#FFB81C',
        '--sc-glow': 'rgba(230,30,42,.4)',
        '--sc-blob-1': '#94121B',
        '--sc-blob-2': '#E61E2A',
        '--sc-blob-3': '#F58220',
        '--sc-bar-track': 'rgba(255,255,255,.08)',
        '--sc-card': 'rgba(255,255,255,.06)',
        '--sc-grain-opacity': '.05',
      }
    case 'navy':
      return {
        '--sc-bg': '#030318',
        '--sc-bg2': '#0e0e3f',
        '--sc-ink': '#eef0ff',
        '--sc-muted': '#a2a7cd',
        '--sc-faint': 'rgba(162,167,205,.45)',
        '--sc-accent': '#FF4D58',
        '--sc-accent2': '#FFB81C',
        '--sc-glow': 'rgba(108,123,240,.35)',
        '--sc-blob-1': '#26266F',
        '--sc-blob-2': '#4D4D8F',
        '--sc-blob-3': '#00A9CE',
        '--sc-bar-track': 'rgba(255,255,255,.08)',
        '--sc-card': 'rgba(255,255,255,.06)',
        '--sc-grain-opacity': '.05',
      }
    case 'white':
      return {
        '--sc-bg': '#f7f7fb',
        '--sc-bg2': '#ffffff',
        '--sc-ink': '#000054',
        '--sc-muted': '#6b7280',
        '--sc-faint': '#9ca3af',
        '--sc-accent': '#E61E2A',
        '--sc-accent2': '#000054',
        '--sc-glow': 'rgba(230,30,42,.15)',
        '--sc-blob-1': '#fbd0d4',
        '--sc-blob-2': '#b3b3cf',
        '--sc-blob-3': '#FFD37A',
        '--sc-bar-track': 'rgba(0,0,84,.07)',
        '--sc-card': 'rgba(0,0,84,.05)',
        '--sc-grain-opacity': '.03',
      }
  }
}
