import type { CanvasPreset, PacingPreset, ColorMode, BackgroundStyle } from '../lib/showcase'

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
 * Derive the full showcase palette from the color mode and background style.
 * Maps exact brand red (#e61e2a) and brand blue/navy (#000054).
 */
export function showcaseTheme(colorMode: ColorMode, background: BackgroundStyle): Record<string, string> {
  switch (colorMode) {
    case 'red':
      return {
        '--sc-bg': background === 'solid' ? '#e61e2a' : '#160309',
        '--sc-bg2': background === 'solid' ? '#b01219' : '#2a0710',
        '--sc-ink': '#ffffff',
        '--sc-muted': 'rgba(255,235,238,.75)',
        '--sc-faint': 'rgba(255,235,238,.45)',
        '--sc-accent': '#e61e2a',
        '--sc-accent2': '#ffb81c',
        '--sc-glow': 'rgba(230,30,42,.4)',
        '--sc-blob-1': '#94121b',
        '--sc-blob-2': '#e61e2a',
        '--sc-blob-3': '#ffb81c',
        '--sc-bar-track': 'rgba(255,255,255,.1)',
        '--sc-card': 'rgba(255,255,255,.08)',
        '--sc-grain-opacity': '.06',
      }
    case 'navy':
      return {
        '--sc-bg': background === 'solid' ? '#000054' : '#030318',
        '--sc-bg2': background === 'solid' ? '#00003b' : '#0e0e3f',
        '--sc-ink': '#ffffff',
        '--sc-muted': 'rgba(238,240,255,.75)',
        '--sc-faint': 'rgba(238,240,255,.45)',
        '--sc-accent': '#ffb81c',
        '--sc-accent2': '#e61e2a',
        '--sc-glow': 'rgba(0,0,84,.4)',
        '--sc-blob-1': '#00003b',
        '--sc-blob-2': '#000054',
        '--sc-blob-3': '#e61e2a',
        '--sc-bar-track': 'rgba(255,255,255,.1)',
        '--sc-card': 'rgba(255,255,255,.08)',
        '--sc-grain-opacity': '.06',
      }
    case 'light':
      return {
        '--sc-bg': '#ffffff',
        '--sc-bg2': '#f3f4f6',
        '--sc-ink': '#000054',
        '--sc-muted': '#4b5563',
        '--sc-faint': '#9ca3af',
        '--sc-accent': '#e61e2a',
        '--sc-accent2': '#000054',
        '--sc-glow': 'rgba(230,30,42,.15)',
        '--sc-blob-1': '#fbd0d4',
        '--sc-blob-2': '#b3b3cf',
        '--sc-blob-3': '#ffd37a',
        '--sc-bar-track': 'rgba(0,0,84,.07)',
        '--sc-card': 'rgba(0,0,84,.05)',
        '--sc-grain-opacity': '.03',
      }
    case 'gradient':
      return {
        '--sc-bg': 'linear-gradient(-45deg, #e61e2a, #000054)',
        '--sc-bg2': 'rgba(255,255,255,.1)',
        '--sc-ink': '#ffffff',
        '--sc-muted': 'rgba(255,255,255,.75)',
        '--sc-faint': 'rgba(255,255,255,.45)',
        '--sc-accent': '#ffb81c',
        '--sc-accent2': '#ffffff',
        '--sc-glow': 'rgba(255,255,255,.3)',
        '--sc-blob-1': '#94121b',
        '--sc-blob-2': '#000054',
        '--sc-blob-3': '#ffd37a',
        '--sc-bar-track': 'rgba(255,255,255,.12)',
        '--sc-card': 'rgba(255,255,255,.08)',
        '--sc-grain-opacity': '.06',
      }
  }
}
